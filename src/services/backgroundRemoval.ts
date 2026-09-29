import type { AiProgress, InferenceDevice, RemovalEngine } from "../types";

type ResolvedEngine = Exclude<RemovalEngine, "auto">;

export interface MaskResult {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  device: InferenceDevice;
  engine: ResolvedEngine;
}

type ProgressHandler = (
  percent: number,
  message: string,
  stage: AiProgress["stage"],
) => void;

interface PendingTask {
  resolve: (result: MaskResult) => void;
  reject: (error: Error) => void;
  onProgress: ProgressHandler;
}

interface WorkerPayload {
  type: "progress" | "ready" | "fallback" | "inference" | "result" | "error";
  id?: string;
  stage?: AiProgress["stage"];
  percent?: number;
  message?: string;
  device?: InferenceDevice;
  engine?: ResolvedEngine;
  width?: number;
  height?: number;
  mask?: ArrayBuffer;
}

class BackgroundRemovalService {
  private worker: Worker | null = null;
  private tasks = new Map<string, PendingTask>();
  private generation = 0;
  private busyGeneration: number | null = null;

  private ensureWorker() {
    if (this.worker) return;
    const worker = new Worker(
      new URL("../workers/background.worker.ts", import.meta.url),
      { type: "module" },
    );
    this.worker = worker;
    worker.onmessage = (event: MessageEvent<WorkerPayload>) =>
      this.handleMessage(event.data);
    worker.onerror = () => {
      const error = new Error(
        "Tiến trình AI gặp lỗi. Hãy Retry hoặc chuyển engine.",
      );
      for (const task of this.tasks.values()) task.reject(error);
      this.tasks.clear();
      if (this.worker === worker) {
        worker.terminate();
        this.reset();
      }
    };
  }

  private handleMessage(payload: WorkerPayload) {
    const task = payload.id ? this.tasks.get(payload.id) : undefined;
    if (payload.type === "progress" || payload.type === "fallback") {
      const recipients = task ? [task] : [...this.tasks.values()];
      for (const pending of recipients) {
        pending.onProgress(
          payload.percent ?? 2,
          payload.message ?? "Loading AI...",
          payload.stage ?? "loading",
        );
      }
      return;
    }
    if (payload.type === "ready") return;
    if (payload.type === "inference" && task) {
      task.onProgress(
        payload.percent ?? 0,
        payload.message ?? "Removing background...",
        payload.stage ?? "processing",
      );
    } else if (
      payload.type === "result" &&
      task &&
      payload.id &&
      payload.mask &&
      payload.width &&
      payload.height &&
      payload.device &&
      payload.engine
    ) {
      task.resolve({
        data: new Uint8ClampedArray(payload.mask),
        width: payload.width,
        height: payload.height,
        device: payload.device,
        engine: payload.engine,
      });
      this.tasks.delete(payload.id);
    } else if (payload.type === "error") {
      const error = new Error(payload.message ?? "Không thể xử lý ảnh.");
      if (task && payload.id) {
        task.reject(error);
        this.tasks.delete(payload.id);
      } else {
        for (const pending of this.tasks.values()) pending.reject(error);
        this.tasks.clear();
      }
    }
  }

  async process(
    file: File,
    engine: RemovalEngine,
    onProgress: ProgressHandler,
    preferWebGpu = "gpu" in navigator,
  ): Promise<MaskResult> {
    if (this.busyGeneration !== null)
      throw new Error("Một tác vụ AI khác đang chạy. Hãy đợi tác vụ hoàn tất.");
    const generation = this.generation;
    this.busyGeneration = generation;
    try {
      const bytes = await file.arrayBuffer();
      if (generation !== this.generation)
        throw new DOMException("AI task cancelled.", "AbortError");
      this.ensureWorker();
      const id = crypto.randomUUID();
      return await new Promise((resolve, reject) => {
        this.tasks.set(id, { resolve, reject, onProgress });
        this.worker?.postMessage(
          {
            type: "process",
            id,
            engine,
            preferWebGpu,
            bytes,
            mime: file.type,
          },
          [bytes],
        );
      });
    } finally {
      if (this.busyGeneration === generation) this.busyGeneration = null;
    }
  }

  dispose() {
    this.generation += 1;
    this.busyGeneration = null;
    const error = new DOMException("AI task cancelled.", "AbortError");
    for (const task of this.tasks.values()) task.reject(error);
    this.tasks.clear();
    this.worker?.postMessage({ type: "dispose" });
    this.worker?.terminate();
    this.reset();
  }

  private reset() {
    this.worker = null;
  }
}

export const backgroundRemoval = new BackgroundRemovalService();
