import { useRef, useState } from "react";
import { ImagePlus, LockKeyhole, Upload } from "lucide-react";

interface Props {
  onSelect: (file: File) => void;
  error: string | null;
}

export function UploadZone({ onSelect, error }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return (
    <main className="landing">
      <section className="hero-copy">
        <span className="eyebrow">AI chạy ngay trên trình duyệt</span>
        <h1>
          Xóa nền ảnh.
          <br />
          Nhanh và riêng tư.
        </h1>
        <p>
          Tạo ảnh PNG trong suốt, ảnh sản phẩm và ảnh hồ sơ sắc nét. Ảnh của bạn
          không rời khỏi thiết bị.
        </p>
        <div className="privacy-pill">
          <LockKeyhole size={17} /> Ảnh được xử lý trên thiết bị của bạn.
        </div>
      </section>
      <section
        className={`upload-card ${dragging ? "dragging" : ""}`}
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
          if (file) onSelect(file);
        }}
      >
        <div className="upload-icon">
          <ImagePlus size={34} />
        </div>
        <h2>Thả ảnh vào đây</h2>
        <p>hoặc chọn một ảnh từ máy của bạn</p>
        <button
          className="primary large"
          onClick={() => inputRef.current?.click()}
        >
          <Upload size={19} /> Chọn ảnh
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onSelect(file);
            event.target.value = "";
          }}
        />
        <small>JPG, PNG hoặc WEBP · tối đa 50 MB / 40 MP</small>
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
      </section>
    </main>
  );
}
