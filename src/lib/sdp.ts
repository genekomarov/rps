import type { IceCandidateCounts, SignalDescription } from "../types";

const HANDSHAKE_HOST_LIMIT = 1;
const SKIP_LINE_PREFIXES = ["a=extmap:", "a=msid:", "a=ssrc:", "a=rtcp-fb:"];
const IPV4_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;

function splitSdpLines(sdp: string): string[] {
  return sdp.split(/\r?\n/).map((line) => line.replace(/\r/g, ""));
}

function isIpv4(address: string): boolean {
  return IPV4_RE.test(address);
}

function isPrivateIpv4(address: string): boolean {
  if (!isIpv4(address)) return false;
  const [a, b] = address.split(".").map(Number);
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

/** Higher score = better LAN handshake candidate (short + directly reachable). */
function scoreHostCandidate(address: string, priority: number): number {
  let score = priority;
  if (isIpv4(address)) {
    score += 1_000_000_000;
    if (isPrivateIpv4(address)) score += 100_000_000;
    if (address.startsWith("169.254.")) score -= 50_000_000;
  } else if (address.includes(":")) {
    score += 500_000_000;
  } else if (address.toLowerCase().endsWith(".local")) {
    score += 100_000_000;
  }
  return score;
}

function parseCandidateLine(line: string): {
  typ: string;
  address: string;
  priority: number;
} | null {
  if (!line.startsWith("a=candidate:")) return null;
  const parts = line.slice("a=candidate:".length).split(/\s+/);
  if (parts.length < 8) return null;

  const typIndex = parts.indexOf("typ");
  const typ = typIndex >= 0 ? parts[typIndex + 1] || "host" : "host";
  const priority = Number(parts[3]) || 0;
  const address = parts[4] || "";

  return { typ, address, priority };
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

  const lines = splitSdpLines(sdp);
  const kept: string[] = [];
  const hostCandidates: { line: string; score: number }[] = [];

  for (const line of lines) {
    if (!line) continue;

    if (SKIP_LINE_PREFIXES.some((prefix) => line.startsWith(prefix))) {
      continue;
    }

    if (!line.startsWith("a=candidate:")) {
      kept.push(line);
      continue;
    }

    const parsed = parseCandidateLine(line);
    if (!parsed || parsed.typ !== "host") {
      continue;
    }

    hostCandidates.push({
      line,
      score: scoreHostCandidate(parsed.address, parsed.priority),
    });
  }

  hostCandidates
    .sort((a, b) => b.score - a.score)
    .slice(0, HANDSHAKE_HOST_LIMIT)
    .forEach((candidate) => kept.push(candidate.line));

  return normalizeSdp(kept.join("\r\n"));
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
