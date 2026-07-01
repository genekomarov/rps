import { CompressionStream, DecompressionStream } from "node:stream/web";

if (!globalThis.CompressionStream) {
  globalThis.CompressionStream = CompressionStream as typeof globalThis.CompressionStream;
}

if (!globalThis.DecompressionStream) {
  globalThis.DecompressionStream = DecompressionStream as typeof globalThis.DecompressionStream;
}

if (!globalThis.crypto?.randomUUID) {
  let counter = 0;
  globalThis.crypto = {
    ...globalThis.crypto,
    randomUUID: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`,
  };
}
