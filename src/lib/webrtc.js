import {
  ProtocolTypes,
  createEnvelope,
  isValidChatMessage,
  trimChatHistory,
} from "./protocol";
import { packSignalDescription, toSessionDescription } from "./sdp";

const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:global.stun.twilio.com:3478" },
    {
      urls: [
        "turn:openrelay.metered.ca:80",
        "turn:openrelay.metered.ca:443",
        "turn:openrelay.metered.ca:443?transport=tcp",
      ],
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
  iceTransportPolicy: "all",
  iceCandidatePoolSize: 4,
};

const DATA_CHANNEL_LABEL = "chat";
const DATA_CHANNEL_TIMEOUT_MS = 30000;
const ICE_GATHER_TIMEOUT_MS = 8000;

async function waitForIceGatheringComplete(pc, log, timeoutMs = ICE_GATHER_TIMEOUT_MS) {
  if (pc.iceGatheringState === "complete") {
    log("info", "ICE: сбор кандидатов завершён");
    return;
  }

  log("info", "ICE: сбор сетевых кандидатов...");

  await new Promise((resolve) => {
    let done = false;

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      pc.removeEventListener("icegatheringstatechange", onChange);
      log("warn", `ICE: таймаут ${timeoutMs} мс — используем уже собранные кандидаты`);
      resolve();
    }, timeoutMs);

    function onChange() {
      if (pc.iceGatheringState !== "complete" || done) return;
      done = true;
      clearTimeout(timer);
      pc.removeEventListener("icegatheringstatechange", onChange);
      log("info", "ICE: сбор кандидатов завершён");
      resolve();
    }

    pc.addEventListener("icegatheringstatechange", onChange);
  });
}

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export class WebRtcMesh {
  constructor(options) {
    this.selfId = options.selfId;
    this.selfName = options.selfName;
    this.onPeerListChange = options.onPeerListChange;
    this.onMessage = options.onMessage;
    this.onStatus = options.onStatus;
    this.onError = options.onError;
    this.onLog = options.onLog;
    this.onDiagnostics = options.onDiagnostics;
    this.getHistory = options.getHistory;

    this.peerMap = new Map();
    this.seenEnvelopeIds = new Set();
    this.pendingInvitePeerId = null;
    this.closed = false;
  }

  log(level, message) {
    this.onLog?.(level, message);
  }

  setSelfName(nextName) {
    this.selfName = nextName;
    this.log("info", `Ник обновлён: ${nextName}`);
  }

  isPeerReady(peer) {
    return Boolean(peer?.isOpen || peer?.dc?.readyState === "open");
  }

  syncPeerReady(peer) {
    if (!peer) return false;
    if (peer.dc?.readyState === "open" && !peer.isOpen) {
      this.onDataChannelOpen(peer);
    }
    return this.isPeerReady(peer);
  }

  getDiagnostics() {
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

  listPeers() {
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

  async createHostOffer() {
    this.clearInvitePeers();

    const tempPeerId = `invite-${crypto.randomUUID()}`;
    this.pendingInvitePeerId = tempPeerId;
    this.log("info", "Хост: создание приглашения");

    const peer = this.ensurePeer(tempPeerId, true, "");
    const offer = await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offer);
    this.log("info", "Хост: local offer установлен");
    await waitForIceGatheringComplete(peer.pc, this.log.bind(this));
    this.publishDiagnostics();

    return {
      hostId: this.selfId,
      hostName: this.selfName,
      signal: packSignalDescription(peer.pc.localDescription),
    };
  }

  async acceptHostOffer(payload) {
    const hostId = payload?.hostId;
    if (!hostId || !payload?.signal) {
      throw new Error("Некорректное приглашение хоста");
    }

    this.log("info", `Гость: принятие приглашения от ${payload.hostName || hostId}`);

    const peer = this.ensurePeer(hostId, false, payload.hostName || "Host");
    await peer.pc.setRemoteDescription(toSessionDescription(payload.signal));
    this.log("info", "Гость: remote offer установлен");

    const answer = await peer.pc.createAnswer();
    await peer.pc.setLocalDescription(answer);
    this.log("info", "Гость: local answer установлен");
    await waitForIceGatheringComplete(peer.pc, this.log.bind(this));
    this.publishDiagnostics();

    return {
      targetHostId: hostId,
      guestId: this.selfId,
      guestName: this.selfName,
      signal: packSignalDescription(peer.pc.localDescription),
    };
  }

  async completeHostHandshake(payload) {
    const guestId = payload?.guestId;
    if (!guestId || !payload?.signal) {
      throw new Error("Некорректный ответ гостя");
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
    this.peerMap.set(guestId, invitePeer);
    this.pendingInvitePeerId = null;

    await invitePeer.pc.setRemoteDescription(toSessionDescription(payload.signal));
    this.log("info", "Хост: remote answer установлен, ожидание канала данных...");
    this.publishDiagnostics();

    await this.waitForDataChannel(invitePeer);
    this.log("info", "Хост: канал данных открыт");
    this.notifyPeers();
  }

  async connectToKnownPeer(peerId, peerName) {
    if (!peerId || peerId === this.selfId || this.peerMap.has(peerId)) return;
    const peer = this.ensurePeer(peerId, true, peerName || peerId);
    const offer = await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offer);
    await waitForIceGatheringComplete(peer.pc, this.log.bind(this));

    this.broadcastEnvelope(
      createEnvelope(ProtocolTypes.forwardSignal, {
        toId: peerId,
        fromId: this.selfId,
        signal: peer.pc.localDescription,
      }),
      null,
    );
  }

  sendChatMessage(message) {
    this.broadcastEnvelope(createEnvelope(ProtocolTypes.chatMessage, message), null);
  }

  waitForDataChannel(peer, timeoutMs = DATA_CHANNEL_TIMEOUT_MS) {
    if (this.syncPeerReady(peer)) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      let done = false;

      const finish = (error) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
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

      const onChannelOpen = () => {
        this.log("info", `Канал данных открыт (${peer.peerName || peer.peerId})`);
        this.syncPeerReady(peer);
        finish();
      };

      const onConnectionChange = () => {
        this.publishDiagnostics();

        if (peer.pc.iceConnectionState === "connected" || peer.pc.iceConnectionState === "completed") {
          this.log("info", `ICE подключён (${peer.peerName || peer.peerId})`);
          this.syncPeerReady(peer);
          if (this.isPeerReady(peer)) {
            finish();
            return;
          }
        }

        if (peer.pc.connectionState === "failed" || peer.pc.connectionState === "closed") {
          finish(new Error("WebRTC: соединение не установлено"));
          return;
        }

        this.syncPeerReady(peer);
        if (this.isPeerReady(peer)) {
          finish();
        }
      };

      const onDataChannel = (event) => {
        this.attachDataChannel(peer, event.channel);
        if (peer.dc?.readyState === "open") {
          onChannelOpen();
        } else {
          peer.dc?.addEventListener("open", onChannelOpen, { once: true });
        }
      };

      const timer = setTimeout(() => {
        finish(new Error("Таймаут канала данных. Проверьте интернет и попробуйте снова."));
      }, timeoutMs);

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

  attachPeerWatchers(peer) {
    if (peer.watchersAttached) return;
    peer.watchersAttached = true;

    const logState = (prefix) => {
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
        this.log("error", `ICE failed (${peer.peerName || peer.peerId})`);
        this.onError("P2P-соединение не установлено. Начните подключение заново.");
        this.peerMap.delete(peer.peerId);
        this.notifyPeers();
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
      if (peer.pc.connectionState === "failed" || peer.pc.connectionState === "closed") {
        this.log("warn", `PC ${peer.pc.connectionState} (${peer.peerName || peer.peerId})`);
        this.peerMap.delete(peer.peerId);
        if (this.pendingInvitePeerId === peer.peerId) {
          this.pendingInvitePeerId = null;
        }
        this.notifyPeers();
        return;
      }
      if (peer.pc.connectionState === "connected") {
        this.log("info", `PC connected (${peer.peerName || peer.peerId})`);
      }
      logState("PC change:");
    });
  }

  ensurePeer(peerId, initiator, peerName = "") {
    const existing = this.peerMap.get(peerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection(RTC_CONFIG);
    const peer = {
      peerId,
      peerName,
      pc,
      dc: null,
      isOpen: false,
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

  onDataChannelOpen(peer) {
    if (peer.isOpen) return;

    peer.isOpen = true;
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

  attachDataChannel(peer, dc) {
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
      this.handleIncomingEnvelope(peer.peerId, safeParse(event.data));
    });

    if (dc.readyState === "open") {
      this.onDataChannelOpen(peer);
    } else {
      dc.addEventListener("open", () => this.onDataChannelOpen(peer), { once: true });
    }

    this.publishDiagnostics();
  }

  sendDirect(peer, envelope) {
    this.syncPeerReady(peer);
    if (!peer?.dc || peer.dc.readyState !== "open") return;
    peer.dc.send(JSON.stringify(envelope));
  }

  broadcastEnvelope(envelope, exceptPeerId) {
    this.seenEnvelopeIds.add(envelope.id);
    for (const peer of this.peerMap.values()) {
      if (!this.syncPeerReady(peer)) continue;
      if (peer.peerId === exceptPeerId) continue;
      this.sendDirect(peer, envelope);
    }
  }

  async handleIncomingEnvelope(fromPeerId, envelope) {
    if (!envelope?.id || this.seenEnvelopeIds.has(envelope.id)) return;
    this.seenEnvelopeIds.add(envelope.id);

    if (envelope.type === ProtocolTypes.chatMessage) {
      if (isValidChatMessage(envelope.payload)) {
        this.onMessage(envelope.payload);
        this.broadcastEnvelope(envelope, fromPeerId);
      }
      return;
    }

    if (envelope.type === ProtocolTypes.historySync) {
      const messages = Array.isArray(envelope?.payload?.messages)
        ? envelope.payload.messages.filter(isValidChatMessage)
        : [];
      this.log("info", `Синхронизация истории: ${messages.length} сообщений`);
      for (const message of messages) {
        this.onMessage(message);
      }
      return;
    }

    if (envelope.type === ProtocolTypes.hello) {
      this.log("info", `Hello от ${envelope.payload?.peerName || fromPeerId}`);
      const peer = this.peerMap.get(fromPeerId);
      if (peer && envelope.payload?.peerName) {
        peer.peerName = envelope.payload.peerName;
      }

      const peers = Array.isArray(envelope.payload?.peers)
        ? envelope.payload.peers
        : [];
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

    const { toId, fromId, signal } = envelope.payload || {};
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
        await waitForIceGatheringComplete(peer.pc, this.log.bind(this));

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
      this.onError(error instanceof Error ? error.message : "WebRTC signal failed");
    }
  }

  notifyPeers() {
    const peers = this.listPeers();
    this.onPeerListChange(peers);
    this.onStatus(peers.length === 0 ? "offline" : "connected");
    this.publishDiagnostics();
  }
}
