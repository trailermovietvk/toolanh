export type Tool =
  | "remove"
  | "restore"
  | "erase"
  | "background"
  | "crop"
  | "resize"
  | "shadow"
  | "export";
export type BackgroundMode =
  "transparent" | "white" | "black" | "color" | "image";
export type AspectRatio = "free" | "1:1" | "4:5" | "3:4" | "16:9";
export type ExportFormat = "png" | "jpeg" | "webp";
export type RemovalEngine = "auto" | "portrait" | "general";
export type InferenceDevice = "webgpu" | "wasm";

export interface SourceImage {
  file: File;
  url: string;
  element: HTMLImageElement;
  width: number;
  height: number;
}

export interface ViewportState {
  zoom: number;
  panX: number;
  panY: number;
}

export interface BackgroundSettings {
  mode: BackgroundMode;
  color: string;
  imageUrl: string | null;
  imageElement: HTMLImageElement | null;
  fit: "cover" | "contain";
  blur: number;
}

export interface ShadowSettings {
  enabled: boolean;
  opacity: number;
  blur: number;
  offsetX: number;
  offsetY: number;
}

export interface CropSettings {
  ratio: AspectRatio;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ResizeSettings {
  width: number;
  height: number;
  keepRatio: boolean;
  percentage: number;
}

export interface ExportSettings {
  format: ExportFormat;
  quality: number;
}

export interface AiProgress {
  stage:
    | "idle"
    | "downloading"
    | "loading"
    | "processing"
    | "refining"
    | "rendering"
    | "done"
    | "error";
  percent: number;
  message: string;
}
