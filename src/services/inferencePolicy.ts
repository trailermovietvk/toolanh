import type { InferenceDevice, RemovalEngine } from "../types";

export type ResolvedEngine = Exclude<RemovalEngine, "auto">;

export const MODEL_BY_ENGINE: Record<ResolvedEngine, string> = {
  portrait: "Xenova/modnet",
  general: "onnx-community/BEN2-ONNX",
};

export function resolveEngine(engine: RemovalEngine): ResolvedEngine {
  return engine === "portrait" ? "portrait" : "general";
}

export function selectInferenceDevice(
  preferWebGpu: boolean,
  webGpuUnavailable: boolean,
): InferenceDevice {
  return preferWebGpu && !webGpuUnavailable ? "webgpu" : "wasm";
}

export function selectModelDtype(
  engine: ResolvedEngine,
  device: InferenceDevice,
) {
  return engine === "general" || device === "webgpu" ? "fp16" : "q8";
}
