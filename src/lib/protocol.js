const SIGNAL_VERSION = 1;
const SIGNAL_PREFIX = "rpschat://signal/";
const CHAT_HISTORY_LIMIT = 100;

function toBase64Url(value) {
  return btoa(unescape(encodeURIComponent(value)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return decodeURIComponent(escape(atob(padded)));
}

export function createSignalPayload(type, body) {
  return {
    version: SIGNAL_VERSION,
    type,
    body,
    createdAt: Date.now(),
  };
}

export function encodeSignalPayload(payload) {
  return `${SIGNAL_PREFIX}${toBase64Url(JSON.stringify(payload))}`;
}

export function decodeSignalPayload(rawValue) {
  const normalized = rawValue.trim();
  const encoded = normalized.startsWith(SIGNAL_PREFIX)
    ? normalized.slice(SIGNAL_PREFIX.length)
    : normalized;

  const parsed = JSON.parse(fromBase64Url(encoded));

  if (parsed?.version !== SIGNAL_VERSION) {
    throw new Error("Unsupported signal payload version");
  }

  if (!parsed?.type || !parsed?.body) {
    throw new Error("Invalid signal payload shape");
  }

  return parsed;
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
