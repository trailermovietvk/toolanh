import { useRef } from "react";
import {
  Check,
  Download,
  Image,
  Redo2,
  RotateCcw,
  Undo2,
} from "lucide-react";
import type {
  AspectRatio,
  BackgroundSettings,
  CropSettings,
  ExportSettings,
  ResizeSettings,
  RemovalEngine,
  ShadowSettings,
  Tool,
} from "../types";
import { formatBytes } from "../utils/image";

function PanelHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <header className="panel-heading">
      <span>{eyebrow}</span>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </header>
  );
}

interface Props {
  activeTool: Tool;
  brushSize: number;
  setBrushSize: (value: number) => void;
  brushHardness: number;
  setBrushHardness: (value: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  resetMask: () => void;
  refineMask: (kind: "feather" | "smooth") => void;
  background: BackgroundSettings;
  setBackground: (value: BackgroundSettings) => void;
  onBackgroundImage: (file: File) => void;
  crop: CropSettings;
  setCropRatio: (ratio: AspectRatio) => void;
  applyCrop: () => void;
  cancelCrop: () => void;
  resetCrop: () => void;
  resize: ResizeSettings;
  setResize: (value: ResizeSettings) => void;
  shadow: ShadowSettings;
  setShadow: (value: ShadowSettings) => void;
  exportSettings: ExportSettings;
  setExportSettings: (value: ExportSettings) => void;
  outputSize: { width: number; height: number };
  estimatedBytes: number;
  onExport: () => void;
  exporting: boolean;
  onRemove: () => void;
  processing: boolean;
  processed: boolean;
  engine: RemovalEngine;
  setEngine: (engine: RemovalEngine) => void;
  applyPreset: (preset: "white" | "gray" | "1:1" | "4:5" | "3:4") => void;
  centerSubject: boolean;
  setCenterSubject: (value: boolean) => void;
  paddingPercent: number;
  setPaddingPercent: (value: number) => void;
}

function RangeField({
  label,
  value,
  min,
  max,
  onChange,
  suffix = "",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  suffix?: string;
}) {
  return (
    <label className="field range-field">
      <span>
        {label}
        <b>
          {value}
          {suffix}
        </b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export function ToolPanel(p: Props) {
  const bgInput = useRef<HTMLInputElement>(null);
  const bg = (change: Partial<BackgroundSettings>) =>
    p.setBackground({ ...p.background, ...change });
  const sh = (change: Partial<ShadowSettings>) =>
    p.setShadow({ ...p.shadow, ...change });
  const resize = (change: Partial<ResizeSettings>) =>
    p.setResize({ ...p.resize, ...change });
  const presetSelected = (id: "white" | "gray" | "1:1" | "4:5" | "3:4") => {
    if (id === "white") return p.background.mode === "white";
    if (id === "gray")
      return (
        p.background.mode === "color" &&
        p.background.color.toLowerCase() === "#f1f3f5"
      );
    return p.crop.ratio === id;
  };
  return (
    <aside className="inspector-panel" aria-label="Thuộc tính công cụ">
      <div className="panel-content">
        {p.activeTool === "remove" && (
          <section className="tool-section">
            <PanelHeading
              eyebrow="AI Remove"
              title="Xóa nền tự động"
              description="Chọn mô hình phù hợp, sau đó tinh chỉnh kết quả bằng bộ công cụ chuyên nghiệp."
            />
            <div className="segmented engine-selector">
              {(["auto", "portrait", "general"] as RemovalEngine[]).map(
                (engine) => (
                  <button
                    key={engine}
                    className={p.engine === engine ? "active" : ""}
                    onClick={() => p.setEngine(engine)}
                    aria-pressed={p.engine === engine}
                  >
                    {engine.toUpperCase()}
                  </button>
                ),
              )}
            </div>
            <div className="model-note">
              {p.engine === "portrait"
                ? "MODNet · Portrait · Apache-2.0 · tải nhanh"
                : "BEN2 · General · MIT · tải lần đầu khoảng 219 MB"}
            </div>
            <button
              className="primary full"
              onClick={p.onRemove}
              disabled={p.processing}
            >
              {p.processing
                ? "Đang xử lý…"
                : p.processed
                  ? "Xóa nền lại"
                  : "Xóa nền"}
            </button>
            <div className="quick-presets">
              <div className="section-label">
                <span>Ảnh sản phẩm</span>
                <small>Thiết lập nhanh</small>
              </div>
              <div className="button-grid">
                {(
                  [
                    ["white", "Nền trắng"],
                    ["gray", "Nền xám"],
                    ["1:1", "Vuông 1:1"],
                    ["4:5", "Tỷ lệ 4:5"],
                    ["3:4", "Tỷ lệ 3:4"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    className={`preset-card ${presetSelected(id) ? "selected" : ""}`}
                    onClick={() => p.applyPreset(id)}
                    data-preset={id}
                    aria-pressed={presetSelected(id)}
                  >
                    <span className="preset-thumbnail" aria-hidden="true">
                      <i />
                    </span>
                    <span>{label}</span>
                  </button>
                ))}
              </div>
              <label className="toggle-field">
                <span>Căn giữa chủ thể</span>
                <input
                  type="checkbox"
                  checked={p.centerSubject}
                  onChange={(event) => p.setCenterSubject(event.target.checked)}
                />
              </label>
              <RangeField
                label="Padding"
                value={p.paddingPercent}
                min={0}
                max={40}
                onChange={p.setPaddingPercent}
                suffix="%"
              />
            </div>
          </section>
        )}
        {(p.activeTool === "restore" || p.activeTool === "erase") && (
          <section className="tool-section">
            <PanelHeading
              eyebrow="Mask Editor"
              title={
                p.activeTool === "restore"
                  ? "Khôi phục vùng ảnh"
                  : "Xóa thêm vùng nền"
              }
              description="Vẽ trực tiếp lên ảnh; zoom và pan vẫn giữ tọa độ cọ chính xác."
            />
            <RangeField
              label="Kích thước cọ"
              value={p.brushSize}
              min={2}
              max={300}
              onChange={p.setBrushSize}
              suffix=" px"
            />
            <RangeField
              label="Độ cứng"
              value={p.brushHardness}
              min={0}
              max={100}
              onChange={p.setBrushHardness}
              suffix="%"
            />
            <div className="button-row">
              <button
                className="secondary"
                onClick={p.undo}
                disabled={!p.canUndo}
              >
                <Undo2 size={17} /> Undo
              </button>
              <button
                className="secondary"
                onClick={p.redo}
                disabled={!p.canRedo}
              >
                <Redo2 size={17} /> Redo
              </button>
            </div>
            <button className="secondary full" onClick={p.resetMask}>
              <RotateCcw size={17} /> Reset mask
            </button>
            <div className="button-row">
              <button
                className="secondary"
                onClick={() => p.refineMask("smooth")}
              >
                Smooth
              </button>
              <button
                className="secondary"
                onClick={() => p.refineMask("feather")}
              >
                Feather 2 px
              </button>
            </div>
          </section>
        )}
        {p.activeTool === "background" && (
          <section className="tool-section">
            <PanelHeading
              eyebrow="Background"
              title="Phông nền"
              description="Giữ nền trong suốt hoặc tạo bối cảnh phù hợp cho ảnh của bạn."
            />
            <div className="swatches">
              {(
                [
                  ["transparent", "Trong suốt", "checker"],
                  ["white", "Trắng", "#fff"],
                  ["black", "Đen", "#000"],
                  ["color", "Tùy chọn", p.background.color],
                ] as const
              ).map(([mode, label, color]) => (
                <button
                  key={mode}
                  className={p.background.mode === mode ? "selected" : ""}
                  onClick={() => bg({ mode })}
                >
                  <i
                    className={color === "checker" ? "mini-checker" : ""}
                    style={
                      color !== "checker" ? { background: color } : undefined
                    }
                  />
                  <span>{label}</span>
                  {p.background.mode === mode && <Check size={14} />}
                </button>
              ))}
            </div>
            <label className="field">
              <span>Màu HEX</span>
              <div className="color-field">
                <input
                  type="color"
                  value={p.background.color}
                  onChange={(e) => bg({ color: e.target.value, mode: "color" })}
                />
                <input
                  value={p.background.color}
                  pattern="#[0-9a-fA-F]{6}"
                  onChange={(e) => bg({ color: e.target.value, mode: "color" })}
                />
              </div>
            </label>
            <button
              className="secondary full"
              onClick={() => bgInput.current?.click()}
            >
              <Image size={17} /> Tải ảnh nền
            </button>
            <input
              ref={bgInput}
              hidden
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) p.onBackgroundImage(file);
              }}
            />
            {p.background.mode === "image" && (
              <>
                <div className="segmented">
                  <button
                    className={p.background.fit === "cover" ? "active" : ""}
                    onClick={() => bg({ fit: "cover" })}
                  >
                    Fill
                  </button>
                  <button
                    className={p.background.fit === "contain" ? "active" : ""}
                    onClick={() => bg({ fit: "contain" })}
                  >
                    Fit
                  </button>
                </div>
                <RangeField
                  label="Làm mờ"
                  value={p.background.blur}
                  min={0}
                  max={40}
                  onChange={(blur) => bg({ blur })}
                  suffix=" px"
                />
              </>
            )}
          </section>
        )}
        {p.activeTool === "crop" && (
          <section className="tool-section">
            <PanelHeading
              eyebrow="Composition"
              title="Cắt ảnh"
              description="Kéo vùng cắt để di chuyển; kéo cạnh hoặc góc để thay đổi kích thước."
            />
            <div className="ratio-grid">
              {(["free", "1:1", "4:5", "3:4", "16:9"] as AspectRatio[]).map(
                (ratio) => (
                  <button
                    key={ratio}
                    className={p.crop.ratio === ratio ? "active" : ""}
                    onClick={() => p.setCropRatio(ratio)}
                  >
                    {ratio === "free" ? "Tự do" : ratio}
                  </button>
                ),
              )}
            </div>
            <div className="size-readout">
              Vùng cắt{" "}
              <b>
                {Math.round(p.crop.width)} × {Math.round(p.crop.height)} px
              </b>
            </div>
            <div className="crop-actions">
              <button className="primary" onClick={p.applyCrop}>
                Apply
              </button>
              <button className="secondary" onClick={p.cancelCrop}>
                Cancel
              </button>
              <button className="secondary" onClick={p.resetCrop}>
                Reset
              </button>
            </div>
          </section>
        )}
        {p.activeTool === "resize" && (
          <section className="tool-section">
            <PanelHeading
              eyebrow="Dimensions"
              title="Đổi kích thước"
              description="Điều chỉnh kích thước đầu ra theo pixel hoặc phần trăm."
            />
            <label className="field">
              <span>Chiều rộng (px)</span>
              <input
                type="number"
                min="1"
                max="16000"
                value={p.resize.width}
                onChange={(e) => {
                  const width = Number(e.target.value);
                  resize({
                    width,
                    height: p.resize.keepRatio
                      ? Math.round((width * p.crop.height) / p.crop.width)
                      : p.resize.height,
                    percentage: 100,
                  });
                }}
              />
            </label>
            <label className="field">
              <span>Chiều cao (px)</span>
              <input
                type="number"
                min="1"
                max="16000"
                value={p.resize.height}
                onChange={(e) => {
                  const height = Number(e.target.value);
                  resize({
                    height,
                    width: p.resize.keepRatio
                      ? Math.round((height * p.crop.width) / p.crop.height)
                      : p.resize.width,
                    percentage: 100,
                  });
                }}
              />
            </label>
            <label className="check-field">
              <input
                type="checkbox"
                checked={p.resize.keepRatio}
                onChange={(e) => resize({ keepRatio: e.target.checked })}
              />{" "}
              Giữ tỷ lệ ảnh
            </label>
            <RangeField
              label="Phần trăm"
              value={p.resize.percentage}
              min={10}
              max={200}
              onChange={(percentage) => resize({ percentage })}
              suffix="%"
            />
          </section>
        )}
        {p.activeTool === "shadow" && (
          <section className="tool-section">
            <PanelHeading
              eyebrow="Depth"
              title="Đổ bóng"
              description="Tạo chiều sâu tự nhiên để chủ thể hòa vào phông nền."
            />
            <label className="toggle-field">
              <span>Bóng mềm tự nhiên</span>
              <input
                type="checkbox"
                checked={p.shadow.enabled}
                onChange={(e) => sh({ enabled: e.target.checked })}
              />
            </label>
            <RangeField
              label="Độ đậm"
              value={Math.round(p.shadow.opacity * 100)}
              min={0}
              max={100}
              onChange={(v) => sh({ opacity: v / 100 })}
              suffix="%"
            />
            <RangeField
              label="Độ mờ"
              value={p.shadow.blur}
              min={0}
              max={100}
              onChange={(blur) => sh({ blur })}
              suffix=" px"
            />
            <RangeField
              label="Lệch ngang"
              value={p.shadow.offsetX}
              min={-100}
              max={100}
              onChange={(offsetX) => sh({ offsetX })}
              suffix=" px"
            />
            <RangeField
              label="Lệch dọc"
              value={p.shadow.offsetY}
              min={-100}
              max={100}
              onChange={(offsetY) => sh({ offsetY })}
              suffix=" px"
            />
          </section>
        )}
        {p.activeTool === "export" && (
          <section className="tool-section">
            <PanelHeading
              eyebrow="Export"
              title="Xuất ảnh"
              description="Chọn định dạng và tải ảnh ở độ phân giải đầy đủ."
            />
            <div className="segmented">
              {(["png", "jpeg", "webp"] as const).map((format) => (
                <button
                  key={format}
                  className={p.exportSettings.format === format ? "active" : ""}
                  onClick={() =>
                    p.setExportSettings({ ...p.exportSettings, format })
                  }
                >
                  {format === "jpeg" ? "JPG" : format.toUpperCase()}
                </button>
              ))}
            </div>
            {p.exportSettings.format !== "png" && (
              <RangeField
                label="Chất lượng"
                value={Math.round(p.exportSettings.quality * 100)}
                min={40}
                max={100}
                onChange={(quality) =>
                  p.setExportSettings({
                    ...p.exportSettings,
                    quality: quality / 100,
                  })
                }
                suffix="%"
              />
            )}
            {p.exportSettings.format === "jpeg" &&
              p.background.mode === "transparent" && (
                <div className="warning">
                  JPG không hỗ trợ trong suốt; file xuất sẽ dùng nền trắng.
                </div>
              )}
            <dl className="export-summary">
              <div>
                <dt>Kích thước</dt>
                <dd>
                  {p.outputSize.width} × {p.outputSize.height} px
                </dd>
              </div>
              <div>
                <dt>Định dạng</dt>
                <dd>
                  {p.exportSettings.format === "jpeg"
                    ? "JPG"
                    : p.exportSettings.format.toUpperCase()}
                </dd>
              </div>
              <div>
                <dt>Dung lượng ước tính</dt>
                <dd>{formatBytes(p.estimatedBytes)}</dd>
              </div>
            </dl>
            <button
              className="primary full"
              onClick={p.onExport}
              disabled={p.exporting}
            >
              <Download size={18} />
              {p.exporting ? "Đang xuất…" : "Tải ảnh full resolution"}
            </button>
          </section>
        )}
      </div>
    </aside>
  );
}
