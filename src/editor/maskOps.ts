export function refineAlphaMask(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.max(1, Math.min(5, Math.round(radius)));
  const horizontal = new Uint8ClampedArray(source.length);
  const output = new Uint8ClampedArray(source.length);

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let sum = 0;
    let count = 0;
    for (let x = -safeRadius; x < width + safeRadius; x += 1) {
      const addX = x + safeRadius;
      if (addX < width) {
        sum += source[row + Math.max(0, addX)];
        count += 1;
      }
      const removeX = x - safeRadius - 1;
      if (removeX >= 0) {
        sum -= source[row + removeX];
        count -= 1;
      }
      if (x >= 0 && x < width) horizontal[row + x] = Math.round(sum / count);
    }
  }

  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    let count = 0;
    for (let y = -safeRadius; y < height + safeRadius; y += 1) {
      const addY = y + safeRadius;
      if (addY < height) {
        sum += horizontal[Math.max(0, addY) * width + x];
        count += 1;
      }
      const removeY = y - safeRadius - 1;
      if (removeY >= 0) {
        sum -= horizontal[removeY * width + x];
        count -= 1;
      }
      if (y >= 0 && y < height) output[y * width + x] = Math.round(sum / count);
    }
  }
  return output;
}

export function maskDimensionsAreValid(
  mask: Uint8ClampedArray,
  width: number,
  height: number,
) {
  return width > 0 && height > 0 && mask.length === width * height;
}
