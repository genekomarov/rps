import { describe, expect, it } from "vitest";
import { PHASE, getPhaseMeta, resolvePhase } from "./sessionPhase";

describe("resolvePhase", () => {
  it("returns CONNECTING when busy", () => {
    expect(
      resolvePhase({
        nickname: "Alice",
        hostOfferCode: "code",
        answerCode: "answer",
        peers: [{ id: "p1", name: "Peer 1" }],
        busy: true,
      }),
    ).toBe(PHASE.CONNECTING);
  });

  it("returns CHAT when peers are connected", () => {
    expect(
      resolvePhase({
        nickname: "Alice",
        hostOfferCode: "",
        answerCode: "",
        peers: [{ id: "p1", name: "Peer 1" }],
        busy: false,
      }),
    ).toBe(PHASE.CHAT);
  });

  it("returns GUEST_ANSWER when answer code is present", () => {
    expect(
      resolvePhase({
        nickname: "Bob",
        hostOfferCode: "",
        answerCode: "guest-answer",
        peers: [],
        busy: false,
      }),
    ).toBe(PHASE.GUEST_ANSWER);
  });

  it("returns HOST_OFFER when host offer code is present", () => {
    expect(
      resolvePhase({
        nickname: "Alice",
        hostOfferCode: "host-offer",
        answerCode: "",
        peers: [],
        busy: false,
      }),
    ).toBe(PHASE.HOST_OFFER);
  });

  it("returns READY when nickname is set", () => {
    expect(
      resolvePhase({
        nickname: "Alice",
        hostOfferCode: "",
        answerCode: "",
        peers: [],
        busy: false,
      }),
    ).toBe(PHASE.READY);
  });

  it("returns SETUP when nickname is empty", () => {
    expect(
      resolvePhase({
        nickname: "",
        hostOfferCode: "",
        answerCode: "",
        peers: [],
        busy: false,
      }),
    ).toBe(PHASE.SETUP);
  });

  it("ignores whitespace-only nickname", () => {
    expect(
      resolvePhase({
        nickname: "   ",
        hostOfferCode: "",
        answerCode: "",
        peers: [],
        busy: false,
      }),
    ).toBe(PHASE.SETUP);
  });
});

describe("getPhaseMeta", () => {
  it("returns title and hint for every known phase", () => {
    for (const phase of Object.values(PHASE)) {
      const meta = getPhaseMeta(phase);
      expect(meta.title).toBeTruthy();
      expect(typeof meta.hint).toBe("string");
    }
  });

  it("returns fallback for unknown phase", () => {
    expect(getPhaseMeta("unknown")).toEqual({
      title: "Подключение",
      hint: "",
    });
  });
});
