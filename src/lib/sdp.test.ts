import { describe, expect, it, vi } from "vitest";
import type { SignalDescription } from "../types";
import {
  countIceCandidatesInSdp,
  formatIceCandidateCounts,
  normalizeSdp,
  packSignalDescription,
  toSessionDescription,
  trimSdp,
} from "./sdp";

const SAMPLE_SDP = [
  "v=0",
  "o=- 0 0 IN IP4 127.0.0.1",
  "s=-",
  "t=0 0",
  "a=extmap:1 urn:ietf:params:rtp-hdrext:toffset",
  "a=candidate:1 1 UDP 2130706431 192.168.1.1 54321 typ host",
  "a=candidate:2 1 UDP 1694498815 203.0.113.1 54321 typ srflx",
  "a=candidate:3 1 UDP 16777215 relay.example.com 54321 typ relay",
  "a=candidate:4 1 UDP 2130706431 10.0.0.2 54321 typ host",
].join("\n");

describe("countIceCandidatesInSdp", () => {
  it("returns zero counts for empty sdp", () => {
    expect(countIceCandidatesInSdp(null)).toEqual({
      host: 0,
      srflx: 0,
      relay: 0,
      total: 0,
    });
  });

  it("counts candidates by type", () => {
    expect(countIceCandidatesInSdp(SAMPLE_SDP)).toEqual({
      host: 2,
      srflx: 1,
      relay: 1,
      total: 4,
    });
  });

  it("treats unknown typ as host", () => {
    const sdp = "a=candidate:1 1 UDP 1 1.1.1.1 1 typ prflx";
    expect(countIceCandidatesInSdp(sdp).host).toBe(1);
  });
});

describe("formatIceCandidateCounts", () => {
  it("formats counts", () => {
    expect(formatIceCandidateCounts({ host: 1, srflx: 2, relay: 3, total: 6 })).toBe(
      "host=1, srflx=2, relay=3",
    );
  });

  it("handles missing counts", () => {
    expect(formatIceCandidateCounts(null)).toBe("кандидатов нет");
  });
});

describe("normalizeSdp", () => {
  it("returns falsy input unchanged", () => {
    expect(normalizeSdp("")).toBe("");
    expect(normalizeSdp(null)).toBe(null);
  });

  it("normalizes line endings and trailing CRLF", () => {
    const normalized = normalizeSdp("v=0\ns=-\n");
    expect(normalized).toBe("v=0\r\ns=-\r\n");
  });
});

describe("trimSdp", () => {
  it("removes skipped attribute lines and non-host candidates", () => {
    const trimmed = trimSdp(SAMPLE_SDP);
    expect(trimmed).not.toContain("a=extmap:");
    expect(trimmed).not.toContain("typ srflx");
    expect(trimmed).not.toContain("typ relay");
    expect(trimmed).toContain("typ host");
  });

  it("keeps a single best private IPv4 host candidate", () => {
    const sdp = [
      "v=0",
      "a=candidate:1 1 UDP 100 169.254.1.1 1 typ host",
      "a=candidate:2 1 UDP 200 abcdef.local 1 typ host",
      "a=candidate:3 1 UDP 150 192.168.1.10 1 typ host",
      "a=candidate:4 1 UDP 180 2001:db8::1 1 typ host",
    ].join("\r\n");

    const trimmed = trimSdp(sdp)!;
    const counts = countIceCandidatesInSdp(trimmed);
    expect(counts).toEqual({ host: 1, srflx: 0, relay: 0, total: 1 });
    expect(trimmed).toContain("192.168.1.10");
    expect(trimmed).not.toContain("abcdef.local");
    expect(trimmed).not.toContain("2001:db8::1");
  });

  it("drops all relay and srflx candidates", () => {
    const relays = Array.from({ length: 5 }, (_, index) =>
      `a=candidate:r${index} 1 UDP 1 relay${index}.test 1 typ relay`,
    ).join("\r\n");
    const sdp = `v=0\r\n${relays}\r\na=candidate:s1 1 UDP 1 1.2.3.4 1 typ srflx`;

    expect(countIceCandidatesInSdp(trimSdp(sdp))).toEqual({
      host: 0,
      srflx: 0,
      relay: 0,
      total: 0,
    });
  });
});

describe("packSignalDescription", () => {
  it("trims sdp in description", () => {
    const packed = packSignalDescription({
      type: "offer",
      sdp: SAMPLE_SDP,
    })!;

    expect(packed.type).toBe("offer");
    expect(packed.sdp).not.toContain("a=extmap:");
    expect(countIceCandidatesInSdp(packed.sdp).total).toBe(1);
  });

  it("returns falsy description unchanged", () => {
    expect(packSignalDescription(null)).toBe(null);
  });
});

describe("toSessionDescription", () => {
  it("creates RTCSessionDescription with normalized sdp", () => {
    class MockRTCSessionDescription {
      type: RTCSdpType;
      sdp: string;

      constructor(init: RTCSessionDescriptionInit) {
        this.type = init.type!;
        this.sdp = init.sdp!;
      }
    }
    vi.stubGlobal("RTCSessionDescription", MockRTCSessionDescription);

    const description = toSessionDescription({
      type: "offer",
      sdp: "v=0\ns=-\n",
    });

    expect(description.type).toBe("offer");
    expect(description.sdp).toBe("v=0\r\ns=-\r\n");

    vi.unstubAllGlobals();
  });

  it("throws on invalid signal", () => {
    expect(() => toSessionDescription({ type: "offer" } as SignalDescription)).toThrow(
      "Invalid signal description",
    );
  });
});
