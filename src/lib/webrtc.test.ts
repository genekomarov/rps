import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProtocolTypes, createEnvelope } from "./protocol";
import { WebRtcMesh } from "./webrtc";
import {
  installWebRtcGlobals,
  type MockPeerConnection,
} from "../test/webrtcMocks";
import type { WebRtcMeshOptions } from "./webrtc";
import type { SignalDescription } from "../types";

let webrtcGlobals: ReturnType<typeof installWebRtcGlobals>;

function createMesh(overrides: Partial<WebRtcMeshOptions> = {}) {
  const callbacks = {
    onPeerListChange: vi.fn(),
    onMessage: vi.fn(),
    onStatus: vi.fn(),
    onError: vi.fn(),
    onLog: vi.fn(),
    onDiagnostics: vi.fn(),
    onHandshakeOfferRefresh: vi.fn(),
    getHistory: vi.fn(() => []),
    ...overrides,
  };

  const mesh = new WebRtcMesh({
    selfId: "self-1",
    selfName: "Self",
    ...callbacks,
  });

  return { mesh, callbacks };
}

describe("WebRtcMesh", () => {
  beforeEach(() => {
    webrtcGlobals = installWebRtcGlobals();
  });

  afterEach(() => {
    webrtcGlobals.restore();
    vi.useRealTimers();
  });

  it("creates host offer with packed signal", async () => {
    const { mesh } = createMesh();

    const offer = await mesh.createHostOffer();

    expect(offer.hostId).toBe("self-1");
    expect(offer.hostName).toBe("Self");
    expect(offer.signal.type).toBe("offer");
    expect(offer.signal.sdp).toContain("typ host");
    expect(mesh.pendingInvitePeerId).toMatch(/^invite-/);
  });

  it("accepts host offer and returns guest answer", async () => {
    const host = createMesh({ selfId: "host-1", selfName: "Host" });
    const guest = createMesh({ selfId: "guest-1", selfName: "Guest" });

    const hostOffer = await host.mesh.createHostOffer();
    const guestAnswer = await guest.mesh.acceptHostOffer(hostOffer);

    expect(guestAnswer.targetHostId).toBe("host-1");
    expect(guestAnswer.guestId).toBe("guest-1");
    expect(guestAnswer.signal.type).toBe("answer");
  });

  it("throws on invalid host offer", async () => {
    const { mesh } = createMesh();

    await expect(mesh.acceptHostOffer({} as never)).rejects.toThrow("Некорректное приглашение хоста");
  });

  it("completes host handshake and renames invite peer", async () => {
    const host = createMesh({ selfId: "host-1", selfName: "Host" });
    const guest = createMesh({ selfId: "guest-1", selfName: "Guest" });

    await host.mesh.createHostOffer();
    const guestAnswer = await guest.mesh.acceptHostOffer({
      hostId: "host-1",
      hostName: "Host",
      signal: webrtcGlobals.instances[0].localDescription as SignalDescription,
    });

    await host.mesh.completeHostHandshake(guestAnswer);

    expect(host.mesh.peerMap.has("guest-1")).toBe(true);
    expect(host.mesh.pendingInvitePeerId).toBeNull();
  });

  it("throws when completing handshake without active invite", async () => {
    const { mesh } = createMesh();

    await expect(
      mesh.completeHostHandshake({
        guestId: "guest-1",
        guestName: "Guest",
        targetHostId: "host-1",
        signal: { type: "answer", sdp: "v=0\r\n" },
      }),
    ).rejects.toThrow("Нет активного приглашения");
  });

  it("reports peer ready when data channel opens", async () => {
    const { mesh } = createMesh();
    await mesh.createHostOffer();

    const peer = mesh.peerMap.values().next().value!;
    expect(mesh.isPeerReady(peer)).toBe(false);
    expect(mesh.listPeers()).toEqual([]);

    (peer.pc as unknown as MockPeerConnection).getDataChannel()!._setOpen();

    expect(mesh.isPeerReady(peer)).toBe(true);
    expect(mesh.listPeers()).toEqual([
      {
        id: peer.peerId,
        name: peer.peerId,
      },
    ]);
  });

  it("broadcasts chat messages to ready peers", async () => {
    const { mesh, callbacks } = createMesh();
    const peer = mesh.ensurePeer("peer-2", true, "Peer");
    const dc = (peer.pc as unknown as MockPeerConnection).getDataChannel()!;
    peer.isOpen = true;
    dc.readyState = "open";

    mesh.sendChatMessage({
      id: "m1",
      authorId: "self-1",
      authorName: "Self",
      text: "hello",
      timestamp: Date.now(),
    });

    expect(dc.send).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(dc.send.mock.calls[0][0]);
    expect(sent.type).toBe(ProtocolTypes.chatMessage);
    expect(sent.payload.text).toBe("hello");
    expect(callbacks.onStatus).toHaveBeenCalled();
  });

  it("deduplicates incoming envelopes by id", async () => {
    const { mesh, callbacks } = createMesh();
    const envelope = createEnvelope(ProtocolTypes.chatMessage, {
      id: "m1",
      authorId: "peer-2",
      authorName: "Peer",
      text: "hi",
      timestamp: Date.now(),
    });

    await mesh.handleIncomingEnvelope("peer-2", envelope);
    await mesh.handleIncomingEnvelope("peer-2", envelope);

    expect(callbacks.onMessage).toHaveBeenCalledTimes(1);
  });

  it("syncs history on data channel open", () => {
    const history = [
      {
        id: "m1",
        authorId: "self-1",
        authorName: "Self",
        text: "stored",
        timestamp: 1,
      },
    ];
    const { mesh } = createMesh({ getHistory: () => history });
    const peer = mesh.ensurePeer("peer-2", true, "Peer");
    const dc = (peer.pc as unknown as MockPeerConnection).getDataChannel()!;
    dc.readyState = "open";

    mesh.onDataChannelOpen(peer);

    expect(dc.send).toHaveBeenCalled();
    const hello = JSON.parse(dc.send.mock.calls[0][0]);
    expect(hello.type).toBe(ProtocolTypes.hello);

    const historyEnvelope = JSON.parse(dc.send.mock.calls[1][0]);
    expect(historyEnvelope.type).toBe(ProtocolTypes.historySync);
    expect(historyEnvelope.payload.messages).toEqual(history);
  });

  it("disposes all peers and clears state", async () => {
    const { mesh, callbacks } = createMesh();
    await mesh.createHostOffer();

    const pc = webrtcGlobals.instances[0];
    mesh.dispose();

    expect(pc.close).toHaveBeenCalled();
    expect(mesh.peerMap.size).toBe(0);
    expect(mesh.closed).toBe(true);
    expect(callbacks.onPeerListChange).toHaveBeenCalledWith([]);
    expect(callbacks.onStatus).toHaveBeenCalledWith("offline");
  });

  it("clears invite peers before creating a new host offer", async () => {
    const { mesh } = createMesh();

    await mesh.createHostOffer();
    const firstInviteId = mesh.pendingInvitePeerId;
    await mesh.createHostOffer();

    expect(mesh.pendingInvitePeerId).not.toBe(firstInviteId);
    expect([...mesh.peerMap.keys()].filter((id) => id.startsWith("invite-"))).toHaveLength(1);
  });

  it("updates self name and logs change", () => {
    const { mesh, callbacks } = createMesh();

    mesh.setSelfName("NewName");

    expect(mesh.selfName).toBe("NewName");
    expect(callbacks.onLog).toHaveBeenCalledWith("info", "Ник обновлён: NewName");
  });

  it("returns diagnostics for each peer", async () => {
    const { mesh } = createMesh();
    await mesh.createHostOffer();

    const diagnostics = mesh.getDiagnostics();

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      peerId: mesh.pendingInvitePeerId,
      ready: false,
      dc: "connecting",
    });
  });

  it("rejects invalid forward signal envelopes", async () => {
    const { mesh, callbacks } = createMesh();
    const envelope = createEnvelope(ProtocolTypes.forwardSignal, {
      toId: "self-1",
      fromId: "peer-2",
      signal: null,
    });

    await mesh.handleIncomingEnvelope("peer-2", envelope);

    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(mesh.peerMap.has("peer-2")).toBe(false);
  });

  it("answers forwarded offer signals", async () => {
    const { mesh } = createMesh();
    const envelope = createEnvelope(ProtocolTypes.forwardSignal, {
      toId: "self-1",
      fromId: "peer-3",
      signal: { type: "offer", sdp: "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\n" },
    });

    await mesh.handleIncomingEnvelope("relay-peer", envelope);

    const peer = mesh.peerMap.get("peer-3")!;
    expect(peer).toBeTruthy();
    expect(peer.pc.createAnswer).toHaveBeenCalled();
  });
});
