import type {
  ChatMessage,
  Envelope,
  HostAnswerBody,
  HostOfferBody,
  ProtocolType,
  SignalPayload,
  SignalType,
} from "../types";

const SIGNAL_VERSION = 2;
const SIGNAL_PREFIX = "rps://";
const SIGNAL_PREFIX_V1 = "rpschat://signal/";
const CHAT_HISTORY_LIMIT = 100;

const TYPE_TO_CODE: Record<SignalType, number> = { "host-offer": 0, "host-answer": 1 };
const CODE_TO_TYPE: SignalType[] = ["host-offer", "host-answer"];
const SDP_TYPE_TO_CODE: Record<string, number> = { offer: 0, answer: 1, pranswer: 2, rollback: 3 };
const CODE_TO_SDP_TYPE = ["offer", "answer", "pranswer", "rollback"] as const;

interface CompactPayload {
  v: number;
  t: number;
  b: unknown[];
}

function fromBase64Url(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return decodeURIComponent(escape(atob(padded)));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;

  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

async function compressString(text: string): Promise<Uint8Array> {
  const stream = new Blob([new TextEncoder().encode(text)])
    .stream()
    .pipeThrough(new CompressionStream("deflate"));

  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function decompressToString(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}

function toCompactPayload(payload: SignalPayload): CompactPayload {
  const { type, body } = payload;

  if (type === "host-offer") {
    const offerBody = body as HostOfferBody;
    return {
      v: SIGNAL_VERSION,
      t: TYPE_TO_CODE[type],
      b: [
        offerBody.hostId,
        offerBody.hostName,
        SDP_TYPE_TO_CODE[offerBody.signal.type] ?? 0,
        offerBody.signal.sdp,
      ],
    };
  }

  if (type === "host-answer") {
    const answerBody = body as HostAnswerBody;
    return {
      v: SIGNAL_VERSION,
      t: TYPE_TO_CODE[type],
      b: [
        answerBody.targetHostId,
        answerBody.guestId,
        answerBody.guestName,
        SDP_TYPE_TO_CODE[answerBody.signal.type] ?? 1,
        answerBody.signal.sdp,
      ],
    };
  }

  throw new Error("Unknown signal type");
}

function expandCompactPayload(compact: CompactPayload): SignalPayload {
  if (compact?.v !== SIGNAL_VERSION) {
    throw new Error("Unsupported signal payload version");
  }

  const type = CODE_TO_TYPE[compact.t];
  if (!type) {
    throw new Error("Invalid signal payload type");
  }

  const bodyValues = compact.b;
  if (!Array.isArray(bodyValues)) {
    throw new Error("Invalid signal payload shape");
  }

  if (compact.t === 0) {
    const [hostId, hostName, signalTypeCode, sdp] = bodyValues as [
      string,
      string,
      number,
      string,
    ];
    return {
      version: SIGNAL_VERSION,
      type,
      body: {
        hostId,
        hostName,
        signal: {
          type: CODE_TO_SDP_TYPE[signalTypeCode] || "offer",
          sdp,
        },
      },
    };
  }

  if (compact.t === 1) {
    const [targetHostId, guestId, guestName, signalTypeCode, sdp] = bodyValues as [
      string,
      string,
      string,
      number,
      string,
    ];
    return {
      version: SIGNAL_VERSION,
      type,
      body: {
        targetHostId,
        guestId,
        guestName,
        signal: {
          type: CODE_TO_SDP_TYPE[signalTypeCode] || "answer",
          sdp,
        },
      },
    };
  }

  throw new Error("Invalid signal payload type");
}

function normalizeSignalPayloadInput(rawValue: unknown): string {
  return String(rawValue ?? "")
    .trim()
    .replace(/^\uFEFF/, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/^["']+|["']+$/g, "")
    .replace(/\s+/g, "");
}

async function decodeCompactPayloadBody(encodedBody: string): Promise<SignalPayload> {
  const bytes = base64UrlToBytes(encodedBody);
  const json = await decompressToString(bytes);
  return expandCompactPayload(JSON.parse(json) as CompactPayload);
}

function decodeLegacyPayload(rawValue: string): SignalPayload {
  const normalized = rawValue.trim();
  const parsed = JSON.parse(fromBase64Url(normalized)) as SignalPayload;

  if (parsed?.version !== 1) {
    throw new Error("Unsupported signal payload version");
  }

  if (!parsed?.type || !parsed?.body) {
    throw new Error("Invalid signal payload shape");
  }

  return parsed;
}

export function createSignalPayload<T extends SignalType>(
  type: T,
  body: T extends "host-offer" ? HostOfferBody : HostAnswerBody,
): SignalPayload {
  return {
    version: SIGNAL_VERSION,
    type,
    body,
  };
}

export async function encodeSignalPayload(payload: SignalPayload): Promise<string> {
  const compact = toCompactPayload(payload);
  const compressed = await compressString(JSON.stringify(compact));
  return `${SIGNAL_PREFIX}${bytesToBase64Url(compressed)}`;
}

export async function decodeSignalPayload(rawValue: unknown): Promise<SignalPayload> {
  const normalized = normalizeSignalPayloadInput(rawValue);
  if (!normalized) {
    throw new Error("Пустой payload");
  }

  const lower = normalized.toLowerCase();

  if (lower.startsWith(SIGNAL_PREFIX)) {
    return decodeCompactPayloadBody(normalized.slice(SIGNAL_PREFIX.length));
  }

  if (lower.startsWith(SIGNAL_PREFIX_V1)) {
    const body = normalized.slice(SIGNAL_PREFIX_V1.length);
    try {
      return await decodeCompactPayloadBody(body);
    } catch {
      return decodeLegacyPayload(body);
    }
  }

  try {
    return await decodeCompactPayloadBody(normalized);
  } catch {
    return decodeLegacyPayload(normalized);
  }
}

export function createEnvelope<T>(type: ProtocolType, payload: T): Envelope<T> {
  return {
    id: crypto.randomUUID(),
    type,
    payload,
    createdAt: Date.now(),
  };
}

export function createChatMessage(authorId: string, authorName: string, text: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    authorId,
    authorName,
    text,
    timestamp: Date.now(),
  };
}

export function trimChatHistory(messages: unknown, limit: number = CHAT_HISTORY_LIMIT): ChatMessage[] {
  if (!Array.isArray(messages)) return [];
  if (messages.length <= limit) return messages as ChatMessage[];
  return (messages as ChatMessage[]).slice(messages.length - limit);
}

export function isValidChatMessage(message: unknown): message is ChatMessage {
  if (!message || typeof message !== "object") return false;
  const candidate = message as Partial<ChatMessage>;
  return Boolean(
    typeof candidate.id === "string" &&
      typeof candidate.authorId === "string" &&
      typeof candidate.authorName === "string" &&
      typeof candidate.text === "string" &&
      typeof candidate.timestamp === "number",
  );
}

export const ProtocolTypes = {
  hello: "hello",
  chatMessage: "chatMessage",
  historySync: "historySync",
  peerAnnounce: "peerAnnounce",
  forwardSignal: "forwardSignal",
} as const;
