import type { IceCandidateCounts, SignalDescription } from "../types";

const HANDSHAKE_ICE_LIMITS: Record<string, number> = {
  host: 8,
  srflx: 16,
  relay: Infinity,
};
const SKIP_LINE_PREFIXES = ["a=extmap:", "a=msid:", "a=ssrc:", "a=rtcp-fb:"];

function splitSdpLines(sdp: string): string[] {
  return sdp.split(/\r?\n/).map((line) => line.replace(/\r/g, ""));
}

export function countIceCandidatesInSdp(sdp: string | null | undefined): IceCandidateCounts {
  const counts: IceCandidateCounts = { host: 0, srflx: 0, relay: 0, total: 0 };
  if (!sdp) return counts;

  for (const line of splitSdpLines(sdp)) {
    if (!line.startsWith("a=candidate:")) continue;
    counts.total += 1;
    const typ = line.match(/ typ ([a-z]+)/)?.[1] || "host";
    if (typ in counts && typ !== "total") {
      counts[typ as keyof Omit<IceCandidateCounts, "total">] += 1;
    } else {
      counts.host += 1;
    }
  }

  return counts;
}

export function formatIceCandidateCounts(counts: IceCandidateCounts | null | undefined): string {
  if (!counts) return "кандидатов нет";
  return `host=${counts.host}, srflx=${counts.srflx}, relay=${counts.relay}`;
}

export function normalizeSdp(sdp: string | null | undefined): string | null | undefined {
  if (!sdp) return sdp;

  const lines = splitSdpLines(sdp).filter((line) => line.length > 0);
  if (lines.length === 0) return sdp;

  return `${lines.join("\r\n")}\r\n`;
}

export function trimSdp(sdp: string | null | undefined): string | null | undefined {
  if (!sdp) return sdp;

  const iceCounts: Record<string, number> = { host: 0, srflx: 0, relay: 0 };
  const lines = splitSdpLines(sdp);

  const trimmed = lines.filter((line) => {
    if (!line) return false;

    if (SKIP_LINE_PREFIXES.some((prefix) => line.startsWith(prefix))) {
      return false;
    }

    if (!line.startsWith("a=candidate:")) {
      return true;
    }

    const typ = line.match(/ typ ([a-z]+)/)?.[1] || "host";
    const limit = HANDSHAKE_ICE_LIMITS[typ] ?? HANDSHAKE_ICE_LIMITS.host;
    if (Number.isFinite(limit) && iceCounts[typ] >= limit) {
      return false;
    }

    iceCounts[typ] += 1;
    return true;
  });

  return normalizeSdp(trimmed.join("\r\n"));
}

export function packSignalDescription(
  description: RTCSessionDescriptionInit | null | undefined,
): SignalDescription | null | undefined {
  if (!description?.type || !description.sdp) return description as null | undefined;

  return {
    type: description.type,
    sdp: trimSdp(description.sdp) ?? description.sdp,
  };
}

export function toSessionDescription(signal: SignalDescription): RTCSessionDescription {
  if (!signal?.type || !signal?.sdp) {
    throw new Error("Invalid signal description");
  }

  return new RTCSessionDescription({
    type: signal.type,
    sdp: normalizeSdp(signal.sdp) ?? signal.sdp,
  });
}
