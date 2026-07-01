export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  id: string;
  time: number;
  level: LogLevel;
  message: string;
}

export interface ChatMessage {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  timestamp: number;
}

export type ProtocolType =
  | "hello"
  | "chatMessage"
  | "historySync"
  | "peerAnnounce"
  | "forwardSignal";

export interface Envelope<T = unknown> {
  id: string;
  type: ProtocolType;
  payload: T;
  createdAt: number;
}

export type SignalType = "host-offer" | "host-answer";

export type SdpType = RTCSdpType;

export interface SignalDescription {
  type: SdpType;
  sdp: string;
}

export interface HostOfferBody {
  hostId: string;
  hostName: string;
  signal: SignalDescription;
}

export interface HostAnswerBody {
  targetHostId: string;
  guestId: string;
  guestName: string;
  signal: SignalDescription;
}

export interface SignalPayload {
  version: number;
  type: SignalType;
  body: HostOfferBody | HostAnswerBody;
}

export interface PeerListItem {
  id: string;
  name: string;
}

export type MeshStatus = "offline" | "connected";

export interface PeerDiagnostic {
  peerId: string;
  peerName: string;
  ice: RTCIceConnectionState;
  connection: RTCPeerConnectionState;
  gathering: RTCIceGatheringState;
  dc: RTCDataChannelState | "none";
  ready: boolean;
}

export interface AppState {
  version: number;
  clientId: string;
  nickname: string;
  nicknameDraft: string;
  messages: ChatMessage[];
  peers: PeerListItem[];
  extendedRelayGather: boolean;
}

export type SessionPhase =
  | "setup"
  | "ready"
  | "host-offer"
  | "guest-answer"
  | "connecting"
  | "chat";

export interface PhaseMeta {
  title: string;
  hint: string;
}

export interface ResolvePhaseInput {
  nickname: string;
  hostOfferCode: string;
  answerCode: string;
  peers: PeerListItem[];
  busy: boolean;
}

export interface IceCandidateCounts {
  host: number;
  srflx: number;
  relay: number;
  total: number;
}
