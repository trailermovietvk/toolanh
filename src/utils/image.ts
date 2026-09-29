import type {
  BackgroundSettings,
  CropSettings,
  ResizeSettings,
  ShadowSettings,
  SourceImage,
} from "../types";
import {
  calculateCompositionGeometry,
  findMaskBounds,
  type CompositionGeometry,
  type Rect,
} from "../editor/geometry";

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_PIXELS = 40_000_000;

export async function loadSourceImage(file: File): Promise<SourceImage> {
  if (!ACCEPTED_TYPES.includes(file.type))
    throw new Error("Chỉ hỗ trợ ảnh JPG, JPEG, PNG hoặc WEBP.");
  if (file.size > MAX_FILE_BYTES)
    throw new Error("Ảnh vượt quá 50 MB. Hãy nén ảnh hoặc chọn ảnh nhỏ hơn.");
  const url = URL.createObjectURL(file);
  try {
    const element = new Image();
    element.decoding = "async";
    element.src = url;
    await element.decode();
    if (!element.naturalWidth || !element.naturalHeight)
      throw new Error("Không thể đọc kích thước ảnh.");
    if (element.naturalWidth * element.naturalHeight > MAX_PIXELS) {
      throw new Error(
        "Ảnh vượt quá 40 megapixel và có thể làm trình duyệt hết bộ nhớ.",
      );
    }
    return {
      file,
      url,
      element,
      width: element.naturalWidth,
      height: element.naturalHeight,
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

export function createOpaqueMask(width: number, height: number) {
  const data = new Uint8ClampedArray(width * height);
  data.fill(255);
  return data;
}

export function maskToCanvas(
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  targetWidth = width,
  targetHeight = height,
) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(targetWidth));
  canvas.height = Math.max(1, Math.round(targetHeight));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Trình duyệt không hỗ trợ Canvas 2D.");
  const rgba = context.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y += 1) {
    const sourceY = Math.min(
      height - 1,
      Math.max(0, Math.round(((y + 0.5) * height) / canvas.height - 0.5)),
    );
    for (let x = 0; x < canvas.width; x += 1) {
      const sourceX = Math.min(
        width - 1,
        Math.max(0, Math.round(((x + 0.5) * width) / canvas.width - 0.5)),
      );
      const pixel = y * canvas.width + x;
      const index = pixel * 4;
      rgba.data[index] = 255;
      rgba.data[index + 1] = 255;
      rgba.data[index + 2] = 255;
      rgba.data[index + 3] = mask[sourceY * width + sourceX];
    }
  }
  context.putImageData(rgba, 0, 0);
  return canvas;
}

function drawCover(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  imageWidth: number,
  imageHeight: number,
  width: number,
  height: number,
  fit: "cover" | "contain",
) {
  const scale =
    fit === "cover"
      ? Math.max(width / imageWidth, height / imageHeight)
      : Math.min(width / imageWidth, height / imageHeight);
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  context.drawImage(
    image,
    (width - drawWidth) / 2,
    (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

function sampleMask(
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
) {
  const x0 = Math.max(0, Math.min(width - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(height - 1, Math.floor(y)));
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = Math.max(0, Math.min(1, x - x0));
  const fy = Math.max(0, Math.min(1, y - y0));
  const top = mask[y0 * width + x0] * (1 - fx) + mask[y0 * width + x1] * fx;
  const bottom = mask[y1 * width + x0] * (1 - fx) + mask[y1 * width + x1] * fx;
  return Math.round(top * (1 - fy) + bottom * fy);
}

function createMaskTile(
  mask: Uint8ClampedArray,
  maskWidth: number,
  maskHeight: number,
  source: Rect,
  destination: Rect,
  tile: Rect,
) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(tile.width));
  canvas.height = Math.max(1, Math.round(tile.height));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Không thể tạo mask tile.");
  const pixels = context.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y += 1) {
    const sourceY =
      source.y +
      ((tile.y + y + 0.5 - destination.y) / destination.height) *
        source.height -
      0.5;
    for (let x = 0; x < canvas.width; x += 1) {
      const sourceX =
        source.x +
        ((tile.x + x + 0.5 - destination.x) / destination.width) *
          source.width -
        0.5;
      const index = (y * canvas.width + x) * 4;
      pixels.data[index] = 255;
      pixels.data[index + 1] = 255;
      pixels.data[index + 2] = 255;
      pixels.data[index + 3] = sampleMask(
        mask,
        maskWidth,
        maskHeight,
        sourceX,
        sourceY,
      );
    }
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
}

function decontaminateEdgeColors(
  context: CanvasRenderingContext2D,
  maskCanvas: HTMLCanvasElement,
) {
  const width = maskCanvas.width;
  const height = maskCanvas.height;
  const image = context.getImageData(0, 0, width, height);
  const maskContext = maskCanvas.getContext("2d", { willReadFrequently: true });
  if (!maskContext) return;
  const alpha = maskContext.getImageData(0, 0, width, height).data;
  const directions = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const value = alpha[index + 3];
      if (value < 12 || value > 235) continue;
      let found = -1;
      for (let radius = 1; radius <= 3 && found < 0; radius += 1) {
        for (const [dx, dy] of directions) {
          const sampleX = x + dx * radius;
          const sampleY = y + dy * radius;
          if (
            sampleX < 0 ||
            sampleY < 0 ||
            sampleX >= width ||
            sampleY >= height
          )
            continue;
          const sample = (sampleY * width + sampleX) * 4;
          if (alpha[sample + 3] > 245) {
            found = sample;
            break;
          }
        }
      }
      if (found >= 0) {
        image.data[index] = image.data[found];
        image.data[index + 1] = image.data[found + 1];
        image.data[index + 2] = image.data[found + 2];
      }
    }
  }
  context.putImageData(image, 0, 0);
}

export interface RenderOptions {
  image: HTMLImageElement;
  mask: Uint8ClampedArray;
  maskWidth: number;
  maskHeight: number;
  background: BackgroundSettings;
  shadow: ShadowSettings;
  crop: CropSettings;
  outputWidth: number;
  outputHeight: number;
  centerSubject?: boolean;
  paddingPercent?: number;
  subjectBounds?: Rect | null;
  maxWorkingPixels?: number;
  referenceWidth?: number;
}

export interface CompositionResult {
  canvas: HTMLCanvasElement;
  geometry: CompositionGeometry;
}

export function renderComposition(options: RenderOptions): HTMLCanvasElement {
  return renderCompositionWithGeometry(options).canvas;
}

export function renderCompositionWithGeometry(
  options: RenderOptions,
): CompositionResult {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(options.outputWidth));
  canvas.height = Math.max(1, Math.round(options.outputHeight));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Không thể tạo vùng xuất ảnh.");
  const { crop } = options;
  const referenceScale =
    canvas.width / Math.max(1, options.referenceWidth ?? canvas.width);

  if (options.background.mode !== "transparent") {
    context.save();
    if (
      options.background.mode === "image" &&
      options.background.imageElement
    ) {
      context.filter = options.background.blur
        ? "blur(" + options.background.blur * referenceScale + "px)"
        : "none";
      const extra = options.background.blur * referenceScale * 2;
      context.translate(-extra, -extra);
      drawCover(
        context,
        options.background.imageElement,
        options.background.imageElement.naturalWidth,
        options.background.imageElement.naturalHeight,
        canvas.width + extra * 2,
        canvas.height + extra * 2,
        options.background.fit,
      );
    } else {
      const colors = {
        white: "#ffffff",
        black: "#000000",
        color: options.background.color,
      };
      context.fillStyle =
        colors[options.background.mode as keyof typeof colors] ?? "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.restore();
  }

  const subjectBounds =
    options.subjectBounds ??
    (options.centerSubject
      ? findMaskBounds(
          options.mask,
          options.maskWidth,
          options.maskHeight,
          crop,
        )
      : null);
  const geometry = calculateCompositionGeometry({
    crop,
    outputWidth: canvas.width,
    outputHeight: canvas.height,
    centerSubject: options.centerSubject,
    paddingPercent: options.paddingPercent,
    subjectBounds,
  });
  const { source, destination } = geometry;
  if (options.shadow.enabled) {
    const shadowScale = Math.min(
      1,
      Math.sqrt(2_000_000 / (canvas.width * canvas.height)),
    );
    const shadowCanvas = document.createElement("canvas");
    shadowCanvas.width = Math.max(1, Math.round(canvas.width * shadowScale));
    shadowCanvas.height = Math.max(1, Math.round(canvas.height * shadowScale));
    const shadowContext = shadowCanvas.getContext("2d");
    if (!shadowContext) throw new Error("Không thể tạo bóng.");
    const scaledDestination = {
      x: destination.x * shadowScale,
      y: destination.y * shadowScale,
      width: destination.width * shadowScale,
      height: destination.height * shadowScale,
    };
    const silhouette = createMaskTile(
      options.mask,
      options.maskWidth,
      options.maskHeight,
      source,
      scaledDestination,
      scaledDestination,
    );
    shadowContext.shadowColor = `rgba(0,0,0,${options.shadow.opacity})`;
    shadowContext.shadowBlur =
      options.shadow.blur * referenceScale * shadowScale;
    shadowContext.shadowOffsetX =
      options.shadow.offsetX * referenceScale * shadowScale;
    shadowContext.shadowOffsetY =
      options.shadow.offsetY * referenceScale * shadowScale;
    shadowContext.drawImage(
      silhouette,
      scaledDestination.x,
      scaledDestination.y,
    );
    shadowContext.globalCompositeOperation = "destination-out";
    shadowContext.shadowColor = "transparent";
    shadowContext.drawImage(
      silhouette,
      scaledDestination.x,
      scaledDestination.y,
    );
    context.drawImage(shadowCanvas, 0, 0, canvas.width, canvas.height);
  }

  const tileEdge = Math.max(
    256,
    Math.min(
      1024,
      Math.floor(Math.sqrt(options.maxWorkingPixels ?? 1_048_576)),
    ),
  );
  const startX = Math.floor(destination.x);
  const startY = Math.floor(destination.y);
  const endX = Math.ceil(destination.x + destination.width);
  const endY = Math.ceil(destination.y + destination.height);
  for (let y = startY; y < endY; y += tileEdge) {
    for (let x = startX; x < endX; x += tileEdge) {
      const tile: Rect = {
        x,
        y,
        width: Math.min(tileEdge, endX - x),
        height: Math.min(tileEdge, endY - y),
      };
      const tileCanvas = document.createElement("canvas");
      tileCanvas.width = tile.width;
      tileCanvas.height = tile.height;
      const tileContext = tileCanvas.getContext("2d");
      if (!tileContext) throw new Error("Không thể tạo image tile.");
      const sourceX =
        source.x +
        ((tile.x - destination.x) / destination.width) * source.width;
      const sourceY =
        source.y +
        ((tile.y - destination.y) / destination.height) * source.height;
      const sourceWidth = (tile.width / destination.width) * source.width;
      const sourceHeight = (tile.height / destination.height) * source.height;
      tileContext.drawImage(
        options.image,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        tile.width,
        tile.height,
      );
      const maskTile = createMaskTile(
        options.mask,
        options.maskWidth,
        options.maskHeight,
        source,
        destination,
        tile,
      );
      decontaminateEdgeColors(tileContext, maskTile);
      tileContext.globalCompositeOperation = "destination-in";
      tileContext.drawImage(maskTile, 0, 0);
      context.drawImage(tileCanvas, tile.x, tile.y);
      tileCanvas.width = 1;
      tileCanvas.height = 1;
    }
  }
  return { canvas, geometry };
}

export function renderOriginalComposition(
  options: Pick<
    RenderOptions,
    | "image"
    | "crop"
    | "outputWidth"
    | "outputHeight"
    | "centerSubject"
    | "paddingPercent"
    | "subjectBounds"
  >,
) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(options.outputWidth));
  canvas.height = Math.max(1, Math.round(options.outputHeight));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Không thể tạo preview ảnh gốc.");
  const geometry = calculateCompositionGeometry({
    crop: options.crop,
    outputWidth: canvas.width,
    outputHeight: canvas.height,
    centerSubject: options.centerSubject,
    paddingPercent: options.paddingPercent,
    subjectBounds: options.subjectBounds,
  });
  const { source, destination } = geometry;
  context.drawImage(
    options.image,
    source.x,
    source.y,
    source.width,
    source.height,
    destination.x,
    destination.y,
    destination.width,
    destination.height,
  );
  return canvas;
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: string,
  quality = 0.92,
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Không thể mã hóa ảnh xuất.")),
      mime,
      quality,
    );
  });
}

export function calculateOutputSize(
  crop: CropSettings,
  resize: ResizeSettings,
) {
  if (resize.percentage !== 100) {
    return {
      width: Math.max(1, Math.round((crop.width * resize.percentage) / 100)),
      height: Math.max(1, Math.round((crop.height * resize.percentage) / 100)),
    };
  }
  return {
    width: resize.width || crop.width,
    height: resize.height || crop.height,
  };
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}
