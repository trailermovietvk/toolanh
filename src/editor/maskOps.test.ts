import { describe, expect, it } from "vitest";
import { maskDimensionsAreValid, refineAlphaMask } from "./maskOps";

describe("mask operations", () => {
  it("validates full-resolution mask dimensions", () => {
    expect(maskDimensionsAreValid(new Uint8ClampedArray(12), 4, 3)).toBe(true);
    expect(maskDimensionsAreValid(new Uint8ClampedArray(11), 4, 3)).toBe(false);
  });

  it("softens only the alpha transition without changing dimensions", () => {
    const mask = new Uint8ClampedArray(25);
    mask[12] = 255;
    const refined = refineAlphaMask(mask, 5, 5, 1);
    expect(refined).toHaveLength(mask.length);
    expect(refined[12]).toBeGreaterThan(0);
    expect(refined[12]).toBeLessThan(255);
  });
});
