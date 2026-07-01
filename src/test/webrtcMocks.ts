import { vi, type Mock } from "vitest";

const SAMPLE_SDP = [
  "v=0",
  "o=- 0 0 IN IP4 127.0.0.1",
  "s=-",
  "t=0 0",
  "a=candidate:1 1 UDP 2130706431 192.168.1.1 54321 typ host",
  "a=candidate:2 1 UDP 1694498815 203.0.113.1 54321 typ srflx",
  "a=candidate:3 1 UDP 16777215 relay.example.com 54321 typ relay",
].join("\r\n");

type EventHandler = (...args: unknown[]) => void;

export interface MockDataChannel {
  label: string;
  readyState: RTCDataChannelState;
  send: Mock;
  close: Mock;
  addEventListener: (event: string, handler: EventHandler, options?: AddEventListenerOptions) => void;
  removeEventListener: (event: string) => void;
  _emit: (event: string, ...args: unknown[]) => void;
  _setOpen: () => void;
}

export interface MockPeerConnection {
  iceGatheringState: RTCIceGatheringState;
  iceConnectionState: RTCIceConnectionState;
  connectionState: RTCPeerConnectionState;
  signalingState: RTCSignalingState;
  localDescription: RTCSessionDescriptionInit | null;
  remoteDescription: RTCSessionDescriptionInit | null;
  createOffer: Mock;
  createAnswer: Mock;
  setLocalDescription: Mock;
  setRemoteDescription: Mock;
  createDataChannel: Mock;
  restartIce: Mock;
  close: Mock;
  addEventListener: (event: string, handler: EventHandler) => void;
  removeEventListener: (event: string) => void;
  _emit: (event: string, data?: unknown) => void;
  getDataChannel: () => MockDataChannel | null;
}

export function createMockDataChannel(
  overrides: Partial<MockDataChannel> = {},
): MockDataChannel {
  const listeners = new Map<string, EventHandler>();

  const channel: MockDataChannel = {
    label: "chat",
    readyState: "connecting",
    send: vi.fn(),
    close: vi.fn(),
    addEventListener(event, handler, options) {
      if (options?.once) {
        const wrapped = (...args: unknown[]) => {
          listeners.delete(event);
          handler(...args);
        };
        listeners.set(event, wrapped);
        return;
      }
      listeners.set(event, handler);
    },
    removeEventListener(event) {
      listeners.delete(event);
    },
    _emit(event, ...args) {
      listeners.get(event)?.(...args);
    },
    _setOpen() {
      channel.readyState = "open";
      channel._emit("open");
    },
    ...overrides,
  };

  return channel;
}

export function createMockPeerConnection(
  overrides: Partial<MockPeerConnection> = {},
): MockPeerConnection {
  const listeners = new Map<string, EventHandler>();
  let localDescription: RTCSessionDescriptionInit | null = null;
  let remoteDescription: RTCSessionDescriptionInit | null = null;
  let dataChannel: MockDataChannel | null = null;

  const pc: MockPeerConnection = {
    iceGatheringState: "gathering",
    iceConnectionState: "new",
    connectionState: "new",
    signalingState: "stable",
    get localDescription() {
      return localDescription;
    },
    get remoteDescription() {
      return remoteDescription;
    },
    createOffer: vi.fn(async (options?: RTCOfferOptions) => ({
      type: "offer",
      sdp: SAMPLE_SDP,
      iceRestart: options?.iceRestart,
    })),
    createAnswer: vi.fn(async () => ({
      type: "answer",
      sdp: SAMPLE_SDP,
    })),
    setLocalDescription: vi.fn(async (description: RTCSessionDescriptionInit) => {
      localDescription = description;
      pc.iceGatheringState = "complete";
      queueMicrotask(() => {
        pc._emit("icegatheringstatechange");
        pc._emit("icecandidate", { candidate: null });
      });
    }),
    setRemoteDescription: vi.fn(async (description: RTCSessionDescriptionInit) => {
      remoteDescription = description;
    }),
    createDataChannel: vi.fn((label: string, options?: RTCDataChannelInit) => {
      dataChannel = createMockDataChannel({ label, ...options });
      return dataChannel;
    }),
    restartIce: vi.fn(),
    close: vi.fn(() => {
      pc.connectionState = "closed";
      pc._emit("connectionstatechange");
    }),
    addEventListener(event, handler) {
      listeners.set(event, handler);
    },
    removeEventListener(event) {
      listeners.delete(event);
    },
    _emit(event, data) {
      listeners.get(event)?.(data);
    },
    getDataChannel() {
      return dataChannel;
    },
    ...overrides,
  };

  return pc;
}

export function installWebRtcGlobals() {
  const instances: MockPeerConnection[] = [];

  class MockRTCPeerConnection {
    _config: RTCConfiguration;
    _mock: MockPeerConnection;

    constructor(config: RTCConfiguration) {
      this._config = config;
      this._mock = createMockPeerConnection();
      instances.push(this._mock);
      return this._mock as unknown as MockRTCPeerConnection;
    }
  }

  class MockRTCSessionDescription {
    type: RTCSdpType;
    sdp: string;

    constructor(init: RTCSessionDescriptionInit) {
      this.type = init.type!;
      this.sdp = init.sdp!;
    }
  }

  vi.stubGlobal("RTCPeerConnection", MockRTCPeerConnection);
  vi.stubGlobal("RTCSessionDescription", MockRTCSessionDescription);

  return {
    instances,
    restore() {
      vi.unstubAllGlobals();
    },
  };
}

export { SAMPLE_SDP };
