import {
  ProtocolTypes,
  createEnvelope,
  isValidChatMessage,
  trimChatHistory,
} from "./protocol";

const RTC_CONFIG = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

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
    this.closed = false;
  }

  setSelfName(nextName) {
    this.selfName = nextName;
  }

  listPeers() {
    return [...this.peerMap.values()]
      .filter((peer) => peer.isOpen)
      .map((peer) => ({
        id: peer.peerId,
        name: peer.peerName || peer.peerId,
      }));
  }

  dispose() {
    this.closed = true;
    for (const peer of this.peerMap.values()) {
      peer.pc.close();
    }
    this.peerMap.clear();
    this.notifyPeers();
  }

  async createHostOffer() {
    const tempPeerId = `invite-${crypto.randomUUID()}`;
    const peer = this.ensurePeer(tempPeerId, true, "");
    const offer = await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offer);
    await waitForIceGatheringComplete(peer.pc);

    return {
      hostId: this.selfId,
      hostName: this.selfName,
      signal: peer.pc.localDescription,
    };
  }

  async acceptHostOffer(payload) {
    const hostId = payload?.hostId;
    if (!hostId || !payload?.signal) {
      throw new Error("Invalid host offer payload");
    }

    const peer = this.ensurePeer(hostId, false, payload.hostName || "Host");
    await peer.pc.setRemoteDescription(new RTCSessionDescription(payload.signal));

    const answer = await peer.pc.createAnswer();
    await peer.pc.setLocalDescription(answer);
    await waitForIceGatheringComplete(peer.pc);

    return {
      targetHostId: hostId,
      guestId: this.selfId,
      guestName: this.selfName,
      signal: peer.pc.localDescription,
    };
  }

  async completeHostHandshake(payload) {
    const guestId = payload?.guestId;
    if (!guestId || !payload?.signal) {
      throw new Error("Invalid answer payload");
    }

    const oldInvite = [...this.peerMap.values()].find(
      (item) => item.peerId.startsWith("invite-") && !item.isOpen,
    );

    let peer;
    if (oldInvite) {
      this.peerMap.delete(oldInvite.peerId);
      oldInvite.peerId = guestId;
      oldInvite.peerName = payload.guestName || guestId;
      this.peerMap.set(guestId, oldInvite);
      peer = oldInvite;
    } else {
      peer = this.ensurePeer(guestId, true, payload.guestName || guestId);
    }

    await peer.pc.setRemoteDescription(new RTCSessionDescription(payload.signal));
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
      const dc = pc.createDataChannel("chat");
      this.attachDataChannel(peer, dc);
    } else {
      pc.addEventListener("datachannel", (event) => {
        this.attachDataChannel(peer, event.channel);
      });
    }

    pc.addEventListener("connectionstatechange", () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        this.peerMap.delete(peerId);
        this.notifyPeers();
      }
    });

    this.peerMap.set(peerId, peer);
    this.notifyPeers();
    return peer;
  }

  attachDataChannel(peer, dc) {
    peer.dc = dc;

    dc.addEventListener("open", () => {
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
    });

    dc.addEventListener("close", () => {
      peer.isOpen = false;
      this.notifyPeers();
    });

    dc.addEventListener("message", (event) => {
      this.handleIncomingEnvelope(peer.peerId, safeParse(event.data));
    });
  }

  sendDirect(peer, envelope) {
    if (!peer?.dc || peer.dc.readyState !== "open") return;
    peer.dc.send(JSON.stringify(envelope));
  }

  broadcastEnvelope(envelope, exceptPeerId) {
    this.seenEnvelopeIds.add(envelope.id);
    for (const peer of this.peerMap.values()) {
      if (!peer.isOpen) continue;
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
      await peer.pc.setRemoteDescription(new RTCSessionDescription(signal));
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
