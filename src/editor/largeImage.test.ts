import { describe, expect, it } from "vitest";
import { findMaskBounds } from "./geometry";
import { MaskHistory } from "./maskHistory";

describe("large image safety", () => {
  it.each([
    [10_000_000, 4000, 2500],
    [20_000_000, 5000, 4000],
    [40_000_000, 8000, 5000],
  ])("keeps sparse editing bounded for %i pixels", (pixels, width, height) => {
    const mask = new Uint8ClampedArray(pixels);
    const center = Math.floor(height / 2) * width + Math.floor(width / 2);
    mask[center] = 255;
    const crop = {
      ratio: "free" as const,
      x: width / 2 - 2,
      y: height / 2 - 2,
      width: 5,
      height: 5,
    };
    expect(findMaskBounds(mask, width, height, crop)).not.toBeNull();

    const history = new MaskHistory(1024);
    history.begin();
    history.record(center, mask[center]);
    mask[center] = 128;
    history.commit(mask);
    expect(history.memoryBytes).toBe(6);
    expect(history.undo(mask)).toBe(true);
    expect(mask[center]).toBe(255);
  });
});
