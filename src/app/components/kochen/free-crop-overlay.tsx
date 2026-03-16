import React, { useState, useRef, useCallback, useEffect } from "react";
import { motion } from "motion/react";
import { Camera, RotateCcw, RotateCw, ZoomIn } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────
interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface FreeCropOverlayProps {
  imageSrc: string;
  title: string;
  confirmLabel: string;
  confirmIcon?: React.ReactNode;
  showRotation?: boolean;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
}

const MIN_CROP = 40; // px minimum crop dimension
const HANDLE_SIZE = 32; // touch target for corner handles
const HANDLE_VISUAL = 3; // visual line thickness

// ── Component ──────────────────────────────────────────────────────
export function FreeCropOverlay({
  imageSrc,
  title,
  confirmLabel,
  confirmIcon,
  showRotation = true,
  onConfirm,
  onCancel,
}: FreeCropOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Image natural dimensions
  const [imgNatural, setImgNatural] = useState({ w: 0, h: 0 });

  // Transforms
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);

  // Crop rect in container-relative pixels
  const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, w: 0, h: 0 });

  // Track which handle/action is active
  const dragRef = useRef<{
    type: "move" | "tl" | "tr" | "bl" | "br";
    startX: number;
    startY: number;
    startCrop: CropRect;
  } | null>(null);

  // Container bounds
  const [containerBounds, setContainerBounds] = useState({ w: 0, h: 0 });

  // ── Compute displayed image rect (fit image in container considering rotation) ──
  const getDisplayedImageRect = useCallback(() => {
    if (!imgNatural.w || !containerBounds.w) return { x: 0, y: 0, w: 0, h: 0 };

    const rad = (rotation * Math.PI) / 180;
    // Bounding box of rotated image
    const rotW = Math.abs(Math.cos(rad) * imgNatural.w) + Math.abs(Math.sin(rad) * imgNatural.h);
    const rotH = Math.abs(Math.sin(rad) * imgNatural.w) + Math.abs(Math.cos(rad) * imgNatural.h);

    // Scale to fit container
    const scale = Math.min(containerBounds.w / rotW, containerBounds.h / rotH) * zoom;

    const dispW = rotW * scale;
    const dispH = rotH * scale;
    const dispX = (containerBounds.w - dispW) / 2;
    const dispY = (containerBounds.h - dispH) / 2;

    return { x: dispX, y: dispY, w: dispW, h: dispH };
  }, [imgNatural, containerBounds, rotation, zoom]);

  // ── Initialize crop to cover the displayed image area ──
  const initCrop = useCallback(() => {
    const rect = getDisplayedImageRect();
    if (rect.w <= 0) return;
    // Clamp to container
    const x = Math.max(0, rect.x + 8);
    const y = Math.max(0, rect.y + 8);
    const w = Math.min(containerBounds.w, rect.x + rect.w - 8) - x;
    const h = Math.min(containerBounds.h, rect.y + rect.h - 8) - y;
    setCrop({ x, y, w: Math.max(MIN_CROP, w), h: Math.max(MIN_CROP, h) });
  }, [getDisplayedImageRect, containerBounds]);

  // ── Image loaded handler ──
  const handleImageLoad = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    setImgNatural({ w: img.naturalWidth, h: img.naturalHeight });
  }, []);

  // ── Measure container on mount + resize ──
  useEffect(() => {
    const measure = () => {
      const el = containerRef.current;
      if (!el) return;
      setContainerBounds({ w: el.clientWidth, h: el.clientHeight });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Re-init crop when image loads or container/rotation/zoom changes
  useEffect(() => {
    if (imgNatural.w > 0 && containerBounds.w > 0) {
      initCrop();
    }
  }, [imgNatural, containerBounds, rotation, zoom, initCrop]);

  // ── Clamp crop to container ──
  const clampCrop = useCallback((c: CropRect): CropRect => {
    let { x, y, w, h } = c;
    w = Math.max(MIN_CROP, w);
    h = Math.max(MIN_CROP, h);
    x = Math.max(0, Math.min(x, containerBounds.w - w));
    y = Math.max(0, Math.min(y, containerBounds.h - h));
    return { x, y, w, h };
  }, [containerBounds]);

  // ── Pointer handlers for dragging/resizing ──
  const handlePointerDown = useCallback((
    e: React.PointerEvent,
    type: "move" | "tl" | "tr" | "bl" | "br"
  ) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      type,
      startX: e.clientX,
      startY: e.clientY,
      startCrop: { ...crop },
    };
  }, [crop]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    e.preventDefault();
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const s = dragRef.current.startCrop;

    let newCrop: CropRect;

    switch (dragRef.current.type) {
      case "move":
        newCrop = clampCrop({ x: s.x + dx, y: s.y + dy, w: s.w, h: s.h });
        break;
      case "tl":
        newCrop = clampCrop({
          x: s.x + dx,
          y: s.y + dy,
          w: s.w - dx,
          h: s.h - dy,
        });
        break;
      case "tr":
        newCrop = clampCrop({
          x: s.x,
          y: s.y + dy,
          w: s.w + dx,
          h: s.h - dy,
        });
        break;
      case "bl":
        newCrop = clampCrop({
          x: s.x + dx,
          y: s.y,
          w: s.w - dx,
          h: s.h + dy,
        });
        break;
      case "br":
        newCrop = clampCrop({
          x: s.x,
          y: s.y,
          w: s.w + dx,
          h: s.h + dy,
        });
        break;
      default:
        return;
    }

    setCrop(newCrop);
  }, [clampCrop]);

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  // ── Export: render rotated+zoomed image to canvas, then crop ──
  const handleConfirm = useCallback(async () => {
    if (!imgRef.current || !imgNatural.w) return;

    const displayRect = getDisplayedImageRect();
    if (displayRect.w <= 0) return;

    // Map crop rect from container coords to image natural coords
    const rad = (rotation * Math.PI) / 180;
    const rotW = Math.abs(Math.cos(rad) * imgNatural.w) + Math.abs(Math.sin(rad) * imgNatural.h);
    const rotH = Math.abs(Math.sin(rad) * imgNatural.w) + Math.abs(Math.cos(rad) * imgNatural.h);

    // Scale factor from display to natural rotated coords
    const scaleFactor = rotW / displayRect.w;

    // Crop in rotated-natural coords
    const natX = (crop.x - displayRect.x) * scaleFactor;
    const natY = (crop.y - displayRect.y) * scaleFactor;
    const natW = crop.w * scaleFactor;
    const natH = crop.h * scaleFactor;

    // Draw rotated image on intermediate canvas
    const rotCanvas = document.createElement("canvas");
    rotCanvas.width = Math.round(rotW);
    rotCanvas.height = Math.round(rotH);
    const rotCtx = rotCanvas.getContext("2d")!;
    rotCtx.translate(rotW / 2, rotH / 2);
    rotCtx.rotate(rad);
    rotCtx.translate(-imgNatural.w / 2, -imgNatural.h / 2);
    rotCtx.drawImage(imgRef.current, 0, 0);

    // Crop from rotated canvas
    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = Math.round(Math.max(1, natW));
    cropCanvas.height = Math.round(Math.max(1, natH));
    const cropCtx = cropCanvas.getContext("2d")!;
    cropCtx.drawImage(
      rotCanvas,
      Math.round(natX), Math.round(natY), Math.round(natW), Math.round(natH),
      0, 0, cropCanvas.width, cropCanvas.height,
    );

    const blob = await new Promise<Blob>((resolve, reject) =>
      cropCanvas.toBlob(
        (b) => b ? resolve(b) : reject(new Error("toBlob failed")),
        "image/jpeg",
        0.90,
      )
    );

    onConfirm(blob);
  }, [imgNatural, rotation, zoom, crop, getDisplayedImageRect, onConfirm]);

  // ── Image CSS transform ──
  const imgStyle: React.CSSProperties = {
    position: "absolute",
    top: "50%",
    left: "50%",
    transformOrigin: "center center",
    transform: `translate(-50%, -50%) rotate(${rotation}deg) scale(${zoom})`,
    maxWidth: "none",
    maxHeight: "none",
    pointerEvents: "none",
    userSelect: "none",
    WebkitUserSelect: "none",
  };

  // Fit image to container (unrotated natural → fit, then let CSS rotate)
  const fitImageDims = (() => {
    if (!imgNatural.w || !containerBounds.w) return { width: "100%", height: "auto" };
    // We need to fit so that when rotated, it stays in bounds (at zoom=1)
    const rad = (rotation * Math.PI) / 180;
    const rotW = Math.abs(Math.cos(rad) * imgNatural.w) + Math.abs(Math.sin(rad) * imgNatural.h);
    const rotH = Math.abs(Math.sin(rad) * imgNatural.w) + Math.abs(Math.cos(rad) * imgNatural.h);
    const baseScale = Math.min(containerBounds.w / rotW, containerBounds.h / rotH);
    return {
      width: `${imgNatural.w * baseScale}px`,
      height: `${imgNatural.h * baseScale}px`,
    };
  })();

  // ── Dark overlay with crop cutout (using clip-path) ──
  const overlayPath = containerBounds.w > 0
    ? `polygon(
        0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%,
        ${crop.x}px ${crop.y}px,
        ${crop.x}px ${crop.y + crop.h}px,
        ${crop.x + crop.w}px ${crop.y + crop.h}px,
        ${crop.x + crop.w}px ${crop.y}px,
        ${crop.x}px ${crop.y}px
      )`
    : undefined;

  return (
    <motion.div
      className="fixed inset-0 z-[3000] flex flex-col"
      style={{ background: "#000", touchAction: "none" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Header */}
      <div
        className="flex items-center justify-center px-4 flex-shrink-0"
        style={{ paddingTop: "max(env(safe-area-inset-top), 16px)", paddingBottom: 8 }}
      >
        <span className="text-white text-sm font-semibold">{title}</span>
      </div>

      {/* Image + Crop area */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden"
        style={{ touchAction: "none" }}
      >
        {/* Image */}
        <img
          ref={imgRef}
          src={imageSrc}
          onLoad={handleImageLoad}
          style={{ ...imgStyle, ...fitImageDims }}
          alt=""
          draggable={false}
        />

        {/* Dark overlay with cutout */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "rgba(0,0,0,0.55)",
            clipPath: overlayPath,
            WebkitClipPath: overlayPath,
          }}
        />

        {/* Crop border */}
        <div
          className="absolute pointer-events-none"
          style={{
            left: crop.x,
            top: crop.y,
            width: crop.w,
            height: crop.h,
            border: "2px solid rgba(255,255,255,0.85)",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.3)",
          }}
        >
          {/* Grid lines (rule of thirds) */}
          <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
            <div className="absolute" style={{ left: "33.33%", top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.25)" }} />
            <div className="absolute" style={{ left: "66.66%", top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.25)" }} />
            <div className="absolute" style={{ top: "33.33%", left: 0, right: 0, height: 1, background: "rgba(255,255,255,0.25)" }} />
            <div className="absolute" style={{ top: "66.66%", left: 0, right: 0, height: 1, background: "rgba(255,255,255,0.25)" }} />
          </div>
        </div>

        {/* Move handle (entire crop area) */}
        <div
          className="absolute cursor-move"
          style={{
            left: crop.x + HANDLE_SIZE / 2,
            top: crop.y + HANDLE_SIZE / 2,
            width: Math.max(0, crop.w - HANDLE_SIZE),
            height: Math.max(0, crop.h - HANDLE_SIZE),
            touchAction: "none",
          }}
          onPointerDown={(e) => handlePointerDown(e, "move")}
        />

        {/* Corner handles */}
        {(["tl", "tr", "bl", "br"] as const).map((corner) => {
          const isLeft = corner.includes("l");
          const isTop = corner.includes("t");
          const cx = isLeft ? crop.x : crop.x + crop.w;
          const cy = isTop ? crop.y : crop.y + crop.h;

          return (
            <div
              key={corner}
              className="absolute"
              style={{
                left: cx - HANDLE_SIZE / 2,
                top: cy - HANDLE_SIZE / 2,
                width: HANDLE_SIZE,
                height: HANDLE_SIZE,
                touchAction: "none",
                cursor:
                  corner === "tl" || corner === "br"
                    ? "nwse-resize"
                    : "nesw-resize",
                zIndex: 10,
              }}
              onPointerDown={(e) => handlePointerDown(e, corner)}
            >
              {/* Visual L-shaped corner indicator */}
              <div
                className="absolute"
                style={{
                  [isTop ? "top" : "bottom"]: HANDLE_SIZE / 2 - HANDLE_VISUAL / 2,
                  [isLeft ? "left" : "right"]: HANDLE_SIZE / 2 - HANDLE_VISUAL / 2,
                  width: 18,
                  height: HANDLE_VISUAL,
                  background: "#fff",
                  borderRadius: 1,
                }}
              />
              <div
                className="absolute"
                style={{
                  [isTop ? "top" : "bottom"]: HANDLE_SIZE / 2 - HANDLE_VISUAL / 2,
                  [isLeft ? "left" : "right"]: HANDLE_SIZE / 2 - HANDLE_VISUAL / 2,
                  width: HANDLE_VISUAL,
                  height: 18,
                  background: "#fff",
                  borderRadius: 1,
                }}
              />
            </div>
          );
        })}

        {/* Edge handles (midpoints) for easier resizing */}
        {/* Top edge */}
        <div
          className="absolute cursor-ns-resize"
          style={{
            left: crop.x + HANDLE_SIZE / 2,
            top: crop.y - HANDLE_SIZE / 2,
            width: Math.max(0, crop.w - HANDLE_SIZE),
            height: HANDLE_SIZE,
            touchAction: "none",
          }}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            dragRef.current = {
              type: "tl", // reuse tl logic but only dy
              startX: e.clientX,
              startY: e.clientY,
              startCrop: { ...crop },
            };
            // Override: only move top edge
            const origMove = handlePointerMove;
          }}
        />
        {/* Bottom edge */}
        <div
          className="absolute cursor-ns-resize"
          style={{
            left: crop.x + HANDLE_SIZE / 2,
            top: crop.y + crop.h - HANDLE_SIZE / 2,
            width: Math.max(0, crop.w - HANDLE_SIZE),
            height: HANDLE_SIZE,
            touchAction: "none",
          }}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            dragRef.current = {
              type: "br",
              startX: e.clientX,
              startY: e.clientY,
              startCrop: { ...crop },
            };
          }}
        />
      </div>

      {/* Controls area */}
      <div className="flex-shrink-0 px-4 pt-2 pb-1">
        {/* Zoom slider */}
        <div className="flex items-center gap-3 mb-2">
          <ZoomIn className="w-4 h-4 text-white/60 flex-shrink-0" />
          <input
            type="range"
            min={100}
            max={300}
            step={5}
            value={Math.round(zoom * 100)}
            onChange={(e) => setZoom(Number(e.target.value) / 100)}
            style={{ accentColor: "var(--color-accent)", width: "100%" }}
          />
          <span className="text-white/60 text-xs w-10 text-right flex-shrink-0">
            {Math.round(zoom * 100)}%
          </span>
        </div>

        {showRotation && (
          <div className="flex items-center gap-3">
            <button
              className="flex items-center justify-center rounded-xl text-sm font-semibold flex-shrink-0"
              style={{ width: 44, height: 44, background: "rgba(255,255,255,0.15)", color: "#fff" }}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => setRotation((r) => (r - 90 + 360) % 360)}
              aria-label="90 Grad gegen Uhrzeigersinn"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
            <div className="flex-1 flex flex-col gap-1">
              <input
                type="range"
                min={-45}
                max={45}
                step={1}
                value={rotation > 180 ? rotation - 360 : rotation}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setRotation(v < 0 ? v + 360 : v);
                }}
                style={{ accentColor: "var(--color-accent)", width: "100%" }}
              />
              <div className="flex justify-between">
                <span className="text-white/40 text-xs">{"\u2212"}45{"\u00B0"}</span>
                <span className="text-white/60 text-xs font-medium">
                  {rotation === 0 || rotation === 360
                    ? "0\u00B0"
                    : rotation > 180
                    ? `${rotation - 360}\u00B0`
                    : `+${rotation}\u00B0`}
                </span>
                <span className="text-white/40 text-xs">+45{"\u00B0"}</span>
              </div>
            </div>
            <button
              className="flex items-center justify-center rounded-xl text-sm font-semibold flex-shrink-0"
              style={{ width: 44, height: 44, background: "rgba(255,255,255,0.15)", color: "#fff" }}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => setRotation((r) => (r + 90) % 360)}
              aria-label="90 Grad im Uhrzeigersinn"
            >
              <RotateCw className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      {/* Buttons */}
      <div
        className="flex gap-3 px-4 flex-shrink-0"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 16px)", paddingTop: 8 }}
      >
        <button
          className="flex-1 py-3 rounded-2xl text-sm font-semibold"
          style={{ background: "rgba(255,255,255,0.15)", color: "#fff" }}
          onClick={onCancel}
        >
          Abbrechen
        </button>
        <button
          className="flex-1 py-3 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2"
          style={{ background: "var(--color-accent)", color: "#fff" }}
          onClick={handleConfirm}
        >
          {confirmIcon}
          {confirmLabel}
        </button>
      </div>
    </motion.div>
  );
}
