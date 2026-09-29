/// <reference lib="webworker" />

import { RawImage, env, pipeline } from "@huggingface/transformers";
import type { InferenceDevice, RemovalEngine } from "../types";
import {
  MODEL_BY_ENGINE,
  resolveEngine,
  selectInferenceDevice,
  selectModelDtype,
  type ResolvedEngine,
} from "../services/inferencePolicy";

type LoadMessage = {
  type: "load";
  engine: RemovalEngine;
  preferWebGpu: boolean;
};
type ProcessMessage = {
  type: "process";
  id: string;
  engine: RemovalEngine;
  preferWebGpu: boolean;
  bytes: ArrayBuffer;
  mime: string;
};
type WorkerMessage = LoadMessage | ProcessMessage | { type: "dispose" };

interface ModelProgress {
  status?: string;
  progress?: number;
  file?: string;
}

async function createRemover(
  engine: ResolvedEngine,
  device: InferenceDevice,
  progress_callback: (event: ModelProgress) => void,
) {
  return pipeline("background-removal", MODEL_BY_ENGINE[engine], {
    device,
    dtype: selectModelDtype(engine, device),
    progress_callback,
  });
}

type Remover = Awaited<ReturnType<typeof createRemover>>;
let remover: Remover | null = null;
let activeEngine: ResolvedEngine | null = null;
let activeDevice: InferenceDevice = "wasm";
let loading: Promise<void> | null = null;
let webGpuUnavailable = false;

env.allowLocalModels = false;
env.useBrowserCache = true;

function send(payload: object, transfer?: Transferable[]) {
  self.postMessage(payload, { transfer });
}

async function disposeModel() {
  if (remover) await remover.dispose();
  remover = null;
  activeEngine = null;
}

function modelProgress(event: ModelProgress) {
  const raw = typeof event.progress === "number" ? event.progress : 0;
  const percent = raw <= 1 ? raw * 100 : raw;
  send({
    type: "progress",
    stage: event.status === "progress" ? "downloading" : "loading",
    percent: Math.max(2, Math.min(94, Math.round(percent))),
    message: event.file
      ? `Downloading AI model - ${event.file}`
      : "Loading AI...",
  });
}

async function load(
  engine: RemovalEngine,
  preferWebGpu: boolean,
  force = false,
) {
  const resolved = resolveEngine(engine);
  const requested = selectInferenceDevice(preferWebGpu, webGpuUnavailable);
  if (
    !force &&
    remover &&
    activeEngine === resolved &&
    activeDevice === requested
  ) {
    send({ type: "ready", engine: resolved, device: activeDevice });
    return;
  }
  if (loading) return loading;
  loading = (async () => {
    await disposeModel();
    send({
      type: "progress",
      stage: "loading",
      percent: 1,
      message: `Loading AI - ${resolved === "general" ? "BEN2 General" : "MODNet Portrait"} - ${requested.toUpperCase()}`,
    });
    try {
      remover = await createRemover(resolved, requested, modelProgress);
      activeEngine = resolved;
      activeDevice = requested;
      send({ type: "ready", engine: resolved, device: activeDevice });
    } catch (error) {
      if (requested === "webgpu") {
        webGpuUnavailable = true;
        await disposeModel();
        send({
          type: "fallback",
          stage: "loading",
          percent: 2,
          message: "WebGPU failed - switching to WASM/CPU...",
        });
        remover = await createRemover(resolved, "wasm", modelProgress);
        activeEngine = resolved;
        activeDevice = "wasm";
        send({ type: "ready", engine: resolved, device: activeDevice });
      } else {
        throw error;
      }
    } finally {
      loading = null;
    }
  })();
  return loading;
}

async function infer(message: ProcessMessage, allowFallback = true) {
  await load(message.engine, message.preferWebGpu);
  if (!remover || !activeEngine) throw new Error("AI model is unavailable.");
  send({
    type: "inference",
    id: message.id,
    stage: "processing",
    percent: 12,
    message: "Removing background...",
  });
  try {
    const image = await RawImage.read(
      new Blob([message.bytes], { type: message.mime }),
    );
    const output = await remover(image);
    send({
      type: "inference",
      id: message.id,
      stage: "refining",
      percent: 88,
      message: "Refining edges...",
    });
    const result = Array.isArray(output) ? output[0] : output;
    const mask = new Uint8ClampedArray(result.width * result.height);
    const channels = result.channels;
    const alphaChannel = channels === 4 ? 3 : channels - 1;
    for (let pixel = 0; pixel < mask.length; pixel += 1)
      mask[pixel] = result.data[pixel * channels + alphaChannel];
    send(
      {
        type: "result",
        id: message.id,
        width: result.width,
        height: result.height,
        mask: mask.buffer,
        engine: activeEngine,
        device: activeDevice,
      },
      [mask.buffer],
    );
  } catch (error) {
    if (activeDevice === "webgpu" && allowFallback) {
      webGpuUnavailable = true;
      send({
        type: "fallback",
        id: message.id,
        stage: "loading",
        percent: 3,
        message: "WebGPU inference failed - retrying with WASM/CPU...",
      });
      await load(message.engine, false, true);
      await infer({ ...message, preferWebGpu: false }, false);
      return;
    }
    throw error;
  }
}

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  try {
    if (event.data.type === "dispose") {
      await disposeModel();
      loading = null;
    } else if (event.data.type === "load")
      await load(event.data.engine, event.data.preferWebGpu);
    else await infer(event.data);
  } catch (error) {
    send({
      type: "error",
      id: event.data.type === "process" ? event.data.id : undefined,
      message:
        error instanceof Error
          ? error.message
          : "AI could not process this image.",
    });
  }
};

export {};
