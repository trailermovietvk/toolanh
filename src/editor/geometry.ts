import type { AspectRatio, CropSettings } from "../types";

export interface Point {
  x: number;
  y: number;
}

export interface Rect extends Point {
  width: number;
  height: number;
}

export interface CompositionGeometry {
  source: Rect;
  destination: Rect;
  outputWidth: number;
  outputHeight: number;
}

export type CropHandle =
  "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const RATIOS: Record<Exclude<AspectRatio, "free">, number> = {
  "1:1": 1,
  "4:5": 4 / 5,
  "3:4": 3 / 4,
  "16:9": 16 / 9,
};

export function ratioValue(ratio: AspectRatio) {
  return ratio === "free" ? null : RATIOS[ratio];
}

export function cropForRatio(
  imageWidth: number,
  imageHeight: number,
  ratio: AspectRatio,
): CropSettings {
  const target = ratioValue(ratio);
  if (!target) {
    return { ratio, x: 0, y: 0, width: imageWidth, height: imageHeight };
  }
  let width = imageWidth;
  let height = width / target;
  if (height > imageHeight) {
    height = imageHeight;
    width = height * target;
  }
  return {
    ratio,
    x: (imageWidth - width) / 2,
    y: (imageHeight - height) / 2,
    width,
    height,
  };
}

export function clampCrop(
  crop: CropSettings,
  imageWidth: number,
  imageHeight: number,
  minimum = 16,
): CropSettings {
  const width = Math.min(imageWidth, Math.max(minimum, crop.width));
  const height = Math.min(imageHeight, Math.max(minimum, crop.height));
  return {
    ...crop,
    width,
    height,
    x: Math.min(imageWidth - width, Math.max(0, crop.x)),
    y: Math.min(imageHeight - height, Math.max(0, crop.y)),
  };
}

export function findMaskBounds(
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  crop: CropSettings,
  threshold = 8,
): Rect | null {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  const startX = Math.max(0, Math.floor(crop.x));
  const endX = Math.min(width, Math.ceil(crop.x + crop.width));
  const startY = Math.max(0, Math.floor(crop.y));
  const endY = Math.min(height, Math.ceil(crop.y + crop.height));
  for (let y = startY; y < endY; y += 1) {
    const row = y * width;
    for (let x = startX; x < endX; x += 1) {
      if (mask[row + x] > threshold) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  return right >= left && bottom >= top
    ? { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
    : null;
}

export function calculateCompositionGeometry(options: {
  crop: CropSettings;
  outputWidth: number;
  outputHeight: number;
  centerSubject?: boolean;
  paddingPercent?: number;
  subjectBounds?: Rect | null;
}): CompositionGeometry {
  let source: Rect = {
    x: options.crop.x,
    y: options.crop.y,
    width: options.crop.width,
    height: options.crop.height,
  };
  let destination: Rect = {
    x: 0,
    y: 0,
    width: options.outputWidth,
    height: options.outputHeight,
  };
  if (options.centerSubject && options.subjectBounds) {
    source = options.subjectBounds;
    const padding =
      Math.min(45, Math.max(0, options.paddingPercent ?? 10)) / 100;
    const availableWidth = options.outputWidth * (1 - padding * 2);
    const availableHeight = options.outputHeight * (1 - padding * 2);
    const scale = Math.min(
      availableWidth / source.width,
      availableHeight / source.height,
    );
    destination = {
      x: (options.outputWidth - source.width * scale) / 2,
      y: (options.outputHeight - source.height * scale) / 2,
      width: source.width * scale,
      height: source.height * scale,
    };
  }
  return {
    source,
    destination,
    outputWidth: options.outputWidth,
    outputHeight: options.outputHeight,
  };
}

export function compositionPointToImage(
  point: Point,
  geometry: CompositionGeometry,
): Point | null {
  const { destination, source } = geometry;
  if (
    point.x < destination.x ||
    point.y < destination.y ||
    point.x > destination.x + destination.width ||
    point.y > destination.y + destination.height
  ) {
    return null;
  }
  return {
    x:
      source.x + ((point.x - destination.x) / destination.width) * source.width,
    y:
      source.y +
      ((point.y - destination.y) / destination.height) * source.height,
  };
}

export function hitTestCrop(
  point: Point,
  crop: CropSettings,
  tolerance: number,
): CropHandle | null {
  const left = crop.x;
  const right = crop.x + crop.width;
  const top = crop.y;
  const bottom = crop.y + crop.height;
  const nearLeft = Math.abs(point.x - left) <= tolerance;
  const nearRight = Math.abs(point.x - right) <= tolerance;
  const nearTop = Math.abs(point.y - top) <= tolerance;
  const nearBottom = Math.abs(point.y - bottom) <= tolerance;
  if (nearTop && nearLeft) return "nw";
  if (nearTop && nearRight) return "ne";
  if (nearBottom && nearLeft) return "sw";
  if (nearBottom && nearRight) return "se";
  if (nearTop && point.x >= left && point.x <= right) return "n";
  if (nearBottom && point.x >= left && point.x <= right) return "s";
  if (nearLeft && point.y >= top && point.y <= bottom) return "w";
  if (nearRight && point.y >= top && point.y <= bottom) return "e";
  if (point.x > left && point.x < right && point.y > top && point.y < bottom)
    return "move";
  return null;
}

export function updateCropFromDrag(options: {
  start: CropSettings;
  startPoint: Point;
  point: Point;
  handle: CropHandle;
  imageWidth: number;
  imageHeight: number;
}): CropSettings {
  const { start, startPoint, point, handle, imageWidth, imageHeight } = options;
  const dx = point.x - startPoint.x;
  const dy = point.y - startPoint.y;
  if (handle === "move") {
    return clampCrop(
      { ...start, x: start.x + dx, y: start.y + dy },
      imageWidth,
      imageHeight,
    );
  }
  let left = start.x;
  let right = start.x + start.width;
  let top = start.y;
  let bottom = start.y + start.height;
  if (handle.includes("w")) left += dx;
  if (handle.includes("e")) right += dx;
  if (handle.includes("n")) top += dy;
  if (handle.includes("s")) bottom += dy;

  const ratio = ratioValue(start.ratio);
  if (ratio) {
    const horizontal = handle.includes("e") || handle.includes("w");
    const vertical = handle.includes("n") || handle.includes("s");
    if (horizontal && vertical) {
      const anchorX = handle.includes("w") ? right : left;
      const anchorY = handle.includes("n") ? bottom : top;
      let width = Math.max(16, Math.abs(right - left));
      let height = Math.max(16, Math.abs(bottom - top));
      if (width / height > ratio) height = width / ratio;
      else width = height * ratio;
      left = handle.includes("w") ? anchorX - width : anchorX;
      right = handle.includes("w") ? anchorX : anchorX + width;
      top = handle.includes("n") ? anchorY - height : anchorY;
      bottom = handle.includes("n") ? anchorY : anchorY + height;
    } else if (horizontal) {
      const height = Math.max(16, Math.abs(right - left)) / ratio;
      const centerY = (top + bottom) / 2;
      top = centerY - height / 2;
      bottom = centerY + height / 2;
    } else {
      const width = Math.max(16, Math.abs(bottom - top)) * ratio;
      const centerX = (left + right) / 2;
      left = centerX - width / 2;
      right = centerX + width / 2;
    }
    let width = Math.abs(right - left);
    let height = Math.abs(bottom - top);
    const scale = Math.min(1, imageWidth / width, imageHeight / height);
    width *= scale;
    height *= scale;
    return {
      ...start,
      x: Math.min(imageWidth - width, Math.max(0, Math.min(left, right))),
      y: Math.min(imageHeight - height, Math.max(0, Math.min(top, bottom))),
      width,
      height,
    };
  }
  return clampCrop(
    {
      ...start,
      x: Math.min(left, right),
      y: Math.min(top, bottom),
      width: Math.abs(right - left),
      height: Math.abs(bottom - top),
    },
    imageWidth,
    imageHeight,
  );
}
