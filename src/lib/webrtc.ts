import type {
  ChatMessage,
  Envelope,
  GameMessagePayload,
  HostAnswerBody,
  HostOfferBody,
  LogLevel,
  MeshStatus,
  PeerDiagnostic,
  PeerListItem,
  SignalDescription,
} from "../types";
import {
  ProtocolTypes,
  createEnvelope,
  isValidChatMessage,
  isValidGameMessagePayload,
  trimChatHistory,
} from "./protocol";
import {
  countIceCandidatesInSdp,
  formatIceCandidateCounts,
  packSignalDescription,
  toSessionDescription,
} from "./sdp";

interface IceGatherConfig {
  primaryTimeoutMs: number;
  fallbackMaxMs: number;
  waitForRelay: boolean;
}

interface GatherIceOptions {
  force?: boolean;
  gatherConfig?: IceGatherConfig;
}

interface MeshPeer {
  peerId: string;
  peerName: string;
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null;
  isOpen: boolean;
  initiator: boolean;
  handshakeGuest: boolean;
  iceRestartAttempts: number;
  iceRestartTimer: ReturnType<typeof setTimeout> | null;
  watchersAttached: boolean;
}

interface HelloPayload {
  peerId?: string;
  peerName?: string;
  peers?: PeerListItem[];
}

interface HistorySyncPayload {
  messages?: unknown[];
}

interface ForwardSignalPayload {
  toId: string;
  fromId: string;
  signal: SignalDescription;
}

export interface WebRtcMeshOptions {
  selfId: string;
  selfName: string;
  extendedRelayGather?: boolean;
  onPeerListChange: (peers: PeerListItem[]) => void;
  onMessage: (message: ChatMessage) => void;
  onGameMessage?: (message: GameMessagePayload) => void;
  onStatus: (status: MeshStatus) => void;
  onError?: (message: string) => void;
  onLog?: (level: LogLevel, message: string) => void;
  onDiagnostics?: (diagnostics: PeerDiagnostic[]) => void;
  onHandshakeOfferRefresh?: (offer: HostOfferBody) => void;
  getHistory: () => ChatMessage[];
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:global.stun.twilio.com:3478" },
    { urls: "stun:stun.relay.metered.ca:443" },
    {
      urls: [
        "turn:openrelay.metered.ca:80",
        "turn:openrelay.metered.ca:443",
        "turn:openrelay.metered.ca:443?transport=tcp",
        "turns:openrelay.metered.ca:443",
      ],
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: [
        "turn:relay.metered.ca:80",
        "turn:relay.metered.ca:443",
        "turn:relay.metered.ca:443?transport=tcp",
      ],
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
  iceTransportPolicy: "all",
  iceCandidatePoolSize: 10,
};

const DATA_CHANNEL_LABEL = "chat";
const ICE_GATHER_TIMEOUT_MS = 8000;
const ICE_GATHER_EXTENDED_MAX_MS = 25000;
const ICE_RESTART_DELAY_MS = 2500;
const ICE_RESTART_MAX_ATTEMPTS = 2;
const DATA_CHANNEL_LOG_INTERVAL_MS = 30000;

const DEFAULT_ICE_GATHER_CONFIG = {
  primaryTimeoutMs: ICE_GATHER_TIMEOUT_MS,
  fallbackMaxMs: ICE_GATHER_TIMEOUT_MS,
  waitForRelay: false,
};

function buildIceGatherConfig(extendedRelayGather?: boolean): IceGatherConfig {
  if (!extendedRelayGather) {
    return { ...DEFAULT_ICE_GATHER_CONFIG };
  }

  return {
    primaryTimeoutMs: ICE_GATHER_TIMEOUT_MS,
    fallbackMaxMs: ICE_GATHER_EXTENDED_MAX_MS,
    waitForRelay: true,
  };
}

function logIceCandidateSummary(
  pc: RTCPeerConnection,
  log: (level: LogLevel, message: string) => void,
  prefix: string,
  level: LogLevel = "info",
) {
  const counts = countIceCandidatesInSdp(pc.localDescription?.sdp);
  log(level, `${prefix}: ${formatIceCandidateCounts(counts)}`);
  if (counts.total === 0) {
    log("warn", "ICE: в SDP нет кандидатов — соединение между разными сетями, скорее всего, не установится");
  } else if (counts.relay === 0) {
    log(
      "warn",
      "ICE: relay-кандидатов нет — между телефоном и ПК соединение часто не устанавливается без TURN",
    );
  } else if (counts.srflx === 0) {
    log("warn", "ICE: только host и relay — srflx не получен, но relay есть");
  }
}

function shouldWaitForRelay(
  pc: RTCPeerConnection,
  elapsedMs: number,
  gatherConfig: IceGatherConfig,
) {
  if (!gatherConfig.waitForRelay) return false;
  const counts = countIceCandidatesInSdp(pc.localDescription?.sdp);
  if (counts.relay > 0) return false;
  return elapsedMs < gatherConfig.fallbackMaxMs;
}

async function waitForIceGatheringComplete(
  pc: RTCPeerConnection,
  log: (level: LogLevel, message: string) => void,
  options: GatherIceOptions = {},
) {
  const gatherConfig = options.gatherConfig ?? DEFAULT_ICE_GATHER_CONFIG;
  const force = options.force ?? false;
  const countsNow = countIceCandidatesInSdp(pc.localDescription?.sdp);

  if (
    !force &&
    pc.iceGatheringState === "complete" &&
    countsNow.total > 0 &&
    (countsNow.relay > 0 || !gatherConfig.waitForRelay)
  ) {
    logIceCandidateSummary(pc, log, "ICE: сбор завершён");
    return;
  }

  const gatherHint = gatherConfig.waitForRelay
    ? `до ${gatherConfig.primaryTimeoutMs / 1000} с, до ${gatherConfig.fallbackMaxMs / 1000} с для relay`
    : `до ${gatherConfig.primaryTimeoutMs / 1000} с`;
  log("info", `ICE: сбор сетевых кандидатов (${gatherHint})...`);

  await new Promise<void>((resolve, reject) => {
    let done = false;
    const startedAt = Date.now();
    let relayExtended = false;
    let sawEndOfCandidates = false;

    function cleanup() {
      clearTimeout(primaryTimer);
      clearTimeout(maxTimer);
      clearInterval(pollTimer);
      pc.removeEventListener("icecandidate", onIceCandidate);
      pc.removeEventListener("icegatheringstatechange", onGatheringChange);
      pc.removeEventListener("connectionstatechange", onClosed);
    }

    function finish(message: string, level: LogLevel = "info") {
      if (done) return;
      done = true;
      cleanup();
      logIceCandidateSummary(pc, log, message, level);
      resolve();
    }

    function fail(error: Error) {
      if (done) return;
      done = true;
      cleanup();
      reject(error);
    }

    function tryFinish(message: string, level: LogLevel = "warn") {
      const elapsed = Date.now() - startedAt;
      const counts = countIceCandidatesInSdp(pc.localDescription?.sdp);

      if (shouldWaitForRelay(pc, elapsed, gatherConfig)) {
        if (!relayExtended) {
          relayExtended = true;
          log(
            "info",
            `ICE: relay ещё нет — продлеваем сбор до ${gatherConfig.fallbackMaxMs / 1000} с (нужен для разных сетей)`,
          );
        }
        return;
      }

      if (
        counts.total === 0 &&
        !sawEndOfCandidates &&
        elapsed < gatherConfig.fallbackMaxMs
      ) {
        return;
      }

      finish(message, level);
    }

    function onIceCandidate(event: RTCPeerConnectionIceEvent) {
      if (event.candidate) return;
      sawEndOfCandidates = true;
      tryFinish("ICE: сбор завершён", "info");
    }

    function onGatheringChange() {
      if (pc.iceGatheringState !== "complete") return;
      sawEndOfCandidates = true;
      setTimeout(() => tryFinish("ICE: сбор завершён", "info"), 200);
    }

    const primaryTimer = setTimeout(() => {
      tryFinish(
        `ICE: таймаут ${gatherConfig.primaryTimeoutMs} мс — используем уже собранные кандидаты`,
        "warn",
      );
    }, gatherConfig.primaryTimeoutMs);

    const maxTimer = setTimeout(() => {
      tryFinish(
        `ICE: лимит ${gatherConfig.fallbackMaxMs} мс — используем уже собранные кандидаты`,
        "warn",
      );
    }, gatherConfig.fallbackMaxMs);

    const pollTimer = setInterval(() => {
      if (pc.iceGatheringState === "complete") {
        tryFinish("ICE: сбор завершён", "info");
      }
    }, 1000);

    function onClosed() {
      if (pc.connectionState === "closed") {
        fail(new Error("Сессия сброшена"));
      }
    }

    pc.addEventListener("icecandidate", onIceCandidate);
    pc.addEventListener("icegatheringstatechange", onGatheringChange);
    pc.addEventListener("connectionstatechange", onClosed);

    if (pc.iceGatheringState === "complete") {
      onGatheringChange();
    }
  });
}

function safeParse(value: string): Envelope | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export class WebRtcMesh {
  selfId: string;
  selfName: string;
  onPeerListChange: (peers: PeerListItem[]) => void;
  onMessage: (message: ChatMessage) => void;
  onGameMessage?: (message: GameMessagePayload) => void;
  onStatus: (status: MeshStatus) => void;
  onError?: (message: string) => void;
  onLog?: (level: LogLevel, message: string) => void;
  onDiagnostics?: (diagnostics: PeerDiagnostic[]) => void;
  onHandshakeOfferRefresh?: (offer: HostOfferBody) => void;
  getHistory: () => ChatMessage[];
  iceGatherConfig: IceGatherConfig;
  peerMap: Map<string, MeshPeer>;
  seenEnvelopeIds: Set<string>;
  pendingInvitePeerId: string | null;
  closed: boolean;

  constructor(options: WebRtcMeshOptions) {
    this.selfId = options.selfId;
    this.selfName = options.selfName;
    this.onPeerListChange = options.onPeerListChange;
    this.onMessage = options.onMessage;
    this.onGameMessage = options.onGameMessage;
    this.onStatus = options.onStatus;
    this.onError = options.onError;
    this.onLog = options.onLog;
    this.onDiagnostics = options.onDiagnostics;
    this.onHandshakeOfferRefresh = options.onHandshakeOfferRefresh;
    this.getHistory = options.getHistory;
    this.iceGatherConfig = buildIceGatherConfig(options.extendedRelayGather);

    this.peerMap = new Map();
    this.seenEnvelopeIds = new Set();
    this.pendingInvitePeerId = null;
    this.closed = false;
  }

  log(level: LogLevel, message: string) {
    this.onLog?.(level, message);
  }

  gatherIce(pc: RTCPeerConnection, options: Omit<GatherIceOptions, "gatherConfig"> = {}) {
    return waitForIceGatheringComplete(pc, this.log.bind(this), {
      ...options,
      gatherConfig: this.iceGatherConfig,
    });
  }

  setSelfName(nextName: string) {
    this.selfName = nextName;
    this.log("info", `Ник обновлён: ${nextName}`);
  }

  isPeerReady(peer: MeshPeer | null | undefined) {
    return Boolean(peer?.isOpen || peer?.dc?.readyState === "open");
  }

  syncPeerReady(peer: MeshPeer | null | undefined) {
    if (!peer) return false;
    if (peer.dc?.readyState === "open" && !peer.isOpen) {
      this.onDataChannelOpen(peer);
    }
    return this.isPeerReady(peer);
  }

  getDiagnostics(): PeerDiagnostic[] {
    return [...this.peerMap.values()].map((peer) => ({
      peerId: peer.peerId,
      peerName: peer.peerName,
      ice: peer.pc.iceConnectionState,
      connection: peer.pc.connectionState,
      gathering: peer.pc.iceGatheringState,
      dc: peer.dc?.readyState ?? "none",
      ready: this.isPeerReady(peer),
    }));
  }

  publishDiagnostics() {
    this.onDiagnostics?.(this.getDiagnostics());
  }

  listPeers(): PeerListItem[] {
    return [...this.peerMap.values()]
      .filter((peer) => this.syncPeerReady(peer))
      .map((peer) => ({
        id: peer.peerId,
        name: peer.peerName || peer.peerId,
      }));
  }

  dispose() {
    this.closed = true;
    this.pendingInvitePeerId = null;
    this.log("info", "Сессия WebRTC закрыта");
    for (const peer of this.peerMap.values()) {
      peer.pc.close();
    }
    this.peerMap.clear();
    this.publishDiagnostics();
    this.notifyPeers();
  }

  clearInvitePeers() {
    for (const [peerId, peer] of [...this.peerMap.entries()]) {
      if (!peerId.startsWith("invite-")) continue;
      peer.pc.close();
      this.peerMap.delete(peerId);
      this.log("info", `Сброшено старое приглашение: ${peerId}`);
    }
    this.pendingInvitePeerId = null;
  }

  async createHostOffer(): Promise<HostOfferBody> {
    this.clearInvitePeers();

    const tempPeerId = `invite-${crypto.randomUUID()}`;
    this.pendingInvitePeerId = tempPeerId;
    this.log("info", "Хост: создание приглашения");

    const peer = this.ensurePeer(tempPeerId, true, "");
    const offer = await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offer);
    this.log("info", "Хост: local offer установлен");
    await this.gatherIce(peer.pc);
    this.publishDiagnostics();

    return {
      hostId: this.selfId,
      hostName: this.selfName,
      signal: packSignalDescription(peer.pc.localDescription)!,
    };
  }

  async acceptHostOffer(payload: HostOfferBody): Promise<HostAnswerBody> {
    const hostId = payload?.hostId;
    if (!hostId || !payload?.signal) {
      throw new Error("Некорректное приглашение хоста");
    }

    const existing = this.peerMap.get(hostId);
    if (existing?.handshakeGuest) {
      return this.acceptHostOfferUpdate(payload, existing);
    }

    this.log("info", `Гость: принятие приглашения от ${payload.hostName || hostId}`);

    const peer = this.ensurePeer(hostId, false, payload.hostName || "Host");
    peer.handshakeGuest = true;
    await peer.pc.setRemoteDescription(toSessionDescription(payload.signal));
    this.log("info", "Гость: remote offer установлен");

    const answer = await peer.pc.createAnswer();
    await peer.pc.setLocalDescription(answer);
    this.log("info", "Гость: local answer установлен");
    await this.gatherIce(peer.pc);
    this.publishDiagnostics();

    void this.waitForDataChannel(peer).then(() => {
      peer.handshakeGuest = false;
      this.log("info", "Гость: канал данных открыт");
      this.notifyPeers();
    }).catch((error) => {
      if (error instanceof Error && error.message === "Сессия сброшена") return;
      this.log(
        "warn",
        `Гость: ожидание канала прервано (${error instanceof Error ? error.message : "ошибка"})`,
      );
    });

    return {
      targetHostId: hostId,
      guestId: this.selfId,
      guestName: this.selfName,
      signal: packSignalDescription(peer.pc.localDescription)!,
    };
  }

  async acceptHostOfferUpdate(payload: HostOfferBody, peer: MeshPeer): Promise<HostAnswerBody> {
    const hostId = payload?.hostId;
    if (!hostId || !payload?.signal || !peer) {
      throw new Error("Некорректное обновление приглашения");
    }

    this.log("info", `Гость: обновление приглашения (ICE restart) от ${payload.hostName || hostId}`);
    peer.handshakeGuest = true;
    peer.iceRestartAttempts = 0;

    try {
      await peer.pc.setRemoteDescription(toSessionDescription(payload.signal));
    } catch (error) {
      this.log("warn", "Гость: сбой обновления SDP — пересоздаём соединение");
      if (peer.iceRestartTimer) clearTimeout(peer.iceRestartTimer);
      peer.pc.close();
      this.peerMap.delete(hostId);
      return this.acceptHostOffer(payload);
    }
    const answer = await peer.pc.createAnswer();
    await peer.pc.setLocalDescription(answer);
    await this.gatherIce(peer.pc, { force: true });
    this.publishDiagnostics();

    void this.waitForDataChannel(peer).then(() => {
      peer.handshakeGuest = false;
      this.log("info", "Гость: канал данных открыт");
      this.notifyPeers();
    }).catch((error) => {
      if (error instanceof Error && error.message === "Сессия сброшена") return;
      this.log(
        "warn",
        `Гость: ожидание канала прервано (${error instanceof Error ? error.message : "ошибка"})`,
      );
    });

    return {
      targetHostId: hostId,
      guestId: this.selfId,
      guestName: this.selfName,
      signal: packSignalDescription(peer.pc.localDescription)!,
    };
  }

  async completeHostHandshake(payload: HostAnswerBody): Promise<void> {
    const guestId = payload?.guestId;
    if (!guestId || !payload?.signal) {
      throw new Error("Некорректный ответ гостя");
    }

    const existingPeer = this.peerMap.get(guestId);
    if (existingPeer) {
      this.log("info", `Хост: обновление ответа от ${payload.guestName || guestId} (ICE restart)`);
      existingPeer.iceRestartAttempts = 0;
      if (existingPeer.iceRestartTimer) {
        clearTimeout(existingPeer.iceRestartTimer);
        existingPeer.iceRestartTimer = null;
      }
      await existingPeer.pc.setRemoteDescription(toSessionDescription(payload.signal));
      this.publishDiagnostics();
      this.startDataChannelWait(existingPeer);
      return;
    }

    const invitePeerId = this.pendingInvitePeerId;
    const invitePeer = invitePeerId ? this.peerMap.get(invitePeerId) : null;

    if (!invitePeer) {
      throw new Error("Нет активного приглашения. Создайте приглашение заново.");
    }

    this.log("info", `Хост: применение ответа от ${payload.guestName || guestId}`);

    this.peerMap.delete(invitePeer.peerId);
    invitePeer.peerId = guestId;
    invitePeer.peerName = payload.guestName || guestId;
    invitePeer.iceRestartAttempts = 0;
    this.peerMap.set(guestId, invitePeer);
    this.pendingInvitePeerId = null;

    await invitePeer.pc.setRemoteDescription(toSessionDescription(payload.signal));
    this.log("info", "Хост: remote answer установлен, ожидание канала данных...");
    this.publishDiagnostics();
    this.startDataChannelWait(invitePeer);
  }

  startDataChannelWait(peer: MeshPeer) {
    const failCheck = setTimeout(() => {
      if (this.closed || this.isPeerReady(peer)) return;
      const ice = peer.pc.iceConnectionState;
      const pc = peer.pc.connectionState;
      if (ice === "failed" || pc === "failed" || ice === "disconnected") {
        this.scheduleHostIceRestart(peer);
      }
    }, 8000);

    void this.waitForDataChannel(peer).then(() => {
      clearTimeout(failCheck);
      this.log("info", "Хост: канал данных открыт");
      this.notifyPeers();
    }).catch((error) => {
      clearTimeout(failCheck);
      if (error instanceof Error && error.message === "Сессия сброшена") return;
      this.log(
        "warn",
        `Хост: ожидание канала прервано (${error instanceof Error ? error.message : "ошибка"})`,
      );
    });
  }

  async connectToKnownPeer(peerId: string, peerName: string) {
    if (!peerId || peerId === this.selfId || this.peerMap.has(peerId)) return;
    const peer = this.ensurePeer(peerId, true, peerName || peerId);
    const offer = await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offer);
    await this.gatherIce(peer.pc);

    this.broadcastEnvelope(
      createEnvelope(ProtocolTypes.forwardSignal, {
        toId: peerId,
        fromId: this.selfId,
        signal: peer.pc.localDescription,
      }),
      null,
    );
  }

  sendChatMessage(message: ChatMessage) {
    this.broadcastEnvelope(createEnvelope(ProtocolTypes.chatMessage, message), null);
  }

  sendGameMessage(message: GameMessagePayload) {
    this.broadcastEnvelope(createEnvelope(ProtocolTypes.gameMessage, message), null);
  }

  waitForDataChannel(peer: MeshPeer): Promise<void> {
    if (this.syncPeerReady(peer)) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      let done = false;
      let attempt = 0;
      let logTimer: ReturnType<typeof setInterval>;

      const finish = (error?: Error) => {
        if (done) return;
        done = true;
        clearInterval(logTimer);
        peer.pc.removeEventListener("connectionstatechange", onConnectionChange);
        peer.pc.removeEventListener("iceconnectionstatechange", onConnectionChange);
        peer.pc.removeEventListener("datachannel", onDataChannel);
        if (peer.dc) {
          peer.dc.removeEventListener("open", onChannelOpen);
        }
        this.publishDiagnostics();
        if (error) reject(error);
        else resolve();
      };

      logTimer = setInterval(() => {
        if (this.closed) {
          finish(new Error("Сессия сброшена"));
          return;
        }
        attempt += 1;
        this.log(
          "info",
          `Ожидание канала (${peer.peerName || peer.peerId}), попытка ${attempt}: ICE=${peer.pc.iceConnectionState}, PC=${peer.pc.connectionState}, DC=${peer.dc?.readyState ?? "none"}`,
        );
        this.publishDiagnostics();
        this.syncPeerReady(peer);
        if (this.isPeerReady(peer)) {
          finish();
        }
      }, DATA_CHANNEL_LOG_INTERVAL_MS);

      const onChannelOpen = () => {
        this.log("info", `Канал данных открыт (${peer.peerName || peer.peerId})`);
        this.syncPeerReady(peer);
        finish();
      };

      const onConnectionChange = () => {
        this.publishDiagnostics();

        if (peer.pc.connectionState === "closed" || this.closed) {
          finish(new Error("Сессия сброшена"));
          return;
        }

        if (peer.pc.iceConnectionState === "failed" || peer.pc.connectionState === "failed") {
          this.log(
            "warn",
            `Соединение failed (${peer.peerName || peer.peerId}), продолжаем ожидание — или сбросьте сессию`,
          );
          if (peer.initiator) {
            this.scheduleHostIceRestart(peer);
          }
          return;
        }

        if (peer.pc.iceConnectionState === "connected" || peer.pc.iceConnectionState === "completed") {
          this.log("info", `ICE подключён (${peer.peerName || peer.peerId})`);
          this.syncPeerReady(peer);
          if (this.isPeerReady(peer)) {
            finish();
            return;
          }
        }

        this.syncPeerReady(peer);
        if (this.isPeerReady(peer)) {
          finish();
        }
      };

      const onDataChannel = (event: RTCDataChannelEvent) => {
        this.attachDataChannel(peer, event.channel);
        if (peer.dc?.readyState === "open") {
          onChannelOpen();
        } else {
          peer.dc?.addEventListener("open", onChannelOpen, { once: true });
        }
      };

      if (peer.dc) {
        peer.dc.addEventListener("open", onChannelOpen, { once: true });
      } else {
        peer.pc.addEventListener("datachannel", onDataChannel);
      }

      peer.pc.addEventListener("connectionstatechange", onConnectionChange);
      peer.pc.addEventListener("iceconnectionstatechange", onConnectionChange);
      onConnectionChange();
    });
  }

  scheduleHostIceRestart(peer: MeshPeer) {
    if (this.closed || this.isPeerReady(peer) || !peer.initiator) return;
    if ((peer.iceRestartAttempts ?? 0) >= ICE_RESTART_MAX_ATTEMPTS) return;
    if (peer.iceRestartTimer) return;

    peer.iceRestartTimer = setTimeout(() => {
      peer.iceRestartTimer = null;
      void this.refreshHostOffer(peer);
    }, ICE_RESTART_DELAY_MS);
  }

  async refreshHostOffer(peer: MeshPeer) {
    if (this.closed || this.isPeerReady(peer) || !peer.initiator) return;
    if ((peer.iceRestartAttempts ?? 0) >= ICE_RESTART_MAX_ATTEMPTS) return;

    peer.iceRestartAttempts += 1;

    try {
      const state = peer.pc.signalingState;
      this.log(
        "warn",
        `Хост: ICE restart (${peer.iceRestartAttempts}/${ICE_RESTART_MAX_ATTEMPTS}), SDP=${state}`,
      );

      if (state !== "stable" && state !== "have-local-offer") {
        this.log("warn", `Хост: ICE restart пропущен — состояние SDP: ${state}`);
        return;
      }

      peer.pc.restartIce();
      const offer = await peer.pc.createOffer({ iceRestart: true });
      await peer.pc.setLocalDescription(offer);
      await this.gatherIce(peer.pc, { force: true });

      let counts = countIceCandidatesInSdp(peer.pc.localDescription?.sdp);
      if (counts.total === 0) {
        this.log("warn", "Хост: ICE restart дал пустой SDP — пересоздаём peer");
        await this.recreateHostPeerOffer(peer);
        return;
      }

      this.publishDiagnostics();
      this.onHandshakeOfferRefresh?.({
        hostId: this.selfId,
        hostName: this.selfName,
        signal: packSignalDescription(peer.pc.localDescription)!,
      });
      this.log("info", "Хост: новое приглашение готово — передайте его гостю и вставьте новый ответ");
    } catch (error) {
      this.log(
        "error",
        `Хост: ICE restart не удался (${error instanceof Error ? error.message : "ошибка"})`,
      );
    }
  }

  async recreateHostPeerOffer(oldPeer: MeshPeer) {
    const { peerId, peerName } = oldPeer;
    if (oldPeer.iceRestartTimer) {
      clearTimeout(oldPeer.iceRestartTimer);
      oldPeer.iceRestartTimer = null;
    }

    oldPeer.pc.close();
    this.peerMap.delete(peerId);
    if (this.pendingInvitePeerId === peerId) {
      this.pendingInvitePeerId = null;
    }

    const peer = this.ensurePeer(peerId, true, peerName);
    const offer = await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offer);
    await this.gatherIce(peer.pc, { force: true });
    this.publishDiagnostics();

    this.onHandshakeOfferRefresh?.({
      hostId: this.selfId,
      hostName: this.selfName,
      signal: packSignalDescription(peer.pc.localDescription)!,
    });
    this.log("info", "Хост: peer пересоздан — передайте новое приглашение гостю");
    this.startDataChannelWait(peer);
  }

  attachPeerWatchers(peer: MeshPeer) {
    if (peer.watchersAttached) return;
    peer.watchersAttached = true;

    const logState = (prefix: string) => {
      this.log(
        "debug",
        `${prefix} ${peer.peerName || peer.peerId}: ICE=${peer.pc.iceConnectionState}, PC=${peer.pc.connectionState}, DC=${peer.dc?.readyState ?? "none"}`,
      );
      this.publishDiagnostics();
      this.syncPeerReady(peer);
      this.notifyPeers();
    };

    peer.pc.addEventListener("iceconnectionstatechange", () => {
      const state = peer.pc.iceConnectionState;
      if (state === "failed") {
        this.log(
          "warn",
          `ICE failed (${peer.peerName || peer.peerId}), ожидаем — или нажмите «Сбросить сессию»`,
        );
        if (peer.initiator) {
          this.scheduleHostIceRestart(peer);
        } else if (peer.handshakeGuest) {
          this.log("info", "Гость: дождитесь обновлённого приглашения от хоста");
        }
        logState("ICE change:");
        return;
      }
      if (state === "connected" || state === "completed") {
        this.log("info", `ICE ${state} (${peer.peerName || peer.peerId})`);
      }
      logState("ICE change:");
    });

    peer.pc.addEventListener("icegatheringstatechange", () => {
      logState("ICE gather:");
    });

    peer.pc.addEventListener("connectionstatechange", () => {
      if (peer.pc.connectionState === "closed" || this.closed) {
        this.log("info", `PC closed (${peer.peerName || peer.peerId})`);
        this.peerMap.delete(peer.peerId);
        if (this.pendingInvitePeerId === peer.peerId) {
          this.pendingInvitePeerId = null;
        }
        this.notifyPeers();
        return;
      }
      if (peer.pc.connectionState === "failed") {
        this.log(
          "warn",
          `PC failed (${peer.peerName || peer.peerId}), ожидаем — или нажмите «Сбросить сессию»`,
        );
        if (peer.initiator) {
          this.scheduleHostIceRestart(peer);
        } else if (peer.handshakeGuest) {
          this.log("info", "Гость: дождитесь обновлённого приглашения от хоста");
        }
        logState("PC change:");
        return;
      }
      if (peer.pc.connectionState === "connected") {
        this.log("info", `PC connected (${peer.peerName || peer.peerId})`);
      }
      logState("PC change:");
    });
  }

  ensurePeer(peerId: string, initiator: boolean, peerName = ""): MeshPeer {
    const existing = this.peerMap.get(peerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection(RTC_CONFIG);
    const peer: MeshPeer = {
      peerId,
      peerName,
      pc,
      dc: null,
      isOpen: false,
      initiator,
      handshakeGuest: false,
      iceRestartAttempts: 0,
      iceRestartTimer: null,
      watchersAttached: false,
    };

    this.log("info", `Peer создан: ${peerName || peerId} (${initiator ? "инициатор" : "гость"})`);

    if (initiator) {
      const dc = pc.createDataChannel(DATA_CHANNEL_LABEL, { ordered: true });
      this.attachDataChannel(peer, dc);
    } else {
      pc.addEventListener("datachannel", (event) => {
        if (event.channel.label !== DATA_CHANNEL_LABEL) return;
        this.log("info", `Получен data channel от ${peerName || peerId}`);
        this.attachDataChannel(peer, event.channel);
      });
    }

    this.attachPeerWatchers(peer);
    this.peerMap.set(peerId, peer);
    this.publishDiagnostics();
    this.notifyPeers();
    return peer;
  }

  onDataChannelOpen(peer: MeshPeer) {
    if (peer.isOpen) return;

    peer.isOpen = true;
    peer.handshakeGuest = false;
    this.log("info", `Канал чата активен с ${peer.peerName || peer.peerId}`);
    this.notifyPeers();
    this.sendDirect(peer, createEnvelope(ProtocolTypes.hello, {
      peerId: this.selfId,
      peerName: this.selfName,
      peers: this.listPeers(),
    }));

    this.sendDirect(peer, createEnvelope(ProtocolTypes.historySync, {
      messages: trimChatHistory(this.getHistory(), 100),
    }));
  }

  attachDataChannel(peer: MeshPeer, dc: RTCDataChannel) {
    if (peer.dc && peer.dc !== dc) {
      peer.dc.close();
    }

    peer.dc = dc;

    dc.addEventListener("close", () => {
      peer.isOpen = false;
      this.log("warn", `Канал закрыт (${peer.peerName || peer.peerId})`);
      this.notifyPeers();
    });

    dc.addEventListener("message", (event) => {
      this.syncPeerReady(peer);
      this.handleIncomingEnvelope(peer.peerId, safeParse(String(event.data)));
    });

    if (dc.readyState === "open") {
      this.onDataChannelOpen(peer);
    } else {
      dc.addEventListener("open", () => this.onDataChannelOpen(peer), { once: true });
    }

    this.publishDiagnostics();
  }

  sendDirect(peer: MeshPeer, envelope: Envelope) {
    this.syncPeerReady(peer);
    if (!peer?.dc || peer.dc.readyState !== "open") return;
    peer.dc.send(JSON.stringify(envelope));
  }

  broadcastEnvelope(envelope: Envelope, exceptPeerId: string | null) {
    this.seenEnvelopeIds.add(envelope.id);
    for (const peer of this.peerMap.values()) {
      if (!this.syncPeerReady(peer)) continue;
      if (peer.peerId === exceptPeerId) continue;
      this.sendDirect(peer, envelope);
    }
  }

  async handleIncomingEnvelope(fromPeerId: string, envelope: Envelope | null) {
    if (!envelope?.id || this.seenEnvelopeIds.has(envelope.id)) return;
    this.seenEnvelopeIds.add(envelope.id);

    if (envelope.type === ProtocolTypes.chatMessage) {
      if (isValidChatMessage(envelope.payload)) {
        this.onMessage(envelope.payload);
        this.broadcastEnvelope(envelope, fromPeerId);
      }
      return;
    }

    if (envelope.type === ProtocolTypes.gameMessage) {
      if (isValidGameMessagePayload(envelope.payload) && envelope.payload.senderId !== this.selfId) {
        this.onGameMessage?.(envelope.payload);
      }
      this.broadcastEnvelope(envelope, fromPeerId);
      return;
    }

    if (envelope.type === ProtocolTypes.historySync) {
      const payload = envelope.payload as HistorySyncPayload;
      const messages = Array.isArray(payload.messages)
        ? payload.messages.filter(isValidChatMessage)
        : [];
      this.log("info", `Синхронизация истории: ${messages.length} сообщений`);
      for (const message of messages) {
        this.onMessage(message);
      }
      return;
    }

    if (envelope.type === ProtocolTypes.hello) {
      const payload = envelope.payload as HelloPayload;
      this.log("info", `Hello от ${payload.peerName || fromPeerId}`);
      const peer = this.peerMap.get(fromPeerId);
      if (peer && payload.peerName) {
        peer.peerName = payload.peerName;
      }

      const peers = Array.isArray(payload.peers) ? payload.peers : [];
      for (const knownPeer of peers) {
        const peerId = knownPeer?.id;
        if (!peerId || peerId === this.selfId || this.peerMap.has(peerId)) continue;
        if (this.selfId < peerId) {
          await this.connectToKnownPeer(peerId, knownPeer?.name || peerId);
        }
      }

      this.notifyPeers();
      return;
    }

    if (envelope.type !== ProtocolTypes.forwardSignal) return;

    const { toId, fromId, signal } = (envelope.payload as Partial<ForwardSignalPayload>) || {};
    if (!toId || !fromId || !signal) return;

    if (toId !== this.selfId) {
      this.broadcastEnvelope(envelope, fromPeerId);
      return;
    }

    const isOffer = signal.type === "offer";
    const peer = this.ensurePeer(fromId, false, fromId);

    try {
      await peer.pc.setRemoteDescription(toSessionDescription(signal));
      if (isOffer) {
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        await this.gatherIce(peer.pc);

        this.broadcastEnvelope(
          createEnvelope(ProtocolTypes.forwardSignal, {
            toId: fromId,
            fromId: this.selfId,
            signal: peer.pc.localDescription,
          }),
          null,
        );
      }
    } catch (error) {
      this.onError?.(error instanceof Error ? error.message : "WebRTC signal failed");
    }
  }

  notifyPeers() {
    const peers = this.listPeers();
    this.onPeerListChange(peers);
    this.onStatus(peers.length === 0 ? "offline" : "connected");
    this.publishDiagnostics();
  }
}
