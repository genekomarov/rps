import { describe, expect, it } from "vitest";
import { buildHash, parseHash } from "./hashRouter";

describe("parseHash", () => {
  it("parses empty hash as welcome", () => {
    expect(parseHash("")).toEqual({ name: "welcome" });
    expect(parseHash("#")).toEqual({ name: "welcome" });
    expect(parseHash("#/")).toEqual({ name: "welcome" });
  });

  it("parses connection route", () => {
    expect(parseHash("#/connection")).toEqual({ name: "connection" });
  });

  it("parses game routes", () => {
    expect(parseHash("#/games/chat")).toEqual({ name: "game", gameId: "chat" });
  });

  it("falls back to welcome for unknown paths", () => {
    expect(parseHash("#/unknown")).toEqual({ name: "welcome" });
    expect(parseHash("#/games/")).toEqual({ name: "welcome" });
  });
});

describe("buildHash", () => {
  it("builds known routes", () => {
    expect(buildHash({ name: "welcome" })).toBe("#/");
    expect(buildHash({ name: "connection" })).toBe("#/connection");
    expect(buildHash({ name: "game", gameId: "chat" })).toBe("#/games/chat");
  });
});
