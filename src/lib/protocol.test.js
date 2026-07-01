import { describe, expect, it } from "vitest";
import {
  ProtocolTypes,
  createChatMessage,
  createEnvelope,
  createSignalPayload,
  decodeSignalPayload,
  encodeSignalPayload,
  isValidChatMessage,
  trimChatHistory,
} from "./protocol";

const HOST_OFFER_BODY = {
  hostId: "host-1",
  hostName: "Alice",
  signal: {
    type: "offer",
    sdp: "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\n",
  },
};

const HOST_ANSWER_BODY = {
  targetHostId: "host-1",
  guestId: "guest-1",
  guestName: "Bob",
  signal: {
    type: "answer",
    sdp: "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\n",
  },
};

describe("createEnvelope", () => {
  it("creates envelope with id, type, payload and timestamp", () => {
    const envelope = createEnvelope(ProtocolTypes.chatMessage, { text: "hi" });

    expect(envelope.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(envelope.type).toBe(ProtocolTypes.chatMessage);
    expect(envelope.payload).toEqual({ text: "hi" });
    expect(typeof envelope.createdAt).toBe("number");
  });
});

describe("createChatMessage", () => {
  it("creates a valid chat message", () => {
    const message = createChatMessage("u1", "Alice", "hello");

    expect(isValidChatMessage(message)).toBe(true);
    expect(message.authorId).toBe("u1");
    expect(message.authorName).toBe("Alice");
    expect(message.text).toBe("hello");
  });
});

describe("isValidChatMessage", () => {
  it("rejects incomplete messages", () => {
    expect(isValidChatMessage(null)).toBe(false);
    expect(isValidChatMessage({ id: "1" })).toBe(false);
    expect(
      isValidChatMessage({
        id: "1",
        authorId: "u1",
        authorName: "A",
        text: "x",
        timestamp: "not-a-number",
      }),
    ).toBe(false);
  });
});

describe("trimChatHistory", () => {
  it("returns empty array for non-array input", () => {
    expect(trimChatHistory(null)).toEqual([]);
  });

  it("keeps tail when over limit", () => {
    const messages = Array.from({ length: 5 }, (_, index) => ({
      id: String(index),
    }));

    expect(trimChatHistory(messages, 3)).toEqual([
      { id: "2" },
      { id: "3" },
      { id: "4" },
    ]);
  });

  it("returns same array when within limit", () => {
    const messages = [{ id: "1" }, { id: "2" }];
    expect(trimChatHistory(messages, 10)).toBe(messages);
  });
});

describe("encodeSignalPayload / decodeSignalPayload", () => {
  it("round-trips host-offer payload (v2 compact)", async () => {
    const payload = createSignalPayload("host-offer", HOST_OFFER_BODY);
    const encoded = await encodeSignalPayload(payload);

    expect(encoded.startsWith("rps://")).toBe(true);

    const decoded = await decodeSignalPayload(encoded);
    expect(decoded).toEqual(payload);
  });

  it("round-trips host-answer payload (v2 compact)", async () => {
    const payload = createSignalPayload("host-answer", HOST_ANSWER_BODY);
    const encoded = await encodeSignalPayload(payload);
    const decoded = await decodeSignalPayload(encoded);

    expect(decoded).toEqual(payload);
  });

  it("decodes payload without prefix", async () => {
    const payload = createSignalPayload("host-offer", HOST_OFFER_BODY);
    const encoded = await encodeSignalPayload(payload);
    const bodyOnly = encoded.slice("rps://".length);

    const decoded = await decodeSignalPayload(bodyOnly);
    expect(decoded).toEqual(payload);
  });

  it("normalizes whitespace and quotes before decode", async () => {
    const payload = createSignalPayload("host-offer", HOST_OFFER_BODY);
    const encoded = await encodeSignalPayload(payload);
    const messy = `  "${encoded}"  `;

    const decoded = await decodeSignalPayload(messy);
    expect(decoded).toEqual(payload);
  });

  it("decodes legacy v1 base64 payload", async () => {
    const legacy = {
      version: 1,
      type: "host-offer",
      body: HOST_OFFER_BODY,
    };
    const json = JSON.stringify(legacy);
    const base64 = btoa(unescape(encodeURIComponent(json)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
    const encoded = `rpschat://signal/${base64}`;

    const decoded = await decodeSignalPayload(encoded);
    expect(decoded.type).toBe("host-offer");
    expect(decoded.body.hostId).toBe("host-1");
    expect(decoded.body.signal.type).toBe("offer");
  });

  it("throws on empty payload", async () => {
    await expect(decodeSignalPayload("   ")).rejects.toThrow("Пустой payload");
  });

  it("throws on unsupported version in compact format", async () => {
    const badJson = JSON.stringify({ v: 99, t: 0, b: [] });
    const stream = new Blob([new TextEncoder().encode(badJson)])
      .stream()
      .pipeThrough(new CompressionStream("deflate"));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    const binary = String.fromCharCode(...bytes);
    const encoded = `rps://${btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")}`;

    await expect(decodeSignalPayload(encoded)).rejects.toThrow(
      "Unsupported signal payload version",
    );
  });
});
