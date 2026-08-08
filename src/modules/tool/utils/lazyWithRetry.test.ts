import { afterEach, describe, expect, it, vi } from "vitest";
import { loadWithRetry } from "@SHARED/utils/lazyWithRetry";

describe("loadWithRetry", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves when a retry succeeds", async () => {
    const importer = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("network miss"))
      .mockResolvedValueOnce("loaded");

    const resultPromise = loadWithRetry(importer, {
      moduleName: "PalettePanel",
      retries: 1,
      retryDelayMs: 1,
      timeoutMs: 1000,
    });

    await expect(resultPromise).resolves.toBe("loaded");
    expect(importer).toHaveBeenCalledTimes(2);
  });

  it("rejects when the importer does not resolve before timeout", async () => {
    vi.useFakeTimers();
    const importer = vi.fn<() => Promise<string>>(() => new Promise(() => {}));
    const resultPromise = loadWithRetry(importer, {
      moduleName: "SlowPalette",
      retries: 0,
      timeoutMs: 50,
    });
    const assertion = expect(resultPromise).rejects.toThrow("SlowPalette");

    await vi.advanceTimersByTimeAsync(50);

    await assertion;
  });

  it("rejects with the module name after all retries fail", async () => {
    const importer = vi.fn<() => Promise<string>>().mockRejectedValue(new Error("chunk missing"));

    await expect(
      loadWithRetry(importer, {
        moduleName: "MissingPalette",
        retries: 2,
        retryDelayMs: 1,
        timeoutMs: 1000,
      })
    ).rejects.toThrow("MissingPalette");
    expect(importer).toHaveBeenCalledTimes(3);
  });
});
