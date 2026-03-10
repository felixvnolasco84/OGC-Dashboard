import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import type { ProgramaItem } from "./programa-obra-types";

export interface ComentarioForPdf {
  partidaNombre: string;
  comentario: string;
  fechaInicio: string;
  fechaFin: string;
  createdByName?: string;
}

export interface PdfExportOptions {
  /** Ref to the fixed left-columns container (shrink-0 div) */
  leftColumnsEl: HTMLElement;
  /** Ref to the scrollable timeline container (flex-1 overflow-x-auto div) */
  timelineEl: HTMLElement;
  /** Project name for the PDF header & filename */
  projectName: string;
  /** Callback to collapse all expanded items before capture */
  collapseAll: () => Set<string>;
  /** Callback to restore previously expanded items after capture */
  restoreExpanded: (ids: Set<string>) => void;
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
  [data-pdf-export-active] .max-h-\\[44px\\] {
    max-height: none !important;
  }
  [data-pdf-export-active] .overflow-hidden {
    overflow: visible !important;
  }
`;

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

/** Collect all comments from programaData (level 0 items only) */
function collectComments(programaData: ProgramaItem[]): ComentarioForPdf[] {
  const result: ComentarioForPdf[] = [];
  for (const item of programaData) {
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
  }
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
 * Left columns are repeated on every page; the timeline is sliced horizontally.
 * Comments are rendered as separate pages at the end.
 */
export async function exportProgramaObraPdf({
  leftColumnsEl,
  timelineEl,
  projectName,
  collapseAll,
  restoreExpanded,
  programaData,
}: PdfExportOptions): Promise<void> {
  // 1. Collapse all expanded items, save previous state
  const previouslyExpanded = collapseAll();

  // Small delay to let React re-render
  await new Promise((r) => setTimeout(r, 300));

  try {
    // 2. Inject CSS overrides to prevent text clipping during capture
    injectPdfStyles();

    // 3. Temporarily remove overflow clipping on timeline so full width renders
    const prevOverflow = timelineEl.style.overflow;
    const prevOverflowX = timelineEl.style.overflowX;
    timelineEl.style.overflow = "visible";
    timelineEl.style.overflowX = "visible";

    // Small delay for style injection to take effect
    await new Promise((r) => setTimeout(r, 100));

    // 4. Capture left columns
    const leftCanvas = await html2canvas(leftColumnsEl, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });

    // 5. Capture full timeline
    const timelineCanvas = await html2canvas(timelineEl, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      width: timelineEl.scrollWidth,
      windowWidth: timelineEl.scrollWidth + leftColumnsEl.offsetWidth + 100,
    });

    // Restore overflow and remove CSS overrides
    timelineEl.style.overflow = prevOverflow;
    timelineEl.style.overflowX = prevOverflowX;
    removePdfStyles();

    // 6. Compute dimensions
    const leftImgW = leftCanvas.width;
    const leftImgH = leftCanvas.height;
    const tlImgW = timelineCanvas.width;
    const tlImgH = timelineCanvas.height;

    const totalPixelH = Math.max(leftImgH, tlImgH);

    // Scale so the row height fits in the usable height
    const scaleToFitH = USABLE_H_MM / totalPixelH;

    const leftMmW = leftImgW * scaleToFitH;
    const leftMmH = leftImgH * scaleToFitH;

    // Available width for each timeline slice
    const sliceAvailMmW = USABLE_W_MM - leftMmW;

    // How many timeline pixels fit per slice
    const tlPixelsPerSlice = sliceAvailMmW / scaleToFitH;

    // Number of Gantt pages
    const ganttPages = Math.max(1, Math.ceil(tlImgW / tlPixelsPerSlice));

    // Collect comments to estimate total page count
    const comments = collectComments(programaData);
    // Rough estimate: ~8 comments per page
    const commentPages = comments.length > 0 ? Math.max(1, Math.ceil(comments.length / 8)) : 0;
    const totalPages = ganttPages + commentPages;

    // 7. Create PDF
    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a3",
    });

    // Pre-generate left columns data URL once (avoid repeated toDataURL calls)
    const leftDataUrl = leftCanvas.toDataURL("image/png");

    for (let page = 0; page < ganttPages; page++) {
      if (page > 0) pdf.addPage();

      drawPageHeader(pdf, `Programa de Obra — ${projectName}`, page + 1, totalPages);

      const contentY = MARGIN_MM + HEADER_H_MM;

      // Draw left columns
      pdf.addImage(leftDataUrl, "PNG", MARGIN_MM, contentY, leftMmW, leftMmH);

      // Draw timeline slice
      const srcX = page * tlPixelsPerSlice;
      const srcW = Math.min(tlPixelsPerSlice, tlImgW - srcX);
      if (srcW <= 0) continue;

      // Create a temporary canvas for this slice
      const sliceCanvas = document.createElement("canvas");
      sliceCanvas.width = srcW;
      sliceCanvas.height = tlImgH;
      const ctx = sliceCanvas.getContext("2d");
      if (!ctx) continue;
      ctx.drawImage(timelineCanvas, srcX, 0, srcW, tlImgH, 0, 0, srcW, tlImgH);

      const sliceMmW = srcW * scaleToFitH;
      const sliceMmH = tlImgH * scaleToFitH;

      pdf.addImage(
        sliceCanvas.toDataURL("image/png"),
        "PNG",
        MARGIN_MM + leftMmW,
        contentY,
        sliceMmW,
        sliceMmH,
      );
    }

    // 8. Render comments pages
    if (comments.length > 0) {
      renderCommentsPages(pdf, comments, projectName, ganttPages + 1, totalPages);
    }

    // 9. Save
    pdf.save(`Programa de Obra - ${projectName}.pdf`);
  } finally {
    // 10. Cleanup: restore expanded items and remove any lingering overrides
    removePdfStyles();
    restoreExpanded(previouslyExpanded);
  }
}
