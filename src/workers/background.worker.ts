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

class WebGpuFailure extends Error {
  constructor(error: unknown) {
    super(
      error instanceof Error
        ? error.message
        : "WebGPU could not initialize or run the model.",
    );
    this.name = "WebGpuFailure";
  }
}

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
  // A failed backend can throw its original error again during disposal.
  // Clear references first and keep cleanup best-effort.
  const current = remover;
  remover = null;
  activeEngine = null;
  if (!current) return;
  try {
    await current.dispose();
  } catch (error) {
    console.warn('Could not dispose the previous AI session.', error);
  }
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
) {
  const resolved = resolveEngine(engine);
  const requested = selectInferenceDevice(preferWebGpu, webGpuUnavailable);
  if (
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
        throw new WebGpuFailure(error);
      } else {
        throw error;
      }
    } finally {
      loading = null;
    }
  })();
  return loading;
}

async function infer(message: ProcessMessage) {
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
    if (activeDevice === "webgpu") {
      webGpuUnavailable = true;
      throw new WebGpuFailure(error);
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
    const id = event.data.type === "process" ? event.data.id : undefined;
    if (error instanceof WebGpuFailure && id) {
      send({
        type: "retry-wasm",
        id,
        stage: "loading",
        percent: 3,
        message: "WebGPU failed - restarting with WASM/CPU...",
      });
    } else {
      send({
        type: "error",
        id,
        message:
          error instanceof Error
            ? error.message
            : "AI could not process this image.",
      });
    }
  }
};

export {};
