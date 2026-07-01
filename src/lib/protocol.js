const SIGNAL_VERSION = 2;
const SIGNAL_PREFIX = "rps://";
const SIGNAL_PREFIX_V1 = "rpschat://signal/";
const CHAT_HISTORY_LIMIT = 100;

const TYPE_TO_CODE = { "host-offer": 0, "host-answer": 1 };
const CODE_TO_TYPE = ["host-offer", "host-answer"];
const SDP_TYPE_TO_CODE = { offer: 0, answer: 1, pranswer: 2, rollback: 3 };
const CODE_TO_SDP_TYPE = ["offer", "answer", "pranswer", "rollback"];

function fromBase64Url(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return decodeURIComponent(escape(atob(padded)));
}

function bytesToBase64Url(bytes) {
  let binary = "";
  const chunk = 0x8000;

  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

async function compressString(text) {
  const stream = new Blob([new TextEncoder().encode(text)])
    .stream()
    .pipeThrough(new CompressionStream("deflate"));

  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function decompressToString(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}

function toCompactPayload({ type, body }) {
  if (type === "host-offer") {
    return {
      v: SIGNAL_VERSION,
      t: TYPE_TO_CODE[type],
      b: [
        body.hostId,
        body.hostName,
        SDP_TYPE_TO_CODE[body.signal.type] ?? 0,
        body.signal.sdp,
      ],
    };
  }

  if (type === "host-answer") {
    return {
      v: SIGNAL_VERSION,
      t: TYPE_TO_CODE[type],
      b: [
        body.targetHostId,
        body.guestId,
        body.guestName,
        SDP_TYPE_TO_CODE[body.signal.type] ?? 1,
        body.signal.sdp,
      ],
    };
  }

  throw new Error("Unknown signal type");
}

function expandCompactPayload(compact) {
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
    const [hostId, hostName, signalTypeCode, sdp] = bodyValues;
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
    const [targetHostId, guestId, guestName, signalTypeCode, sdp] = bodyValues;
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

function normalizeSignalPayloadInput(rawValue) {
  return String(rawValue ?? "")
    .trim()
    .replace(/^\uFEFF/, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/^["']+|["']+$/g, "")
    .replace(/\s+/g, "");
}

async function decodeCompactPayloadBody(encodedBody) {
  const bytes = base64UrlToBytes(encodedBody);
  const json = await decompressToString(bytes);
  return expandCompactPayload(JSON.parse(json));
}

function decodeLegacyPayload(rawValue) {
  const normalized = rawValue.trim();
  const parsed = JSON.parse(fromBase64Url(normalized));

  if (parsed?.version !== 1) {
    throw new Error("Unsupported signal payload version");
  }

  if (!parsed?.type || !parsed?.body) {
    throw new Error("Invalid signal payload shape");
  }

  return parsed;
}

export function createSignalPayload(type, body) {
  return {
    version: SIGNAL_VERSION,
    type,
    body,
  };
}

export async function encodeSignalPayload(payload) {
  const compact = toCompactPayload(payload);
  const compressed = await compressString(JSON.stringify(compact));
  return `${SIGNAL_PREFIX}${bytesToBase64Url(compressed)}`;
}

export async function decodeSignalPayload(rawValue) {
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

export function createEnvelope(type, payload) {
  return {
    id: crypto.randomUUID(),
    type,
    payload,
    createdAt: Date.now(),
  };
}

export function createChatMessage(authorId, authorName, text) {
  return {
    id: crypto.randomUUID(),
    authorId,
    authorName,
    text,
    timestamp: Date.now(),
  };
}

export function trimChatHistory(messages, limit = CHAT_HISTORY_LIMIT) {
  if (!Array.isArray(messages)) return [];
  if (messages.length <= limit) return messages;
  return messages.slice(messages.length - limit);
}

export function isValidChatMessage(message) {
  return Boolean(
    message &&
      typeof message.id === "string" &&
      typeof message.authorId === "string" &&
      typeof message.authorName === "string" &&
      typeof message.text === "string" &&
      typeof message.timestamp === "number",
  );
}

export const ProtocolTypes = {
  hello: "hello",
  chatMessage: "chatMessage",
  historySync: "historySync",
  peerAnnounce: "peerAnnounce",
  forwardSignal: "forwardSignal",
};
