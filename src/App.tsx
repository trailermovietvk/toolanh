import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, LockKeyhole, Sparkles, X } from "lucide-react";
import { EditorCanvas } from "./components/EditorCanvas";
import { ToolPanel } from "./components/ToolPanel";
import { UploadZone } from "./components/UploadZone";
import { backgroundRemoval } from "./services/backgroundRemoval";
import { formatInferenceError } from "./utils/inferenceError";
import type {
  AiProgress,
  AspectRatio,
  BackgroundSettings,
  CropSettings,
  ExportSettings,
  ResizeSettings,
  RemovalEngine,
  ShadowSettings,
  SourceImage,
  Tool,
  ViewportState,
} from "./types";
import { cropForRatio, findMaskBounds } from "./editor/geometry";
import { MaskHistory } from "./editor/maskHistory";
import { maskDimensionsAreValid, refineAlphaMask } from "./editor/maskOps";
import {
  calculateOutputSize,
  canvasToBlob,
  createOpaqueMask,
  loadSourceImage,
  MAX_PIXELS,
  renderComposition,
} from "./utils/image";

const defaultBackground: BackgroundSettings = {
  mode: "transparent",
  color: "#e5e7eb",
  imageUrl: null,
  imageElement: null,
  fit: "cover",
  blur: 0,
};
const defaultShadow: ShadowSettings = {
  enabled: false,
  opacity: 0.24,
  blur: 32,
  offsetX: 0,
  offsetY: 18,
};

export default function App() {
  const mounted = useRef(true);
  const imageLoadId = useRef(0);
  const backgroundLoadId = useRef(0);
  const inferenceId = useRef(0);
  const exportId = useRef(0);
  const sourceUrl = useRef<string | null>(null);
  const backgroundUrl = useRef<string | null>(null);
  const [source, setSource] = useState<SourceImage | null>(null);
  const [mask, setMask] = useState<Uint8ClampedArray | null>(null);
  const [initialMask, setInitialMask] = useState<Uint8ClampedArray | null>(
    null,
  );
  const [maskVersion, setMaskVersion] = useState(0);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const maskHistory = useRef(new MaskHistory());
  const [, setHistoryVersion] = useState(0);
  const [activeTool, setActiveTool] = useState<Tool>("remove");
  const [engine, setEngine] = useState<RemovalEngine>("auto");
  const [brushSize, setBrushSize] = useState(55);
  const [brushHardness, setBrushHardness] = useState(75);
  const [background, setBackground] = useState(defaultBackground);
  const [shadow, setShadow] = useState(defaultShadow);
  const [centerSubject, setCenterSubject] = useState(false);
  const [paddingPercent, setPaddingPercent] = useState(10);
  const [viewport, setViewport] = useState<ViewportState>({
    zoom: 1,
    panX: 0,
    panY: 0,
  });
  const [crop, setCrop] = useState<CropSettings>({
    ratio: "free",
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  });
  const [cropDraft, setCropDraft] = useState<CropSettings>({
    ratio: "free",
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  });
  const [resize, setResize] = useState<ResizeSettings>({
    width: 1,
    height: 1,
    keepRatio: true,
    percentage: 100,
  });
  const [exportSettings, setExportSettings] = useState<ExportSettings>({
    format: "png",
    quality: 0.92,
  });
  const [progress, setProgress] = useState<AiProgress>({
    stage: "idle",
    percent: 0,
    message: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [processed, setProcessed] = useState(false);

  const outputSize = useMemo(
    () => calculateOutputSize(crop, resize),
    [crop, resize],
  );
  const subjectBounds = useMemo(
    () =>
      centerSubject && mask && source
        ? findMaskBounds(mask, source.width, source.height, crop)
        : null,
    [centerSubject, crop, layoutVersion, mask, source],
  );
  const estimatedBytes = useMemo(() => {
    const pixels = outputSize.width * outputSize.height;
    if (exportSettings.format === "png")
      return pixels * (background.mode === "transparent" ? 1.65 : 1.25);
    return (
      pixels *
      exportSettings.quality *
      (exportSettings.format === "webp" ? 0.32 : 0.48)
    );
  }, [background.mode, exportSettings, outputSize]);

  const selectImage = async (file: File) => {
    const requestId = ++imageLoadId.current;
    inferenceId.current += 1;
    backgroundRemoval.dispose();
    setProgress({ stage: "idle", percent: 0, message: "" });
    setError(null);
    try {
      const next = await loadSourceImage(file);
      if (!mounted.current || requestId !== imageLoadId.current) {
        URL.revokeObjectURL(next.url);
        return;
      }
      if (sourceUrl.current) URL.revokeObjectURL(sourceUrl.current);
      sourceUrl.current = next.url;
      setSource(next);
      const opaque = createOpaqueMask(next.width, next.height);
      setMask(opaque);
      setInitialMask(opaque.slice());
      setMaskVersion((v) => v + 1);
      setLayoutVersion((v) => v + 1);
      const fullCrop: CropSettings = {
        ratio: "free",
        x: 0,
        y: 0,
        width: next.width,
        height: next.height,
      };
      setCrop(fullCrop);
      setCropDraft(fullCrop);
      setResize({
        width: next.width,
        height: next.height,
        keepRatio: true,
        percentage: 100,
      });
      maskHistory.current.clear();
      setHistoryVersion((v) => v + 1);
      setProcessed(false);
      setActiveTool("remove");
      setViewport({ zoom: 1, panX: 0, panY: 0 });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Không thể mở ảnh này. Hãy thử một ảnh khác.",
      );
    }
  };

  const removeBackground = async () => {
    if (!source) return;
    const requestId = ++inferenceId.current;
    setError(null);
    setProgress({
      stage: "loading",
      percent: 1,
      message: "Chuẩn bị mô hình AI…",
    });
    try {
      const result = await backgroundRemoval.process(
        source.file,
        engine,
        (percent, message, stage) => {
          if (mounted.current && requestId === inferenceId.current)
            setProgress({ stage, percent, message });
        },
      );
      if (!mounted.current || requestId !== inferenceId.current) return;
      if (
        result.width !== source.width ||
        result.height !== source.height ||
        !maskDimensionsAreValid(result.data, source.width, source.height)
      )
        throw new Error(
          "Mask AI không khớp kích thước ảnh gốc. Ảnh chưa bị thay đổi; hãy Retry hoặc chọn Portrait.",
        );
      setMask(result.data);
      setInitialMask(result.data.slice());
      maskHistory.current.clear();
      setHistoryVersion((v) => v + 1);
      setMaskVersion((v) => v + 1);
      setLayoutVersion((v) => v + 1);
      setProcessed(true);
      setProgress({
        stage: "done",
        percent: 100,
        message: `Rendering image · ${result.engine.toUpperCase()} · ${result.device.toUpperCase()}`,
      });
      window.setTimeout(() => {
        if (mounted.current && requestId === inferenceId.current)
          setProgress({ stage: "idle", percent: 0, message: "" });
      }, 1500);
    } catch (caught) {
      if (!mounted.current || requestId !== inferenceId.current) return;
      const message =
        caught instanceof Error ? caught.message : "Không thể xóa nền ảnh.";
      setError(formatInferenceError(message));
      setProgress({ stage: "error", percent: 0, message });
    }
  };

  const paintMask = useCallback(
    (points: Array<{ x: number; y: number }>, restore: boolean) => {
      if (!mask || !source) return;
      const radius = brushSize / 2;
      const inner = (radius * brushHardness) / 100;
      const drawPoint = (cx: number, cy: number) => {
        const minX = Math.max(0, Math.floor(cx - radius));
        const maxX = Math.min(source.width - 1, Math.ceil(cx + radius));
        const minY = Math.max(0, Math.floor(cy - radius));
        const maxY = Math.min(source.height - 1, Math.ceil(cy + radius));
        for (let y = minY; y <= maxY; y += 1)
          for (let x = minX; x <= maxX; x += 1) {
            const distance = Math.hypot(x - cx, y - cy);
            if (distance > radius) continue;
            const strength =
              distance <= inner || radius === inner
                ? 1
                : 1 - (distance - inner) / (radius - inner);
            const index = y * source.width + x;
            const next = restore
              ? Math.max(mask[index], Math.round(255 * strength))
              : Math.min(mask[index], Math.round(255 * (1 - strength)));
            if (next !== mask[index]) {
              maskHistory.current.record(index, mask[index]);
              mask[index] = next;
            }
          }
      };
      if (points.length === 1) drawPoint(points[0].x, points[0].y);
      else {
        const [from, to] = points;
        const distance = Math.hypot(to.x - from.x, to.y - from.y);
        const steps = Math.max(
          1,
          Math.ceil(distance / Math.max(1, radius * 0.3)),
        );
        for (let step = 0; step <= steps; step += 1)
          drawPoint(
            from.x + ((to.x - from.x) * step) / steps,
            from.y + ((to.y - from.y) * step) / steps,
          );
      }
      setMask(mask);
      setMaskVersion((v) => v + 1);
    },
    [brushHardness, brushSize, mask, source],
  );

  const undo = () => {
    if (!mask || !maskHistory.current.undo(mask)) return;
    setMask(mask);
    setHistoryVersion((v) => v + 1);
    setMaskVersion((v) => v + 1);
    setLayoutVersion((v) => v + 1);
  };
  const redo = () => {
    if (!mask || !maskHistory.current.redo(mask)) return;
    setMask(mask);
    setHistoryVersion((v) => v + 1);
    setMaskVersion((v) => v + 1);
    setLayoutVersion((v) => v + 1);
  };

  const refineMask = (kind: "feather" | "smooth") => {
    if (!mask || !source) return;
    const refined = refineAlphaMask(
      mask,
      source.width,
      source.height,
      kind === "feather" ? 2 : 1,
    );
    if (mask.length <= 2_000_000)
      maskHistory.current.captureDifference(mask, refined);
    else maskHistory.current.clear();
    setMask(refined);
    setHistoryVersion((v) => v + 1);
    setMaskVersion((v) => v + 1);
    setLayoutVersion((v) => v + 1);
  };

  const beginStroke = () => maskHistory.current.begin();
  const endStroke = () => {
    if (mask && maskHistory.current.commit(mask)) {
      setHistoryVersion((v) => v + 1);
      setLayoutVersion((v) => v + 1);
    }
  };

  const resetMask = () => {
    if (!mask || !initialMask) return;
    if (mask.length <= 2_000_000) {
      maskHistory.current.begin();
      for (let index = 0; index < mask.length; index += 1) {
        if (mask[index] !== initialMask[index])
          maskHistory.current.record(index, mask[index]);
      }
      mask.set(initialMask);
      maskHistory.current.commit(mask);
    } else {
      maskHistory.current.clear();
      mask.set(initialMask);
    }
    setMask(mask);
    setHistoryVersion((v) => v + 1);
    setMaskVersion((v) => v + 1);
    setLayoutVersion((v) => v + 1);
  };

  const setCropRatio = (ratio: AspectRatio) => {
    if (!source) return;
    setCropDraft(cropForRatio(source.width, source.height, ratio));
  };

  const applyCrop = () => {
    setCrop(cropDraft);
    setResize((current) => ({
      ...current,
      width: Math.round(cropDraft.width),
      height: Math.round(cropDraft.height),
      percentage: 100,
    }));
    setActiveTool("remove");
    setViewport({ zoom: 1, panX: 0, panY: 0 });
  };

  const cancelCrop = () => {
    setCropDraft(crop);
    setActiveTool("remove");
    setViewport({ zoom: 1, panX: 0, panY: 0 });
  };

  const resetCrop = () => {
    if (source) setCropDraft(cropForRatio(source.width, source.height, "free"));
  };

  const changeTool = (tool: Tool) => {
    if (tool === "crop") setCropDraft(crop);
    setActiveTool(tool);
    setViewport({ zoom: 1, panX: 0, panY: 0 });
  };

  const backgroundImage = async (file: File) => {
    const requestId = ++backgroundLoadId.current;
    try {
      const loaded = await loadSourceImage(file);
      if (!mounted.current || requestId !== backgroundLoadId.current) {
        URL.revokeObjectURL(loaded.url);
        return;
      }
      if (backgroundUrl.current) URL.revokeObjectURL(backgroundUrl.current);
      backgroundUrl.current = loaded.url;
      setBackground((current) => ({
        ...current,
        mode: "image",
        imageUrl: loaded.url,
        imageElement: loaded.element,
      }));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Không thể mở ảnh nền.",
      );
    }
  };

  const applyPreset = (preset: "white" | "gray" | "1:1" | "4:5" | "3:4") => {
    if (preset === "white") setBackground({ ...background, mode: "white" });
    else if (preset === "gray")
      setBackground({ ...background, mode: "color", color: "#f1f3f5" });
    else {
      if (!source) return;
      const nextCrop = cropForRatio(source.width, source.height, preset);
      setCrop(nextCrop);
      setCropDraft(nextCrop);
      setResize((current) => ({
        ...current,
        width: Math.round(nextCrop.width),
        height: Math.round(nextCrop.height),
        percentage: 100,
      }));
      setCenterSubject(true);
    }
  };

  const exportImage = async () => {
    if (!source || !mask) return;
    if (
      outputSize.width * outputSize.height > MAX_PIXELS ||
      outputSize.width > 16_384 ||
      outputSize.height > 16_384
    ) {
      setError(
        "Kích thước xuất vượt giới hạn an toàn 40 MP hoặc 16.384 px mỗi cạnh. Hãy giảm Resize; ảnh gốc không bị thay đổi.",
      );
      return;
    }
    const requestId = ++exportId.current;
    let outputCanvas: HTMLCanvasElement | null = null;
    setExporting(true);
    setError(null);
    setProgress({
      stage: "rendering",
      percent: 10,
      message: "Rendering image...",
    });
    try {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      if (!mounted.current || requestId !== exportId.current) return;
      const safeBackground =
        exportSettings.format === "jpeg" && background.mode === "transparent"
          ? { ...background, mode: "white" as const }
          : background;
      outputCanvas = renderComposition({
        image: source.element,
        mask,
        maskWidth: source.width,
        maskHeight: source.height,
        background: safeBackground,
        shadow,
        crop,
        outputWidth: outputSize.width,
        outputHeight: outputSize.height,
        centerSubject,
        paddingPercent,
        subjectBounds,
      });
      const mime = `image/${exportSettings.format}`;
      setProgress({
        stage: "rendering",
        percent: 80,
        message: "Encoding download...",
      });
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      const blob = await canvasToBlob(
        outputCanvas,
        mime,
        exportSettings.quality,
      );
      if (!mounted.current || requestId !== exportId.current) return;
      setProgress({
        stage: "rendering",
        percent: 92,
        message: "Preparing download...",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${source.file.name.replace(/\.[^.]+$/, "")}-nen-sach.${exportSettings.format === "jpeg" ? "jpg" : exportSettings.format}`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setProgress({ stage: "done", percent: 100, message: "Download ready" });
      window.setTimeout(() => {
        if (mounted.current && requestId === exportId.current)
          setProgress({ stage: "idle", percent: 0, message: "" });
      }, 1200);
    } catch (caught) {
      if (mounted.current && requestId === exportId.current) {
        const message =
          caught instanceof Error ? caught.message : "Không thể xuất ảnh.";
        setError(`${message} Hãy thử giảm kích thước xuất hoặc đóng bớt tab.`);
        setProgress({ stage: "error", percent: 0, message });
      }
    } finally {
      if (outputCanvas) {
        outputCanvas.width = 1;
        outputCanvas.height = 1;
      }
      if (mounted.current && requestId === exportId.current)
        setExporting(false);
    }
  };

  const clearImage = () => {
    inferenceId.current += 1;
    imageLoadId.current += 1;
    exportId.current += 1;
    backgroundRemoval.dispose();
    if (sourceUrl.current) URL.revokeObjectURL(sourceUrl.current);
    if (backgroundUrl.current) URL.revokeObjectURL(backgroundUrl.current);
    sourceUrl.current = null;
    backgroundUrl.current = null;
    setSource(null);
    setMask(null);
    setInitialMask(null);
    setBackground(defaultBackground);
    maskHistory.current.clear();
    setProcessed(false);
    setExporting(false);
    setError(null);
    setProgress({ stage: "idle", percent: 0, message: "" });
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      inferenceId.current += 1;
      exportId.current += 1;
      imageLoadId.current += 1;
      backgroundLoadId.current += 1;
      if (sourceUrl.current) URL.revokeObjectURL(sourceUrl.current);
      if (backgroundUrl.current) URL.revokeObjectURL(backgroundUrl.current);
      backgroundRemoval.dispose();
    };
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <button
          className="brand"
          onClick={() => source && clearImage()}
          aria-label="Về trang chọn ảnh"
        >
          <span className="brand-mark" aria-hidden="true">
            <Sparkles size={17} strokeWidth={2.2} />
          </span>
          <span className="brand-copy">
            <strong>Nền Sạch</strong>
            <small>AI Photo Editor</small>
          </span>
        </button>
        {source && (
          <div className="header-file" title={source.file.name}>
            <span>{source.file.name}</span>
            <small>
              {source.width} × {source.height} px
            </small>
          </div>
        )}
        <div className="header-actions">
          <div className="header-privacy">
            <LockKeyhole size={14} /> Xử lý riêng tư trên thiết bị
          </div>
          {source && (
            <button
              className="secondary compact replace-button"
              onClick={() => document.getElementById("replace-input")?.click()}
            >
              <ImagePlus size={17} /> Đổi ảnh
            </button>
          )}
        </div>
        <input
          id="replace-input"
          hidden
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) selectImage(file);
            e.target.value = "";
          }}
        />
      </header>
      {!source || !mask ? (
        <UploadZone onSelect={selectImage} error={error} />
      ) : (
        <main className="workspace">
          <section className="canvas-area">
            <div className="canvas-meta" aria-hidden="true">
              <span className="status-dot" />
              <strong>{source.file.name}</strong>
              <small>
                {outputSize.width} × {outputSize.height}
              </small>
            </div>
            <EditorCanvas
              source={source}
              mask={mask}
              maskVersion={maskVersion}
              activeTool={activeTool}
              brushSize={brushSize}
              brushHardness={brushHardness}
              background={background}
              shadow={shadow}
              crop={crop}
              cropDraft={cropDraft}
              outputSize={outputSize}
              centerSubject={centerSubject}
              paddingPercent={paddingPercent}
              subjectBounds={subjectBounds}
              viewport={viewport}
              onViewportChange={setViewport}
              onMaskStroke={paintMask}
              onStrokeStart={beginStroke}
              onStrokeEnd={endStroke}
              onCropDraftChange={setCropDraft}
            />
            {error && (
              <div className="workspace-error" role="alert">
                <span>{error}</span>
                <button
                  className="error-action"
                  onClick={removeBackground}
                  disabled={progress.stage !== "error"}
                >
                  Retry
                </button>
                <button
                  className="error-action"
                  onClick={() => {
                    setEngine("portrait");
                    setError(null);
                    setProgress({ stage: "idle", percent: 0, message: "" });
                  }}
                >
                  Portrait fallback
                </button>
                <button
                  onClick={() => setError(null)}
                  aria-label="Đóng thông báo"
                >
                  <X size={18} />
                </button>
              </div>
            )}
            {progress.stage !== "idle" && progress.stage !== "error" && (
              <div className="progress-card" role="status">
                <div>
                  <strong>{progress.message}</strong>
                  <span>{Math.round(progress.percent)}%</span>
                </div>
                <progress max="100" value={progress.percent} />
                <small>
                  {progress.stage === "loading" ||
                  progress.stage === "downloading"
                    ? "Lần đầu có thể mất một lúc; các lần sau model được lấy từ cache."
                    : "Bạn vẫn có thể thao tác với giao diện."}
                </small>
              </div>
            )}
          </section>
          <ToolPanel
            activeTool={activeTool}
            setActiveTool={changeTool}
            brushSize={brushSize}
            setBrushSize={setBrushSize}
            brushHardness={brushHardness}
            setBrushHardness={setBrushHardness}
            canUndo={maskHistory.current.canUndo}
            canRedo={maskHistory.current.canRedo}
            undo={undo}
            redo={redo}
            resetMask={resetMask}
            refineMask={refineMask}
            background={background}
            setBackground={setBackground}
            onBackgroundImage={backgroundImage}
            crop={cropDraft}
            setCropRatio={setCropRatio}
            applyCrop={applyCrop}
            cancelCrop={cancelCrop}
            resetCrop={resetCrop}
            resize={resize}
            setResize={setResize}
            shadow={shadow}
            setShadow={setShadow}
            exportSettings={exportSettings}
            setExportSettings={setExportSettings}
            outputSize={outputSize}
            estimatedBytes={estimatedBytes}
            onExport={exportImage}
            exporting={exporting}
            onRemove={removeBackground}
            processing={
              progress.stage === "downloading" ||
              progress.stage === "loading" ||
              progress.stage === "processing" ||
              progress.stage === "refining"
            }
            processed={processed}
            engine={engine}
            setEngine={setEngine}
            applyPreset={applyPreset}
            centerSubject={centerSubject}
            setCenterSubject={setCenterSubject}
            paddingPercent={paddingPercent}
            setPaddingPercent={setPaddingPercent}
          />
        </main>
      )}
    </div>
  );
}
