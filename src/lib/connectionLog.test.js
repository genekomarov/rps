import { describe, expect, it } from "vitest";
import {
  LOG_LIMIT,
  createLogEntry,
  formatLogTime,
  trimLogEntries,
} from "./connectionLog";

describe("connectionLog", () => {
  it("formats time in ru-RU locale", () => {
    const formatted = formatLogTime(Date.UTC(2026, 0, 1, 12, 30, 45));
    expect(formatted).toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  it("creates log entry with id, time, level and message", () => {
    const entry = createLogEntry("info", "connected");

    expect(entry.level).toBe("info");
    expect(entry.message).toBe("connected");
    expect(typeof entry.id).toBe("string");
    expect(typeof entry.time).toBe("number");
  });

  it("trims log entries to limit", () => {
    const entries = Array.from({ length: LOG_LIMIT + 5 }, (_, index) => ({
      id: String(index),
    }));

    const trimmed = trimLogEntries(entries);
    expect(trimmed).toHaveLength(LOG_LIMIT);
    expect(trimmed[0].id).toBe("5");
    expect(trimmed.at(-1).id).toBe(String(LOG_LIMIT + 4));
  });

  it("returns same array when within limit", () => {
    const entries = [{ id: "1" }, { id: "2" }];
    expect(trimLogEntries(entries)).toBe(entries);
  });
});
