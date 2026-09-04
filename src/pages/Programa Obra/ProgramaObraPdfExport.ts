import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { STATIC_NEUTRAL_COLORS } from "@/lib/design-tokens";
import type { ProgramaItem } from "./programa-obra-types";
import { computeGanttPagination, ROW_CSS_PX } from "./programa-obra-pdf-layout";

export interface ComentarioForPdf {
  partidaNombre: string;
  comentario: string;
  fechaInicio: string;
  fechaFin: string;
  createdByName?: string;
}

export type ProgramaObraExportViewState = {
  expandedIds: Set<string>;
  searchTerm: string;
  statusFilter: string;
};

export interface PdfExportOptions {
  /** Ref to the fixed left-columns container (shrink-0 div) */
  leftColumnsEl: HTMLElement;
  /** Ref to the scrollable timeline container (flex-1 overflow-x-auto div) */
  timelineEl: HTMLElement;
  /** Project name for the PDF header & filename */
  projectName: string;
  /** Expand every partida/familia so the PDF includes the full breakdown */
  expandAll: () => ProgramaObraExportViewState;
  /** Restore the on-screen expand/filter state after capture */
  restoreView: (state: ProgramaObraExportViewState) => void;
  /** Level-0 items with comentarios attached (for the comments pages) */
  programaData: ProgramaItem[];
}

// Landscape A3: 420 x 297 mm
const PAGE_W_MM = 420;
const PAGE_H_MM = 297;
const MARGIN_MM = 10;
const HEADER_H_MM = 12;

const USABLE_W_MM = PAGE_W_MM - 2 * MARGIN_MM;
const USABLE_H_MM = PAGE_H_MM - 2 * MARGIN_MM - HEADER_H_MM;

// CSS overrides injected during capture to prevent text clipping
const PDF_EXPORT_STYLE_ID = "__pdf-export-overrides__";
const PDF_EXPORT_CSS = `
  [data-pdf-export-active] .truncate {
    overflow: visible !important;
    text-overflow: unset !important;
    white-space: nowrap !important;
  }
  [data-pdf-export-active] .min-h-\\[44px\\] {
    min-height: 44px !important;
    height: 44px !important;
  }
  [data-pdf-export-active] .max-h-\\[44px\\] {
    max-height: 44px !important;
    height: 44px !important;
  }
  [data-pdf-export-active] .overflow-hidden,
  [data-pdf-export-active] .overflow-auto,
  [data-pdf-export-active] .overflow-x-hidden,
  [data-pdf-export-active] .overflow-y-auto {
    overflow: visible !important;
  }
  [data-pdf-export-active] .sticky {
    position: static !important;
  }
  [data-pdf-export-active] button[aria-label^="Opciones de"] {
    display: none !important;
  }
`;

const MAX_CANVAS_DIM = 16384;

type StyleSnapshot = {
  el: HTMLElement;
  overflow: string;
  overflowX: string;
  overflowY: string;
  height: string;
  maxHeight: string;
};

function waitForLayout(ms: number): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.setTimeout(resolve, ms);
      });
    });
  });
}

/** Temporarily unclip Gantt scroll wrappers so html2canvas can see every expanded row. */
function unclipAncestors(roots: HTMLElement[], maxDepth = 4): () => void {
  const snapshots: StyleSnapshot[] = [];
  const seen = new Set<HTMLElement>();
  for (const root of roots) {
    let current: HTMLElement | null = root;
    let depth = 0;
    while (current && current !== document.body && depth < maxDepth) {
      if (!seen.has(current)) {
        seen.add(current);
        snapshots.push({
          el: current,
          overflow: current.style.overflow,
          overflowX: current.style.overflowX,
          overflowY: current.style.overflowY,
          height: current.style.height,
          maxHeight: current.style.maxHeight,
        });
        current.style.overflow = "visible";
        current.style.overflowX = "visible";
        current.style.overflowY = "visible";
        current.style.height = "auto";
        current.style.maxHeight = "none";
      }
      current = current.parentElement;
      depth += 1;
    }
  }
  return () => {
    for (const snap of snapshots) {
      snap.el.style.overflow = snap.overflow;
      snap.el.style.overflowX = snap.overflowX;
      snap.el.style.overflowY = snap.overflowY;
      snap.el.style.height = snap.height;
      snap.el.style.maxHeight = snap.maxHeight;
    }
  };
}

function captureScale(cssW: number, cssH: number): number {
  return Math.min(2, MAX_CANVAS_DIM / Math.max(cssW, 1), MAX_CANVAS_DIM / Math.max(cssH, 1));
}

function sliceCanvas(
  source: HTMLCanvasElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
): HTMLCanvasElement {
  const rx = Math.max(0, Math.round(sx));
  const ry = Math.max(0, Math.round(sy));
  const rw = Math.max(1, Math.min(Math.round(sw), source.width - rx));
  const rh = Math.max(1, Math.min(Math.round(sh), source.height - ry));
  const canvas = document.createElement("canvas");
  canvas.width = rw;
  canvas.height = rh;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.drawImage(source, rx, ry, rw, rh, 0, 0, rw, rh);
  }
  return canvas;
}

function headerCssHeight(el: HTMLElement): number {
  const header = el.firstElementChild as HTMLElement | null;
  return header?.offsetHeight || ROW_CSS_PX;
}

/** Inject temporary style overrides for PDF capture */
function injectPdfStyles(): void {
  const style = document.createElement("style");
  style.id = PDF_EXPORT_STYLE_ID;
  style.textContent = PDF_EXPORT_CSS;
  document.head.appendChild(style);
  document.body.setAttribute("data-pdf-export-active", "true");
}

/** Remove temporary style overrides */
function removePdfStyles(): void {
  document.getElementById(PDF_EXPORT_STYLE_ID)?.remove();
  document.body.removeAttribute("data-pdf-export-active");
}

/** Collect comments from partidas and their desglose (familias). */
function collectComments(programaData: ProgramaItem[]): ComentarioForPdf[] {
  const result: ComentarioForPdf[] = [];
  const walk = (item: ProgramaItem) => {
    if (item.comentarios && item.comentarios.length > 0) {
      for (const c of item.comentarios) {
        result.push({
          partidaNombre: item.partida,
          comentario: c.comentario,
          fechaInicio: c.fecha_inicio,
          fechaFin: c.fecha_fin,
          createdByName: c.created_by_name ?? undefined,
        });
      }
    }
    for (const child of item.children) walk(child);
  };
  for (const item of programaData) walk(item);
  return result;
}

/** Draw a page header */
function drawPageHeader(
  pdf: jsPDF,
  title: string,
  pageNum: number,
  totalPages: number,
): void {
  pdf.setFontSize(10);
  pdf.setTextColor(100);
  pdf.text(title, MARGIN_MM, MARGIN_MM + 5);
  pdf.setFontSize(7);
  pdf.text(
    `Página ${pageNum} de ${totalPages}  ·  ${new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" })}`,
    PAGE_W_MM - MARGIN_MM,
    MARGIN_MM + 5,
    { align: "right" },
  );
}

/** Render the comments section as additional PDF pages */
function renderCommentsPages(
  pdf: jsPDF,
  comments: ComentarioForPdf[],
  projectName: string,
  startPageNum: number,
  totalPages: number,
): void {
  if (comments.length === 0) return;

  // Group comments by partida
  const grouped = new Map<string, ComentarioForPdf[]>();
  for (const c of comments) {
    const list = grouped.get(c.partidaNombre) || [];
    list.push(c);
    grouped.set(c.partidaNombre, list);
  }

  let currentPage = startPageNum;
  let cursorY = 0;

  const startNewPage = () => {
    pdf.addPage();
    drawPageHeader(pdf, `Programa de Obra — ${projectName} — Comentarios`, currentPage, totalPages);
    currentPage++;
    cursorY = MARGIN_MM + HEADER_H_MM + 4;
  };

  // First comments page
  startNewPage();

  // Section title
  pdf.setFontSize(12);
  pdf.setTextColor(50);
  pdf.text("Comentarios", MARGIN_MM, cursorY);
  cursorY += 8;

  // Draw a line separator
  pdf.setDrawColor(200);
  pdf.setLineWidth(0.3);
  pdf.line(MARGIN_MM, cursorY, PAGE_W_MM - MARGIN_MM, cursorY);
  cursorY += 6;

  for (const [partidaNombre, partidaComments] of grouped) {
    // Check if we need a new page (need at least ~30mm for partida header + 1 comment)
    if (cursorY > PAGE_H_MM - MARGIN_MM - 30) {
      startNewPage();
    }

    // Partida name
    pdf.setFontSize(10);
    pdf.setTextColor(30);
    pdf.setFont("helvetica", "bold");
    pdf.text(partidaNombre, MARGIN_MM, cursorY);
    cursorY += 5;

    // Separator under partida name
    pdf.setDrawColor(220);
    pdf.setLineWidth(0.2);
    pdf.line(MARGIN_MM, cursorY, MARGIN_MM + 100, cursorY);
    cursorY += 4;

    for (const comment of partidaComments) {
      // Check page break
      if (cursorY > PAGE_H_MM - MARGIN_MM - 20) {
        startNewPage();
      }

      // Date range
      pdf.setFontSize(7);
      pdf.setTextColor(100);
      pdf.setFont("helvetica", "normal");
      pdf.text(`${comment.fechaInicio} → ${comment.fechaFin}`, MARGIN_MM + 4, cursorY);

      // Author (if available)
      if (comment.createdByName) {
        pdf.text(`  ·  ${comment.createdByName}`, MARGIN_MM + 60, cursorY);
      }
      cursorY += 4;

      // Comment text — wrap long lines
      pdf.setFontSize(8);
      pdf.setTextColor(50);
      const maxTextWidth = USABLE_W_MM - 8;
      const lines = pdf.splitTextToSize(comment.comentario, maxTextWidth);
      for (const line of lines) {
        if (cursorY > PAGE_H_MM - MARGIN_MM - 10) {
          startNewPage();
        }
        pdf.text(line, MARGIN_MM + 4, cursorY);
        cursorY += 3.5;
      }
      cursorY += 4;
    }

    cursorY += 4;
  }
}

/**
 * Export the Programa de Obra Gantt view as a multi-page landscape PDF.
 * Every partida is expanded so familias appear in the capture.
 * Left columns and Gantt headers repeat on every page; the timeline is sliced
 * horizontally and the rows are sliced vertically when the breakdown is tall.
 * Comments are rendered as separate pages at the end.
 */
export async function exportProgramaObraPdf({
  leftColumnsEl,
  timelineEl,
  projectName,
  expandAll,
  restoreView,
  programaData,
}: PdfExportOptions): Promise<void> {
  const previousView = expandAll();
  await waitForLayout(350);

  let restoreClip: (() => void) | null = null;

  try {
    injectPdfStyles();
    restoreClip = unclipAncestors([leftColumnsEl, timelineEl]);
    if (leftColumnsEl.parentElement) leftColumnsEl.parentElement.scrollTop = 0;
    if (timelineEl.parentElement) timelineEl.parentElement.scrollTop = 0;
    if (timelineEl.parentElement) timelineEl.parentElement.scrollLeft = 0;

    await waitForLayout(120);

    const leftCssW = Math.max(leftColumnsEl.scrollWidth, leftColumnsEl.offsetWidth);
    const leftCssH = Math.max(leftColumnsEl.scrollHeight, leftColumnsEl.offsetHeight);
    const tlCssW = Math.max(timelineEl.scrollWidth, timelineEl.offsetWidth);
    const tlCssH = Math.max(timelineEl.scrollHeight, timelineEl.offsetHeight);
    const scale = Math.min(captureScale(leftCssW, leftCssH), captureScale(tlCssW, tlCssH));

    const captureOpts = {
      scale,
      useCORS: true,
      backgroundColor: STATIC_NEUTRAL_COLORS.surface,
      logging: false as const,
      scrollX: 0,
      scrollY: 0,
    };

    const leftCanvas = await html2canvas(leftColumnsEl, {
      ...captureOpts,
      width: leftCssW,
      height: leftCssH,
      windowWidth: leftCssW,
      windowHeight: leftCssH,
    });

    const timelineCanvas = await html2canvas(timelineEl, {
      ...captureOpts,
      width: tlCssW,
      height: tlCssH,
      windowWidth: tlCssW + leftCssW + 100,
      windowHeight: tlCssH,
    });

    restoreClip();
    restoreClip = null;
    removePdfStyles();

    const leftImgW = leftCanvas.width;
    const tlImgW = timelineCanvas.width;
    const pagination = computeGanttPagination({
      canvasHeight: leftCanvas.height,
      elementHeight: leftCssH,
      headerCssH: headerCssHeight(leftColumnsEl),
      usableHMm: USABLE_H_MM,
    });
    const { scaleToFitH, headerCanvasH, bodyCanvasH, bodyCanvasPerPage, vPages, headerMmH } = pagination;

    const leftMmW = leftImgW * scaleToFitH;
    const sliceAvailMmW = USABLE_W_MM - leftMmW;
    const tlPixelsPerSlice = sliceAvailMmW / scaleToFitH;
    const hPages = Math.max(1, Math.ceil(tlImgW / tlPixelsPerSlice));
    const ganttPages = hPages * vPages;

    const comments = collectComments(programaData);
    const commentPages = comments.length > 0 ? Math.max(1, Math.ceil(comments.length / 8)) : 0;
    const totalPages = ganttPages + commentPages;

    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a3",
    });

    const contentY = MARGIN_MM + HEADER_H_MM;
    let pageNum = 0;

    for (let h = 0; h < hPages; h++) {
      const srcX = h * tlPixelsPerSlice;
      const srcW = Math.min(tlPixelsPerSlice, tlImgW - srcX);
      if (srcW <= 0) continue;

      for (let v = 0; v < vPages; v++) {
        pageNum += 1;
        if (pageNum > 1) pdf.addPage();
        drawPageHeader(pdf, `Programa de Obra — ${projectName}`, pageNum, totalPages);

        const bodySrcY = headerCanvasH + v * bodyCanvasPerPage;
        const bodySrcH = Math.max(0, Math.min(bodyCanvasPerPage, bodyCanvasH - v * bodyCanvasPerPage));
        const bodyMmH = bodySrcH * scaleToFitH;

        const leftHeader = sliceCanvas(leftCanvas, 0, 0, leftImgW, headerCanvasH);
        pdf.addImage(leftHeader.toDataURL("image/png"), "PNG", MARGIN_MM, contentY, leftMmW, headerMmH);
        if (bodySrcH > 0) {
          const leftBody = sliceCanvas(leftCanvas, 0, bodySrcY, leftImgW, bodySrcH);
          pdf.addImage(
            leftBody.toDataURL("image/png"),
            "PNG",
            MARGIN_MM,
            contentY + headerMmH,
            leftMmW,
            bodyMmH,
          );
        }

        const tlHeader = sliceCanvas(timelineCanvas, srcX, 0, srcW, headerCanvasH);
        pdf.addImage(
          tlHeader.toDataURL("image/png"),
          "PNG",
          MARGIN_MM + leftMmW,
          contentY,
          srcW * scaleToFitH,
          headerMmH,
        );
        if (bodySrcH > 0) {
          const tlBody = sliceCanvas(timelineCanvas, srcX, bodySrcY, srcW, bodySrcH);
          pdf.addImage(
            tlBody.toDataURL("image/png"),
            "PNG",
            MARGIN_MM + leftMmW,
            contentY + headerMmH,
            srcW * scaleToFitH,
            bodyMmH,
          );
        }
      }
    }

    if (comments.length > 0) {
      renderCommentsPages(pdf, comments, projectName, ganttPages + 1, totalPages);
    }

    pdf.save(`Programa de Obra - ${projectName}.pdf`);
  } finally {
    restoreClip?.();
    removePdfStyles();
    restoreView(previousView);
  }
}
