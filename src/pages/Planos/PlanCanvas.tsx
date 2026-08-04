import { useEffect, useMemo, useRef, useState } from "react";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AnnotationDraft, AnnotationTool, PlanoAnnotation } from "./planosTypes";

GlobalWorkerOptions.workerSrc = pdfWorker;

const COLORS = {
  annotation: "#EFA3E7",
  border: "#E6E6E6",
  muted: "#A3A39E",
  surface: "#FBFBFB",
};
const ANNOTATION_STROKE_WIDTH = 3;

type PlanCanvasProps = {
  url: string;
  mimeType: string;
  page: number;
  zoom: number;
  tool: AnnotationTool;
  annotations: PlanoAnnotation[];
  selectedAnnotationId?: string;
  readOnly?: boolean;
  onPageCountChange: (pageCount: number) => void;
  onDraft: (draft: AnnotationDraft) => void;
  onSelectAnnotation: (annotationId: string) => void;
};

type PointerDraft = {
  kind: "cloud" | "freehand";
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  points: Array<{ x: number; y: number }>;
};

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function svgNumber(value: number) {
  return Number(value.toFixed(2));
}

function appendCloudLobes(
  commands: string[],
  start: { x: number; y: number },
  end: { x: number; y: number },
  normal: { x: number; y: number },
  depth: number,
  targetSpan: number,
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  const count = Math.max(1, Math.round(length / targetSpan));
  for (let index = 1; index <= count; index += 1) {
    const startRatio = (index - 1) / count;
    const endRatio = index / count;
    const middleRatio = (startRatio + endRatio) / 2;
    commands.push(
      `Q ${svgNumber(start.x + dx * middleRatio + normal.x * depth)} ${svgNumber(
        start.y + dy * middleRatio + normal.y * depth,
      )} ${svgNumber(start.x + dx * endRatio)} ${svgNumber(start.y + dy * endRatio)}`,
    );
  }
}

function cloudPath(x: number, y: number, width: number, height: number) {
  const minSide = Math.min(width, height);
  const targetSpan = Math.max(30, Math.min(52, minSide * 0.45));
  const depth = Math.max(5, Math.min(16, targetSpan * 0.3, minSide * 0.18));
  const corner = Math.min(targetSpan * 0.48, width * 0.18, height * 0.18);
  const right = x + width;
  const bottom = y + height;
  const commands = [`M ${svgNumber(x + corner)} ${svgNumber(y)}`];

  appendCloudLobes(commands, { x: x + corner, y }, { x: right - corner, y }, { x: 0, y: -1 }, depth, targetSpan);
  commands.push(`Q ${svgNumber(right + depth)} ${svgNumber(y - depth)} ${svgNumber(right)} ${svgNumber(y + corner)}`);
  appendCloudLobes(commands, { x: right, y: y + corner }, { x: right, y: bottom - corner }, { x: 1, y: 0 }, depth, targetSpan);
  commands.push(`Q ${svgNumber(right + depth)} ${svgNumber(bottom + depth)} ${svgNumber(right - corner)} ${svgNumber(bottom)}`);
  appendCloudLobes(commands, { x: right - corner, y: bottom }, { x: x + corner, y: bottom }, { x: 0, y: 1 }, depth, targetSpan);
  commands.push(`Q ${svgNumber(x - depth)} ${svgNumber(bottom + depth)} ${svgNumber(x)} ${svgNumber(bottom - corner)}`);
  appendCloudLobes(commands, { x, y: bottom - corner }, { x, y: y + corner }, { x: -1, y: 0 }, depth, targetSpan);
  commands.push(`Q ${svgNumber(x - depth)} ${svgNumber(y - depth)} ${svgNumber(x + corner)} ${svgNumber(y)} Z`);
  return commands.join(" ");
}

function annotationStrokeOpacity(annotation: PlanoAnnotation, selected: boolean) {
  if (selected || annotation.status !== "Resuelta") return 1;
  return 0.55;
}

export default function PlanCanvas({
  url,
  mimeType,
  page,
  zoom,
  tool,
  annotations,
  selectedAnnotationId,
  readOnly,
  onPageCountChange,
  onDraft,
  onSelectAnnotation,
}: PlanCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<SVGSVGElement>(null);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy>();
  const [loading, setLoading] = useState(mimeType === "application/pdf");
  const [error, setError] = useState<string>();
  const [pointerDraft, setPointerDraft] = useState<PointerDraft>();
  const isPdf = mimeType === "application/pdf";

  useEffect(() => {
    setError(undefined);
    setPointerDraft(undefined);
    if (!isPdf) {
      setPdfDocument(undefined);
      setLoading(true);
      onPageCountChange(1);
      return;
    }
    let active = true;
    const loadingTask = getDocument({ url });
    setLoading(true);
    void loadingTask.promise
      .then((document) => {
        if (!active) {
          void loadingTask.destroy();
          return;
        }
        setPdfDocument(document);
        onPageCountChange(document.numPages);
      })
      .catch(() => {
        if (active) setError("No fue posible abrir este PDF.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      setPdfDocument(undefined);
      void loadingTask.destroy();
    };
  }, [isPdf, onPageCountChange, url]);

  useEffect(() => {
    if (!isPdf || !pdfDocument || !canvasRef.current || page < 1 || page > pdfDocument.numPages) return;
    let active = true;
    let renderTask: RenderTask | undefined;
    setLoading(true);
    setError(undefined);
    void pdfDocument
      .getPage(page)
      .then((pdfPage) => {
        if (!active || !canvasRef.current) return;
        const viewport = pdfPage.getViewport({ scale: 1.75 });
        const canvas = canvasRef.current;
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        renderTask = pdfPage.render({ canvas, viewport });
        return renderTask.promise;
      })
      .then(() => {
        if (active) setLoading(false);
      })
      .catch((renderError: unknown) => {
        if (!active) return;
        if (renderError instanceof Error && renderError.name === "RenderingCancelledException") return;
        setError("No fue posible renderizar esta página.");
        setLoading(false);
      });
    return () => {
      active = false;
      renderTask?.cancel();
    };
  }, [isPdf, page, pdfDocument]);

  const visibleAnnotations = useMemo(
    () => annotations.filter((annotation) => annotation.pagina === page),
    [annotations, page],
  );

  const pointerPosition = (event: React.PointerEvent<SVGSVGElement>) => {
    const bounds = overlayRef.current?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    return {
      x: clamp((event.clientX - bounds.left) / bounds.width),
      y: clamp((event.clientY - bounds.top) / bounds.height),
    };
  };

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (readOnly || tool === "select") return;
    const point = pointerPosition(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    setPointerDraft({
      kind: tool,
      startX: point.x,
      startY: point.y,
      currentX: point.x,
      currentY: point.y,
      points: tool === "freehand" ? [point] : [],
    });
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!pointerDraft) return;
    const point = pointerPosition(event);
    setPointerDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        currentX: point.x,
        currentY: point.y,
        points:
          current.kind === "freehand" && current.points.length < 600
            ? [...current.points, point]
            : current.points,
      };
    });
  };

  const handlePointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!pointerDraft) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (pointerDraft.kind === "cloud") {
      const x = Math.min(pointerDraft.startX, pointerDraft.currentX);
      const y = Math.min(pointerDraft.startY, pointerDraft.currentY);
      const width = Math.abs(pointerDraft.currentX - pointerDraft.startX);
      const height = Math.abs(pointerDraft.currentY - pointerDraft.startY);
      if (width >= 0.002 && height >= 0.002) {
        onDraft({ pagina: page, tipo: "cloud", x, y, width, height });
      }
    } else if (pointerDraft.points.length >= 2) {
      onDraft({ pagina: page, tipo: "freehand", puntos: pointerDraft.points });
    }
    setPointerDraft(undefined);
  };

  const previewCloudPath =
    pointerDraft?.kind === "cloud"
      ? {
          x: Math.min(pointerDraft.startX, pointerDraft.currentX) * 1000,
          y: Math.min(pointerDraft.startY, pointerDraft.currentY) * 1000,
          width: Math.abs(pointerDraft.currentX - pointerDraft.startX) * 1000,
          height: Math.abs(pointerDraft.currentY - pointerDraft.startY) * 1000,
        }
      : undefined;

  return (
    <div className="relative mx-auto" style={{ width: `${zoom * 100}%`, minWidth: zoom > 1 ? "48rem" : undefined }}>
      <div className="relative overflow-hidden border bg-white" style={{ borderColor: COLORS.border }}>
        {isPdf ? (
          <canvas
            ref={canvasRef}
            className={cn("block h-auto w-full bg-white", loading && "min-h-[36rem]")}
            aria-label={`Página ${page} del plano`}
          />
        ) : (
          <img
            src={url}
            alt="Plano arquitectónico"
            className="block h-auto w-full select-none bg-white"
            draggable={false}
            onLoad={() => setLoading(false)}
            onError={() => setError("No fue posible abrir esta imagen.")}
          />
        )}

        <svg
          ref={overlayRef}
          viewBox="0 0 1000 1000"
          preserveAspectRatio="none"
          className={cn(
            "absolute inset-0 h-full w-full touch-none",
            tool === "select" ? "cursor-default" : "cursor-crosshair",
          )}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => setPointerDraft(undefined)}
          aria-label="Capa de anotaciones"
        >
          {visibleAnnotations.map((annotation, index) => {
            const selected = annotation._id === selectedAnnotationId;
            const strokeOpacity = annotationStrokeOpacity(annotation, selected);
            const commonProps = {
              role: "button",
              tabIndex: 0,
              "aria-label": `Anotación ${index + 1}: ${annotation.comentario}`,
              onPointerDown: (event: React.PointerEvent<SVGElement>) => event.stopPropagation(),
              onClick: () => onSelectAnnotation(annotation._id),
              onKeyDown: (event: React.KeyboardEvent<SVGElement>) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectAnnotation(annotation._id);
                }
              },
            };

            if (annotation.tipo === "pin" && annotation.x !== undefined && annotation.y !== undefined) {
              const width = 64;
              const height = 48;
              const x = Math.max(12, Math.min(1000 - width - 12, annotation.x * 1000 - width / 2));
              const y = Math.max(12, Math.min(1000 - height - 12, annotation.y * 1000 - height / 2));
              const path = cloudPath(x, y, width, height);
              return (
                <g key={annotation._id} className="cursor-pointer" {...commonProps}>
                  <path d={path} fill="none" stroke="transparent" strokeWidth="18" vectorEffect="non-scaling-stroke" pointerEvents="stroke" />
                  <path d={path} fill="none" stroke={COLORS.annotation} strokeWidth={selected ? 4 : ANNOTATION_STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" opacity={strokeOpacity} pointerEvents="none" />
                </g>
              );
            }

            if (
              (annotation.tipo === "rectangle" || annotation.tipo === "cloud") &&
              annotation.x !== undefined &&
              annotation.y !== undefined &&
              annotation.width !== undefined &&
              annotation.height !== undefined
            ) {
              const path = cloudPath(annotation.x * 1000, annotation.y * 1000, annotation.width * 1000, annotation.height * 1000);
              return (
                <g key={annotation._id} className="cursor-pointer" {...commonProps}>
                  <path d={path} fill="none" stroke="transparent" strokeWidth="18" vectorEffect="non-scaling-stroke" pointerEvents="stroke" />
                  <path d={path} fill="none" stroke={COLORS.annotation} strokeWidth={selected ? 4 : ANNOTATION_STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" opacity={strokeOpacity} pointerEvents="none" />
                </g>
              );
            }

            if (annotation.tipo === "freehand" && annotation.puntos?.length) {
              const points = annotation.puntos.map((point) => `${point.x * 1000},${point.y * 1000}`).join(" ");
              return (
                <g key={annotation._id} className="cursor-pointer" {...commonProps}>
                  <polyline points={points} fill="none" stroke="transparent" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" pointerEvents="stroke" />
                  <polyline points={points} fill="none" stroke={COLORS.annotation} strokeWidth={selected ? 4 : ANNOTATION_STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" opacity={strokeOpacity} pointerEvents="none" />
                </g>
              );
            }
            return null;
          })}

          {previewCloudPath && (
            <path
              d={cloudPath(previewCloudPath.x, previewCloudPath.y, previewCloudPath.width, previewCloudPath.height)}
              fill="none"
              stroke={COLORS.annotation}
              strokeWidth={ANNOTATION_STROKE_WIDTH}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          )}
          {pointerDraft?.kind === "freehand" && pointerDraft.points.length > 1 && (
            <polyline
              points={pointerDraft.points.map((point) => `${point.x * 1000},${point.y * 1000}`).join(" ")}
              fill="none"
              stroke={COLORS.annotation}
              strokeWidth={ANNOTATION_STROKE_WIDTH}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          )}
        </svg>

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: COLORS.muted }} />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm" style={{ backgroundColor: COLORS.surface, color: COLORS.muted }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
