const WEBGPU_ERROR = /webgpu|wgpu|shadermodule|compute pipeline/i;
const NETWORK_ERROR = /fetch|network|download|failed to load|load failed/i;
const MEMORY_ERROR = /out of memory|memory allocation|allocation failed/i;

export function formatInferenceError(message: string) {
  if (message.startsWith('WASM fallback failed:')) {
    const detail = message.slice('WASM fallback failed:'.length).trim();
    return `WebGPU không chạy được và chế độ WASM/CPU cũng thất bại: ${detail} Hãy tải lại trang rồi thử lại; nếu vẫn lỗi, chọn Portrait.`;
  }
  if (WEBGPU_ERROR.test(message))
    return 'WebGPU không tương thích với trình duyệt hoặc GPU hiện tại. Hãy tải lại trang rồi thử lại để ứng dụng chuyển sang WASM/CPU.';
  if (NETWORK_ERROR.test(message))
    return `${message} Hãy kiểm tra kết nối mạng để tải model rồi thử lại.`;
  if (MEMORY_ERROR.test(message))
    return `${message} Hãy đóng bớt tab hoặc thử ảnh nhỏ hơn.`;
  return `${message} Hãy thử lại hoặc chọn Portrait.`;
}
