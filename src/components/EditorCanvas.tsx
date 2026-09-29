import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, Maximize, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import type {
  BackgroundSettings,
  CropSettings,
  ShadowSettings,
  SourceImage,
  Tool,
  ViewportState,
} from "../types";
import {
  compositionPointToImage,
  hitTestCrop,
  updateCropFromDrag,
  type CompositionGeometry,
  type CropHandle,
  type Point,
  type Rect,
} from "../editor/geometry";
import {
  renderCompositionWithGeometry,
  renderOriginalComposition,
} from "../utils/image";

interface Props {
  source: SourceImage;
  mask: Uint8ClampedArray;
  maskVersion: number;
  activeTool: Tool;
  brushSize: number;
  brushHardness: number;
  background: BackgroundSettings;
  shadow: ShadowSettings;
  crop: CropSettings;
  cropDraft: CropSettings;
  outputSize: { width: number; height: number };
  centerSubject: boolean;
  paddingPercent: number;
  subjectBounds: Rect | null;
  viewport: ViewportState;
  onViewportChange: (value: ViewportState) => void;
  onMaskStroke: (
    points: Array<{ x: number; y: number }>,
    restore: boolean,
  ) => void;
  onStrokeStart: () => void;
  onStrokeEnd: () => void;
  onCropDraftChange: (crop: CropSettings) => void;
}

interface PreviewState {
  width: number;
  height: number;
  geometry: CompositionGeometry;
  processed: HTMLCanvasElement;
  original: HTMLCanvasElement;
}

interface CropDrag {
  handle: CropHandle;
  startPoint: Point;
  startCrop: CropSettings;
}

export function EditorCanvas({
  source,
  mask,
  maskVersion,
  activeTool,
  brushSize,
  brushHardness,
  background,
  shadow,
  crop,
  cropDraft,
  outputSize,
  centerSubject,
  paddingPercent,
  subjectBounds,
  viewport,
  onViewportChange,
  onMaskStroke,
  onStrokeStart,
  onStrokeEnd,
  onCropDraftChange,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<PreviewState | null>(null);
  const cropDragRef = useRef<CropDrag | null>(null);
  const [comparison, setComparison] = useState(0);
  const [showOriginal, setShowOriginal] = useState(false);
  const [dragging, setDragging] = useState<"pan" | "brush" | "crop" | null>(
    null,
  );
  const [lastPoint, setLastPoint] = useState<Point | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);

  const displayAspect =
    activeTool === "crop"
      ? source.width / source.height
      : outputSize.width / outputSize.height;

  const dimensions = useCallback(() => {
    const host = hostRef.current;
    if (!host)
      return {
        width: 1,
        height: 1,
        fit: 1,
        x: 0,
        y: 0,
        drawWidth: 1,
        drawHeight: 1,
      };
    const width = host.clientWidth;
    const height = host.clientHeight;
    const baseWidth = displayAspect >= 1 ? 1000 : 1000 * displayAspect;
    const baseHeight = baseWidth / displayAspect;
    const fit = Math.min((width - 48) / baseWidth, (height - 48) / baseHeight);
    const scale = fit * viewport.zoom;
    const drawWidth = baseWidth * scale;
    const drawHeight = baseHeight * scale;
    return {
      width,
      height,
      fit,
      drawWidth,
      drawHeight,
      x: width / 2 - drawWidth / 2 + viewport.panX,
      y: height / 2 - drawHeight / 2 + viewport.panY,
    };
  }, [displayAspect, viewport]);

  const createPreview = useCallback(
    (hostWidth: number, hostHeight: number) => {
      const ratio = displayAspect;
      let width = Math.max(320, Math.min(1800, hostWidth * 1.5));
      let height = width / ratio;
      if (height > hostHeight * 1.8) {
        height = Math.max(320, hostHeight * 1.8);
        width = height * ratio;
      }
      const pixels = width * height;
      if (pixels > 1_000_000) {
        const scale = Math.sqrt(1_000_000 / pixels);
        width *= scale;
        height *= scale;
      }
      const previewCrop =
        activeTool === "crop"
          ? {
              ratio: "free" as const,
              x: 0,
              y: 0,
              width: source.width,
              height: source.height,
            }
          : crop;
      const previewCenter = activeTool === "crop" ? false : centerSubject;
      const result = renderCompositionWithGeometry({
        image: source.element,
        mask,
        maskWidth: source.width,
        maskHeight: source.height,
        background,
        shadow,
        crop: previewCrop,
        outputWidth: width,
        outputHeight: height,
        centerSubject: previewCenter,
        paddingPercent,
        subjectBounds: previewCenter ? subjectBounds : null,
        maxWorkingPixels: 1_000_000,
        referenceWidth: activeTool === "crop" ? source.width : outputSize.width,
      });
      const original = renderOriginalComposition({
        image: source.element,
        crop: previewCrop,
        outputWidth: result.canvas.width,
        outputHeight: result.canvas.height,
        centerSubject: previewCenter,
        paddingPercent,
        subjectBounds: previewCenter ? subjectBounds : null,
      });
      return {
        width: result.canvas.width,
        height: result.canvas.height,
        geometry: result.geometry,
        processed: result.canvas,
        original,
      };
    },
    [
      activeTool,
      background,
      centerSubject,
      crop,
      displayAspect,
      mask,
      maskVersion,
      outputSize.width,
      paddingPercent,
      shadow,
      source,
      subjectBounds,
    ],
  );

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = dimensions();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, rect.width, rect.height);

    const preview = createPreview(rect.width, rect.height);
    previewRef.current = preview;
    context.drawImage(
      preview.processed,
      rect.x,
      rect.y,
      rect.drawWidth,
      rect.drawHeight,
    );

    const originalShare = showOriginal ? 1 : comparison / 100;
    if (originalShare > 0) {
      context.save();
      context.beginPath();
      context.rect(
        rect.x,
        rect.y,
        rect.drawWidth * originalShare,
        rect.drawHeight,
      );
      context.clip();
      context.drawImage(
        preview.original,
        rect.x,
        rect.y,
        rect.drawWidth,
        rect.drawHeight,
      );
      context.restore();
    }

    if (activeTool === "crop") {
      const scaleX = rect.drawWidth / source.width;
      const scaleY = rect.drawHeight / source.height;
      const x = rect.x + cropDraft.x * scaleX;
      const y = rect.y + cropDraft.y * scaleY;
      const width = cropDraft.width * scaleX;
      const height = cropDraft.height * scaleY;
      context.save();
      context.fillStyle = "rgba(10, 18, 15, 0.58)";
      context.fillRect(rect.x, rect.y, rect.drawWidth, Math.max(0, y - rect.y));
      context.fillRect(
        rect.x,
        y + height,
        rect.drawWidth,
        Math.max(0, rect.y + rect.drawHeight - y - height),
      );
      context.fillRect(rect.x, y, Math.max(0, x - rect.x), height);
      context.fillRect(
        x + width,
        y,
        Math.max(0, rect.x + rect.drawWidth - x - width),
        height,
      );
      context.strokeStyle = "#ffffff";
      context.lineWidth = 2;
      context.strokeRect(x, y, width, height);
      context.setLineDash([5, 5]);
      context.lineWidth = 1;
      context.strokeStyle = "rgba(255,255,255,.75)";
      context.beginPath();
      context.moveTo(x + width / 3, y);
      context.lineTo(x + width / 3, y + height);
      context.moveTo(x + (width * 2) / 3, y);
      context.lineTo(x + (width * 2) / 3, y + height);
      context.moveTo(x, y + height / 3);
      context.lineTo(x + width, y + height / 3);
      context.moveTo(x, y + (height * 2) / 3);
      context.lineTo(x + width, y + (height * 2) / 3);
      context.stroke();
      context.setLineDash([]);
      context.fillStyle = "#ffffff";
      for (const [hx, hy] of [
        [x, y],
        [x + width / 2, y],
        [x + width, y],
        [x, y + height / 2],
        [x + width, y + height / 2],
        [x, y + height],
        [x + width / 2, y + height],
        [x + width, y + height],
      ]) {
        context.fillRect(hx - 5, hy - 5, 10, 10);
      }
      context.restore();
    }
  }, [
    activeTool,
    comparison,
    createPreview,
    cropDraft,
    dimensions,
    maskVersion,
    showOriginal,
    source.height,
    source.width,
  ]);

  useEffect(() => {
    let frame = requestAnimationFrame(render);
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(render);
    });
    if (hostRef.current) observer.observe(hostRef.current);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [render]);

  const clientToComposition = (clientX: number, clientY: number) => {
    const host = hostRef.current;
    const preview = previewRef.current;
    if (!host || !preview) return null;
    const bounds = host.getBoundingClientRect();
    const rect = dimensions();
    const x =
      ((clientX - bounds.left - rect.x) / rect.drawWidth) * preview.width;
    const y =
      ((clientY - bounds.top - rect.y) / rect.drawHeight) * preview.height;
    if (x < 0 || y < 0 || x > preview.width || y > preview.height) return null;
    return { x, y };
  };

  const clientToImage = (clientX: number, clientY: number) => {
    const preview = previewRef.current;
    const point = clientToComposition(clientX, clientY);
    if (!preview || !point) return null;
    return compositionPointToImage(point, preview.geometry);
  };

  const pointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (activeTool === "crop") {
      const point = clientToImage(event.clientX, event.clientY);
      if (!point) return;
      const rect = dimensions();
      const tolerance = 14 / Math.max(0.01, rect.drawWidth / source.width);
      const handle = hitTestCrop(point, cropDraft, tolerance);
      if (!handle) return;
      cropDragRef.current = { handle, startPoint: point, startCrop: cropDraft };
      setDragging("crop");
      return;
    }
    if (activeTool === "restore" || activeTool === "erase") {
      const point = clientToImage(event.clientX, event.clientY);
      if (point) {
        onStrokeStart();
        setDragging("brush");
        setLastPoint(point);
        onMaskStroke([point], activeTool === "restore");
      }
    } else {
      setDragging("pan");
      setLastPoint({ x: event.clientX, y: event.clientY });
    }
  };

  const pointerMove = (event: React.PointerEvent) => {
    const host = hostRef.current;
    if (host) {
      const bounds = host.getBoundingClientRect();
      setCursor({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });
    }
    if (dragging === "crop" && cropDragRef.current) {
      const point = clientToImage(event.clientX, event.clientY);
      if (!point) return;
      onCropDraftChange(
        updateCropFromDrag({
          start: cropDragRef.current.startCrop,
          startPoint: cropDragRef.current.startPoint,
          point,
          handle: cropDragRef.current.handle,
          imageWidth: source.width,
          imageHeight: source.height,
        }),
      );
      return;
    }
    if (!dragging || !lastPoint) return;
    if (dragging === "pan") {
      onViewportChange({
        ...viewport,
        panX: viewport.panX + event.clientX - lastPoint.x,
        panY: viewport.panY + event.clientY - lastPoint.y,
      });
      setLastPoint({ x: event.clientX, y: event.clientY });
    } else if (dragging === "brush") {
      const point = clientToImage(event.clientX, event.clientY);
      if (point) {
        onMaskStroke([lastPoint, point], activeTool === "restore");
        setLastPoint(point);
      }
    }
  };

  const finishPointer = () => {
    if (dragging === "brush") onStrokeEnd();
    cropDragRef.current = null;
    setDragging(null);
    setLastPoint(null);
  };

  const zoomAt = (factor: number) =>
    onViewportChange({
      ...viewport,
      zoom: Math.min(8, Math.max(0.2, viewport.zoom * factor)),
    });

  const preview = previewRef.current;
  const rect = dimensions();
  const brushScale =
    preview && preview.geometry.source.width
      ? (preview.geometry.destination.width / preview.width) *
        (rect.drawWidth / preview.geometry.source.width)
      : rect.drawWidth / source.width;
  const brushDiameter = Math.max(3, brushSize * brushScale);
  const compareLeft = rect.x + (rect.drawWidth * comparison) / 100;

  return (
    <div
      className="canvas-shell"
      ref={hostRef}
      onWheel={(event) => {
        event.preventDefault();
        zoomAt(event.deltaY < 0 ? 1.12 : 0.89);
      }}
    >
      <canvas
        ref={canvasRef}
        className="editor-canvas"
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
        onPointerLeave={() => setCursor(null)}
        aria-label="Vùng chỉnh sửa ảnh"
      />
      {(activeTool === "restore" || activeTool === "erase") && cursor && (
        <div
          className="brush-cursor"
          style={{
            width: brushDiameter,
            height: brushDiameter,
            left: cursor.x,
            top: cursor.y,
            opacity: 0.55 + brushHardness * 0.004,
          }}
        />
      )}
      {comparison > 0 && !showOriginal && activeTool !== "crop" && (
        <div className="compare-line" style={{ left: compareLeft }}>
          <span>Trước</span>
        </div>
      )}
      <div className="canvas-actions" aria-label="Điều khiển khung nhìn">
        <button
          className="icon-button"
          onClick={() => zoomAt(0.8)}
          aria-label="Thu nhỏ"
        >
          <ZoomOut size={18} />
        </button>
        <span>{Math.round(viewport.zoom * 100)}%</span>
        <button
          className="icon-button"
          onClick={() => zoomAt(1.25)}
          aria-label="Phóng to"
        >
          <ZoomIn size={18} />
        </button>
        <button
          className="icon-button"
          onClick={() => onViewportChange({ zoom: 1, panX: 0, panY: 0 })}
          aria-label="Vừa khung"
        >
          <Maximize size={18} />
        </button>
        <button
          className="icon-button"
          onClick={() => onViewportChange({ zoom: 1, panX: 0, panY: 0 })}
          aria-label="Đặt lại zoom"
        >
          <RotateCcw size={18} />
        </button>
        <button
          className={`icon-button ${showOriginal ? "active" : ""}`}
          onPointerDown={() => setShowOriginal(true)}
          onPointerUp={() => setShowOriginal(false)}
          onPointerLeave={() => setShowOriginal(false)}
          aria-label="Giữ để xem ảnh gốc"
        >
          <Eye size={18} />
        </button>
      </div>
      {activeTool !== "crop" && (
        <label className="comparison-control">
          <span>Trước</span>
          <input
            type="range"
            min="0"
            max="100"
            value={comparison}
            onChange={(event) => setComparison(Number(event.target.value))}
            aria-label="So sánh ảnh trước và sau"
          />
          <span>Sau</span>
        </label>
      )}
    </div>
  );
}
