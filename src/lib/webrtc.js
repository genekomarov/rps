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
  ],
};

const DATA_CHANNEL_LABEL = "chat";
const DATA_CHANNEL_TIMEOUT_MS = 20000;

async function waitForIceGatheringComplete(pc, timeoutMs = 6000) {
  if (pc.iceGatheringState === "complete") return;

  await new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      pc.removeEventListener("icegatheringstatechange", onChange);
      resolve();
    }, timeoutMs);

    function onChange() {
      if (pc.iceGatheringState !== "complete" || done) return;
      done = true;
      clearTimeout(timer);
      pc.removeEventListener("icegatheringstatechange", onChange);
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
    this.getHistory = options.getHistory;

    this.peerMap = new Map();
    this.seenEnvelopeIds = new Set();
    this.pendingInvitePeerId = null;
    this.closed = false;
  }

  setSelfName(nextName) {
    this.selfName = nextName;
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
    for (const peer of this.peerMap.values()) {
      peer.pc.close();
    }
    this.peerMap.clear();
    this.notifyPeers();
  }

  clearInvitePeers() {
    for (const [peerId, peer] of [...this.peerMap.entries()]) {
      if (!peerId.startsWith("invite-")) continue;
      peer.pc.close();
      this.peerMap.delete(peerId);
    }
    this.pendingInvitePeerId = null;
  }

  async createHostOffer() {
    this.clearInvitePeers();

    const tempPeerId = `invite-${crypto.randomUUID()}`;
    this.pendingInvitePeerId = tempPeerId;

    const peer = this.ensurePeer(tempPeerId, true, "");
    const offer = await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offer);
    await waitForIceGatheringComplete(peer.pc);

    return {
      hostId: this.selfId,
      hostName: this.selfName,
      signal: packSignalDescription(peer.pc.localDescription),
    };
  }

  async acceptHostOffer(payload) {
    const hostId = payload?.hostId;
    if (!hostId || !payload?.signal) {
      throw new Error("Invalid host offer payload");
    }

    const peer = this.ensurePeer(hostId, false, payload.hostName || "Host");
    await peer.pc.setRemoteDescription(toSessionDescription(payload.signal));

    const answer = await peer.pc.createAnswer();
    await peer.pc.setLocalDescription(answer);
    await waitForIceGatheringComplete(peer.pc);
    await this.waitForDataChannel(peer);

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
      throw new Error("Invalid answer payload");
    }

    const invitePeerId = this.pendingInvitePeerId;
    const invitePeer = invitePeerId ? this.peerMap.get(invitePeerId) : null;

    if (!invitePeer) {
      throw new Error("Нет активного приглашения. Сгенерируйте приглашение заново.");
    }

    this.peerMap.delete(invitePeer.peerId);
    invitePeer.peerId = guestId;
    invitePeer.peerName = payload.guestName || guestId;
    this.peerMap.set(guestId, invitePeer);
    this.pendingInvitePeerId = null;

    await invitePeer.pc.setRemoteDescription(toSessionDescription(payload.signal));
    await this.waitForDataChannel(invitePeer);
    this.notifyPeers();
  }

  async connectToKnownPeer(peerId, peerName) {
    if (!peerId || peerId === this.selfId || this.peerMap.has(peerId)) return;
    const peer = this.ensurePeer(peerId, true, peerName || peerId);
    const offer = await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offer);
    await waitForIceGatheringComplete(peer.pc);

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
        peer.pc.removeEventListener("datachannel", onDataChannel);
        if (peer.dc) {
          peer.dc.removeEventListener("open", onChannelOpen);
        }
        if (error) reject(error);
        else resolve();
      };

      const onChannelOpen = () => {
        this.syncPeerReady(peer);
        finish();
      };

      const onConnectionChange = () => {
        if (peer.pc.connectionState === "failed" || peer.pc.connectionState === "closed") {
          finish(new Error("Соединение WebRTC не установлено"));
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
        finish(new Error("Не удалось открыть канал данных. Проверьте сеть или вставьте payload заново."));
      }, timeoutMs);

      if (peer.dc) {
        peer.dc.addEventListener("open", onChannelOpen, { once: true });
      } else {
        peer.pc.addEventListener("datachannel", onDataChannel);
      }

      peer.pc.addEventListener("connectionstatechange", onConnectionChange);
      onConnectionChange();
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
    };

    if (initiator) {
      const dc = pc.createDataChannel(DATA_CHANNEL_LABEL, { negotiated: false });
      this.attachDataChannel(peer, dc);
    } else {
      pc.addEventListener("datachannel", (event) => {
        if (event.channel.label !== DATA_CHANNEL_LABEL) return;
        this.attachDataChannel(peer, event.channel);
      });
    }

    pc.addEventListener("connectionstatechange", () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        this.peerMap.delete(peer.peerId);
        if (this.pendingInvitePeerId === peer.peerId) {
          this.pendingInvitePeerId = null;
        }
        this.notifyPeers();
        return;
      }

      if (pc.connectionState === "connected") {
        this.syncPeerReady(peer);
        this.notifyPeers();
      }
    });

    this.peerMap.set(peerId, peer);
    this.notifyPeers();
    return peer;
  }

  onDataChannelOpen(peer) {
    if (peer.isOpen) return;

    peer.isOpen = true;
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
      this.notifyPeers();
    });

    dc.addEventListener("message", (event) => {
      this.handleIncomingEnvelope(peer.peerId, safeParse(event.data));
    });

    if (dc.readyState === "open") {
      this.onDataChannelOpen(peer);
    } else {
      dc.addEventListener("open", () => this.onDataChannelOpen(peer), { once: true });
    }
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
      for (const message of messages) {
        this.onMessage(message);
      }
      return;
    }

    if (envelope.type === ProtocolTypes.hello) {
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
        await waitForIceGatheringComplete(peer.pc);

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
    this.onPeerListChange(this.listPeers());
    this.onStatus(this.listPeers().length === 0 ? "offline" : "connected");
  }
}
