const ICE_LIMITS = { host: 3, srflx: 3, relay: 0 };
const SKIP_LINE_PREFIXES = ["a=extmap:", "a=msid:", "a=ssrc:", "a=rtcp-fb:"];

export function trimSdp(sdp) {
  if (!sdp) return sdp;

  const iceCounts = { host: 0, srflx: 0, relay: 0 };
  const lines = sdp.split(/\r?\n/);

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

  return trimmed.join("\r\n");
}

export function packSignalDescription(description) {
  if (!description) return description;

  return {
    type: description.type,
    sdp: trimSdp(description.sdp),
  };
}
