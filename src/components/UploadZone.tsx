import { useRef, useState } from "react";
import { Check, ImagePlus, LockKeyhole, Sparkles, Upload } from "lucide-react";

interface Props {
  onSelect: (file: File) => void;
  error: string | null;
  loading: boolean;
}

export function UploadZone({ onSelect, error, loading }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return (
    <main className="landing">
      <section className="hero-copy">
        <span className="eyebrow">
          <Sparkles size={14} /> AI chạy ngay trên trình duyệt
        </span>
        <h1>
          Xóa nền ảnh
          <br />
          <em>đẹp trong vài giây.</em>
        </h1>
        <p>
          Studio AI gọn nhẹ để tách nền, tinh chỉnh và xuất ảnh sản phẩm hoặc
          chân dung sắc nét ngay trên thiết bị.
        </p>
        <ul className="hero-benefits">
          <li>
            <Check size={15} /> Tách nền AI chính xác
          </li>
          <li>
            <Check size={15} /> Tinh chỉnh mask chuyên nghiệp
          </li>
          <li>
            <Check size={15} /> Xuất PNG, JPG và WebP
          </li>
        </ul>
        <div className="privacy-pill">
          <LockKeyhole size={17} /> Ảnh được xử lý trên thiết bị của bạn.
        </div>
      </section>
      <section
        className={`upload-card ${dragging ? "dragging" : ""}`}
        aria-busy={loading}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node))
            setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (file && !loading) onSelect(file);
        }}
      >
        <div className="upload-card-inner">
          <div className="upload-icon">
            <ImagePlus size={30} strokeWidth={1.7} />
          </div>
          <span className="upload-kicker">Bắt đầu dự án mới</span>
          <h2>Thả ảnh vào đây</h2>
          <p>hoặc chọn một ảnh từ máy của bạn</p>
          <button
            className="primary large"
            onClick={() => inputRef.current?.click()}
            disabled={loading}
          >
            <Upload size={19} /> {loading ? "Đang mở ảnh…" : "Chọn ảnh"}
          </button>
          <input
            ref={inputRef}
            type="file"
            aria-label="Chọn ảnh từ thiết bị"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file && !loading) onSelect(file);
              event.target.value = "";
            }}
          />
          <div className="upload-meta" aria-label="Định dạng hỗ trợ">
            <span>JPG</span>
            <span>PNG</span>
            <span>WEBP</span>
            <small>Tối đa 50 MB / 40 MP</small>
          </div>
          {error && (
            <div className="error-banner" role="alert">
              {error}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
