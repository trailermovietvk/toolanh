import { describe, expect, it } from "vitest";
import {
  calculateCompositionGeometry,
  compositionPointToImage,
  cropForRatio,
  findMaskBounds,
  hitTestCrop,
  updateCropFromDrag,
} from "./geometry";

describe("editor geometry", () => {
  it("calculates centered aspect-ratio crops", () => {
    expect(cropForRatio(1200, 800, "1:1")).toEqual({
      ratio: "1:1",
      x: 200,
      y: 0,
      width: 800,
      height: 800,
    });
  });

  it("maps composition points back to full-resolution mask coordinates", () => {
    const geometry = calculateCompositionGeometry({
      crop: { ratio: "1:1", x: 200, y: 0, width: 800, height: 800 },
      outputWidth: 400,
      outputHeight: 400,
    });
    expect(compositionPointToImage({ x: 100, y: 200 }, geometry)).toEqual({
      x: 400,
      y: 400,
    });
  });

  it("centers mask bounds with padding", () => {
    const mask = new Uint8ClampedArray(100);
    for (let y = 2; y < 8; y += 1)
      for (let x = 3; x < 7; x += 1) mask[y * 10 + x] = 255;
    const crop = { ratio: "free" as const, x: 0, y: 0, width: 10, height: 10 };
    const bounds = findMaskBounds(mask, 10, 10, crop);
    expect(bounds).toEqual({ x: 3, y: 2, width: 4, height: 6 });
    const geometry = calculateCompositionGeometry({
      crop,
      outputWidth: 100,
      outputHeight: 100,
      centerSubject: true,
      paddingPercent: 10,
      subjectBounds: bounds,
    });
    expect(geometry.destination.height).toBe(80);
    expect(geometry.destination.y).toBe(10);
  });

  it("moves and resizes a crop while preserving a preset ratio", () => {
    const start = {
      ratio: "1:1" as const,
      x: 20,
      y: 20,
      width: 60,
      height: 60,
    };
    expect(hitTestCrop({ x: 20, y: 20 }, start, 3)).toBe("nw");
    const resized = updateCropFromDrag({
      start,
      startPoint: { x: 20, y: 20 },
      point: { x: 30, y: 35 },
      handle: "nw",
      imageWidth: 100,
      imageHeight: 100,
    });
    expect(resized.width / resized.height).toBeCloseTo(1);
  });

  it("keeps a preset ratio when a drag reaches the image boundary", () => {
    const resized = updateCropFromDrag({
      start: {
        ratio: "16:9",
        x: 20,
        y: 20,
        width: 64,
        height: 36,
      },
      startPoint: { x: 84, y: 56 },
      point: { x: 180, y: 120 },
      handle: "se",
      imageWidth: 100,
      imageHeight: 70,
    });
    expect(resized.width / resized.height).toBeCloseTo(16 / 9);
    expect(resized.x + resized.width).toBeLessThanOrEqual(100);
    expect(resized.y + resized.height).toBeLessThanOrEqual(70);
  });
});
