const ICE_LIMITS = { host: 5, srflx: 5, relay: 2 };
const SKIP_LINE_PREFIXES = ["a=extmap:", "a=msid:", "a=ssrc:", "a=rtcp-fb:"];

function splitSdpLines(sdp) {
  return sdp.split(/\r?\n/).map((line) => line.replace(/\r/g, ""));
}

export function normalizeSdp(sdp) {
  if (!sdp) return sdp;

  const lines = splitSdpLines(sdp).filter((line) => line.length > 0);
  if (lines.length === 0) return sdp;

  return `${lines.join("\r\n")}\r\n`;
}

export function trimSdp(sdp) {
  if (!sdp) return sdp;

  const iceCounts = { host: 0, srflx: 0, relay: 0 };
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
    const limit = ICE_LIMITS[typ] ?? 0;
    if (iceCounts[typ] >= limit) {
      return false;
    }

    iceCounts[typ] += 1;
    return true;
  });

  return normalizeSdp(trimmed.join("\r\n"));
}

export function packSignalDescription(description) {
  if (!description) return description;

  return {
    type: description.type,
    sdp: trimSdp(description.sdp),
  };
}

export function toSessionDescription(signal) {
  if (!signal?.type || !signal?.sdp) {
    throw new Error("Invalid signal description");
  }

  return new RTCSessionDescription({
    type: signal.type,
    sdp: normalizeSdp(signal.sdp),
  });
}
