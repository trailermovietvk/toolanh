import { describe, expect, it } from "vitest";
import {
  resolveEngine,
  selectInferenceDevice,
  selectModelDtype,
} from "./inferencePolicy";

describe("inference policy", () => {
  it("uses the general engine for AUTO", () => {
    expect(resolveEngine("auto")).toBe("general");
  });

  it("falls back to WASM after WebGPU is marked unavailable", () => {
    expect(selectInferenceDevice(true, false)).toBe("webgpu");
    expect(selectInferenceDevice(true, true)).toBe("wasm");
  });

  it("selects model files available for each backend", () => {
    expect(selectModelDtype("general", "wasm")).toBe("fp16");
    expect(selectModelDtype("portrait", "wasm")).toBe("q8");
  });
});
