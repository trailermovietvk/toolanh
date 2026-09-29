import { describe, expect, it } from "vitest";
import { calculateOutputSize, createOpaqueMask, formatBytes } from "./image";

describe("image utilities", () => {
  it("creates a fully opaque mask", () => {
    expect(Array.from(createOpaqueMask(2, 2))).toEqual([255, 255, 255, 255]);
  });

  it("calculates percentage output dimensions", () => {
    expect(
      calculateOutputSize(
        { ratio: "free", x: 0, y: 0, width: 1200, height: 800 },
        { width: 1200, height: 800, keepRatio: true, percentage: 50 },
      ),
    ).toEqual({ width: 600, height: 400 });
  });

  it("formats file sizes", () => {
    expect(formatBytes(1536)).toBe("1.5 KB");
  });
});
