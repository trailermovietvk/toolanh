import { describe, expect, it } from 'vitest';
import { formatInferenceError } from './inferenceError';

describe('formatInferenceError', () => {
  it('identifies WebGPU shader failures instead of blaming the network', () => {
    const result = formatInferenceError(
      'Failed to create a WebGPU compute pipeline: Invalid ShaderModule LayerNorm',
    );

    expect(result).toContain('WebGPU không tương thích');
    expect(result).toContain('WASM/CPU');
    expect(result).not.toContain('kết nối mạng');
  });

  it('reports when both WebGPU and its WASM fallback fail', () => {
    const result = formatInferenceError(
      'WASM fallback failed: Unable to create session',
    );

    expect(result).toContain('WASM/CPU cũng thất bại');
    expect(result).toContain('Unable to create session');
  });

  it('offers network guidance only for download errors', () => {
    expect(formatInferenceError('Failed to fetch model.onnx')).toContain(
      'kiểm tra kết nối mạng',
    );
  });
});
