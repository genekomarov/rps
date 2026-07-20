import { describe, expect, it } from "vitest";
import { isScreenWakeLockSupported } from "./useScreenWakeLock";

describe("isScreenWakeLockSupported", () => {
  it("returns false when wakeLock is missing", () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {},
    });

    expect(isScreenWakeLockSupported()).toBe(false);

    if (original) {
      Object.defineProperty(globalThis, "navigator", original);
    }
  });

  it("returns true when wakeLock exists", () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { wakeLock: {} },
    });

    expect(isScreenWakeLockSupported()).toBe(true);

    if (original) {
      Object.defineProperty(globalThis, "navigator", original);
    }
  });
});
