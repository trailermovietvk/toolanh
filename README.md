# Nền Sạch

Ứng dụng web xóa nền ảnh hoàn toàn trong trình duyệt. Ảnh người dùng không được tải lên máy chủ; trình duyệt chỉ tải trọng số model từ Hugging Face ở lần dùng đầu tiên và dùng lại browser cache khi còn khả dụng.

## Chức năng

- Kéo thả hoặc chọn JPG, PNG, WEBP; kiểm tra định dạng, dung lượng 50 MB và tối đa 40 megapixel.
- Ba chế độ AI: AUTO, PORTRAIT và GENERAL.
  - AUTO hiện ưu tiên BEN2 General để không áp một model portrait-only lên sản phẩm, động vật, xe, đồ nội thất hoặc chủ thể phức tạp.
  - GENERAL dùng onnx-community/BEN2-ONNX, giấy phép MIT, phù hợp ảnh general-purpose.
  - PORTRAIT dùng Xenova/modnet, giấy phép Apache-2.0, nhẹ hơn và tối ưu cho người/tóc.
- AI chạy trong Web Worker. Runtime ưu tiên WebGPU và tự nạp lại model bằng WASM/CPU nếu WebGPU lỗi lúc tải hoặc lúc inference.
- Trạng thái tách rõ Downloading AI model, Loading AI, Removing background, Refining edges và Rendering image.
- Before/After, xem ảnh gốc, zoom, pan và fit/reset zoom.
- Mask editor Restore/Erase ánh xạ tới pixel ảnh gốc, brush size/hardness, sparse undo/redo, reset, smooth và feather.
- Nền trong suốt, trắng, đen, màu HEX hoặc ảnh; Fill/Fit và blur nền.
- Crop tự do kéo/resize bằng cạnh hoặc góc, preset 1:1, 4:5, 3:4, 16:9, cùng Apply/Cancel/Reset.
- Resize theo pixel hoặc phần trăm, căn giữa chủ thể và padding.
- Bóng mềm với opacity, blur và offset X/Y.
- Preview và export dùng chung geometry/compositor nên crop, resize, nền, shadow, center subject và padding khớp nhau.
- Xuất PNG trong suốt, JPG và WEBP ở độ phân giải đã chọn.
- Responsive desktop/mobile, keyboard focus, ARIA và PWA app shell.

## Pipeline ảnh và chất lượng

Transformers.js thực hiện preprocessing đúng cấu hình từng model. BEN2 dùng input nội bộ 1024 × 1024 theo preprocessor config của model; MODNet dùng pipeline tương ứng. Pipeline trả mask alpha về kích thước ảnh gốc và ứng dụng bắt buộc kiểm tra width, height và số phần tử mask trước khi chấp nhận kết quả.

Ảnh màu gốc luôn được giữ ở full resolution. Preview chỉ render tối đa khoảng 1 MP để thao tác nhanh; export áp alpha lên pixel ảnh gốc theo tile tối đa 1024 × 1024. Cách này tránh tạo đồng thời nhiều canvas RGBA full-size, giảm đỉnh RAM đáng kể với ảnh 10/20/40 MP. Viền bán trong suốt được nội suy bilinear và decontaminate màu từ vùng foreground lân cận để giảm viền trắng/đen mà không bẻ alpha thành nhị phân.

Undo/redo lưu delta sparse của nét cọ, giới hạn 64 MB, thay vì snapshot toàn bộ mask. Với thao tác global trên ảnh lớn hơn 2 MP, history cũ được xóa có chủ đích để tránh nhân đôi hàng chục MB bộ nhớ.

## Chạy local

Yêu cầu Node.js 20.19+; khuyến nghị Node.js 22 LTS.

    npm install
    npm run dev

Lần chạy GENERAL đầu tiên cần tải model FP16 khoảng 219 MB. PORTRAIT nhẹ hơn. Tốc độ inference phụ thuộc GPU, RAM, kích thước ảnh và backend mà trình duyệt hỗ trợ.

## Kiểm tra và build

    npm run lint
    npm run typecheck
    npm test
    npm run build
    npm run preview
    npm audit

Thư mục deploy là dist.

## Kiến trúc

- src/workers/background.worker.ts: lazy-load model, progress, inference ngoài main thread và WebGPU → WASM retry thật.
- src/services/backgroundRemoval.ts: vòng đời worker, chống tác vụ đồng thời, cancellation và kết quả typed.
- src/editor/geometry.ts: crop, hit-test, mapping tọa độ và composition geometry dùng chung.
- src/editor/maskHistory.ts: delta history có giới hạn bộ nhớ.
- src/editor/maskOps.ts: refine alpha-only.
- src/components/EditorCanvas.tsx: preview WYSIWYG, before/after, zoom/pan, brush và crop handles.
- src/utils/image.ts: validation, tile compositor full-resolution, edge decontamination và encode export.
- src/components/ToolPanel.tsx: engine, mask, nền, crop, resize, shadow và export.

## Cache, PWA và quyền riêng tư

Không có backend và không upload ảnh. Trình duyệt chỉ kết nối tới Hugging Face để lấy config/trọng số model. Transformers.js quản lý browser cache cho model; Workbox chỉ precache app shell và không cache lặp file model lớn. Vì vậy app shell có thể mở offline sau lần truy cập đầu, nhưng engine chưa từng tải vẫn cần mạng.

WebGPU hoạt động tốt nhất trên Chromium mới. Khi không có hoặc khi inference WebGPU lỗi, worker tự dispose model và retry một lần bằng WASM/CPU. Safari/Firefox tùy phiên bản và thiết bị có thể chỉ dùng WASM.

## Giới hạn thực tế

- Ngưỡng ứng dụng là 40 MP và 16.384 px mỗi cạnh khi export. Không tự giảm độ phân giải; nếu vượt ngưỡng, ứng dụng giữ nguyên dự án và yêu cầu giảm Resize.
- Ảnh 40 MP vẫn cần nhiều RAM cho ảnh decoded, mask và canvas output. Thiết bị di động ít RAM hoặc giới hạn canvas thấp có thể cần xuất nhỏ hơn.
- BEN2 cải thiện phạm vi chủ thể nhưng không model nào đảm bảo hoàn hảo cho kính, lưới, motion blur, tóc cực mảnh hoặc vùng trong suốt. Restore/Erase, Smooth và Feather là đường sửa thủ công.
- Lần tải model đầu có thể lâu trên mạng chậm. Cache có thể bị trình duyệt dọn khi thiếu dung lượng.

## Deploy

Cloudflare Pages:

- Build command: npm run build
- Output directory: dist
- Node version: 22
- public/_redirects đã cấu hình SPA fallback.

Vercel: chọn preset Vite, build command npm run build, output dist. vercel.json đã cấu hình route fallback.

Trước khi dùng domain thật, đổi canonical, OpenGraph URL, robots.txt và sitemap.xml từ nen-sach.pages.dev sang domain production.

## License

Source ứng dụng: MIT, xem LICENSE. Model và runtime được liệt kê trong THIRD_PARTY_NOTICES.md. Không có dependency AGPL đã biết trong dependency tree hiện tại.
