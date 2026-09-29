import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backgroundRemoval } from "./backgroundRemoval";

interface ProcessMessage {
  type: "process";
  id: string;
  preferWebGpu: boolean;
}

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  messages: unknown[] = [];
  terminated = false;

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(message: unknown) {
    this.messages.push(message);
  }

  terminate() {
    this.terminated = true;
  }

  emit(data: unknown) {
    this.onmessage?.({ data } as MessageEvent);
  }
}

describe("BackgroundRemovalService", () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    vi.stubGlobal("Worker", FakeWorker);
    vi.stubGlobal("crypto", { randomUUID: () => "task-1" });
  });

  afterEach(() => {
    backgroundRemoval.dispose();
    vi.unstubAllGlobals();
  });

  it("restarts in a fresh worker with WebGPU disabled", async () => {
    const file = {
      type: "image/png",
      arrayBuffer: vi.fn(async () => new Uint8Array([1, 2, 3]).buffer),
    } as unknown as File;
    const onProgress = vi.fn();
    const resultPromise = backgroundRemoval.process(
      file,
      "portrait",
      onProgress,
      true,
    );

    await vi.waitFor(() => expect(FakeWorker.instances).toHaveLength(1));
    const gpuWorker = FakeWorker.instances[0];
    expect((gpuWorker.messages[0] as ProcessMessage).preferWebGpu).toBe(true);

    gpuWorker.emit({ type: "retry-wasm", id: "task-1" });

    await vi.waitFor(() => expect(FakeWorker.instances).toHaveLength(2));
    const wasmWorker = FakeWorker.instances[1];
    const retry = wasmWorker.messages[0] as ProcessMessage;
    expect(gpuWorker.terminated).toBe(true);
    expect(retry.id).toBe("task-1");
    expect(retry.preferWebGpu).toBe(false);
    expect(file.arrayBuffer).toHaveBeenCalledTimes(2);

    wasmWorker.emit({
      type: "result",
      id: "task-1",
      width: 1,
      height: 1,
      mask: new Uint8Array([255]).buffer,
      device: "wasm",
      engine: "portrait",
    });

    await expect(resultPromise).resolves.toMatchObject({
      width: 1,
      height: 1,
      device: "wasm",
      engine: "portrait",
    });

    const nextResult = backgroundRemoval.process(file, "portrait", vi.fn(), true);
    await vi.waitFor(() => expect(wasmWorker.messages).toHaveLength(2));
    const nextRequest = wasmWorker.messages[1] as ProcessMessage;
    expect(nextRequest.preferWebGpu).toBe(false);

    wasmWorker.emit({
      type: "result",
      id: nextRequest.id,
      width: 1,
      height: 1,
      mask: new Uint8Array([255]).buffer,
      device: "wasm",
      engine: "portrait",
    });
    await nextResult;
  });
});
