import { jsPDF } from "jspdf";
import type {
  ReportInsights,
  ReportSection,
  ReportSnapshotV1,
} from "./reportTypes";

const REPORT_SECTION_LABELS: Record<ReportSection, string> = {
  executive: "Resumen ejecutivo",
  financial: "Estado financiero",
  earned_value: "Valor ganado",
  cashflow: "Flujo y proyección",
  variances: "Variaciones",
  requisitions: "Requisiciones",
  program: "Programa de obra",
  logbook: "Bitácora",
  data_quality: "Calidad de datos",
};

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 16;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
type PdfColor = [number, number, number];

// Keep the PDF aligned with the visual language used by TareasPage.
const TASK_COLORS = {
  text: [17, 24, 39] as PdfColor,
  secondary: [137, 137, 130] as PdfColor,
  tertiary: [163, 163, 158] as PdfColor,
  border: [230, 230, 230] as PdfColor,
  controlBorder: [219, 219, 219] as PdfColor,
  itemBackground: [251, 251, 251] as PdfColor,
  hoverBackground: [241, 241, 241] as PdfColor,
  pending: [173, 173, 173] as PdfColor,
  blue: [118, 175, 217] as PdfColor,
  green: [80, 172, 102] as PdfColor,
  danger: [231, 95, 121] as PdfColor,
  white: [255, 255, 255] as PdfColor,
};

const currency = (value: number, code: string) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: code || "MXN",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);

const number = (value: number, digits = 1) =>
  new Intl.NumberFormat("es-MX", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(Number.isFinite(value) ? value : 0);

const metric = (value: number | null, digits = 2) =>
  value === null || !Number.isFinite(value) ? "N/D" : number(value, digits);

type PdfState = {
  doc: jsPDF;
  y: number;
};

function addPage(state: PdfState) {
  state.doc.addPage();
  state.y = 22;
}

function ensureSpace(state: PdfState, height: number) {
  if (state.y + height > PAGE_HEIGHT - 20) addPage(state);
}

function drawHeading(state: PdfState, title: string, subtitle?: string) {
  const topGap = state.y > 26 ? 4 : 0;
  const headingHeight = subtitle ? 19 : 13;
  // Keep a section title with at least the first card/table row that follows.
  ensureSpace(state, headingHeight + topGap + 30);
  state.y += topGap;
  state.doc.setFillColor(...TASK_COLORS.green);
  state.doc.rect(MARGIN, state.y - 3.2, 2.6, 2.6, "F");
  state.doc.setFont("helvetica", "bold");
  state.doc.setFontSize(14);
  state.doc.setTextColor(...TASK_COLORS.text);
  state.doc.text(title, MARGIN + 6, state.y);
  state.y += 6;
  if (subtitle) {
    state.doc.setFont("helvetica", "normal");
    state.doc.setFontSize(8.5);
    state.doc.setTextColor(...TASK_COLORS.secondary);
    state.doc.text(subtitle, MARGIN + 6, state.y);
    state.y += 6;
  }
  state.doc.setDrawColor(...TASK_COLORS.border);
  state.doc.setLineWidth(0.3);
  state.doc.line(MARGIN, state.y, PAGE_WIDTH - MARGIN, state.y);
  state.y += 6;
}

function drawParagraph(
  state: PdfState,
  text: string,
  options: { color?: [number, number, number]; size?: number } = {},
) {
  state.doc.setFont("helvetica", "normal");
  state.doc.setFontSize(options.size || 9.5);
  state.doc.setTextColor(...(options.color || TASK_COLORS.text));
  const lines = state.doc.splitTextToSize(text, CONTENT_WIDTH);
  ensureSpace(state, lines.length * 4.6 + 3);
  state.doc.text(lines, MARGIN, state.y);
  state.y += lines.length * 4.6 + 3;
}

function drawKpiGrid(
  state: PdfState,
  items: Array<{ label: string; value: string; note?: string }>,
) {
  const columns = 3;
  const gap = 4;
  const width = (CONTENT_WIDTH - gap * (columns - 1)) / columns;
  const height = 25;
  for (let index = 0; index < items.length; index += columns) {
    ensureSpace(state, height + 4);
    items.slice(index, index + columns).forEach((item, offset) => {
      const x = MARGIN + offset * (width + gap);
      state.doc.setFillColor(...TASK_COLORS.itemBackground);
      state.doc.setDrawColor(...TASK_COLORS.border);
      state.doc.setLineWidth(0.25);
      state.doc.roundedRect(x, state.y, width, height, 0.8, 0.8, "FD");
      state.doc.setFillColor(
        ...(index + offset === 0 ? TASK_COLORS.green : TASK_COLORS.pending),
      );
      state.doc.roundedRect(x + width - 6, state.y + 3, 3, 3, 0.4, 0.4, "F");
      state.doc.setFont("helvetica", "normal");
      state.doc.setFontSize(7.5);
      state.doc.setTextColor(...TASK_COLORS.secondary);
      state.doc.text(item.label, x + 3, state.y + 5);
      state.doc.setFont("helvetica", "bold");
      state.doc.setFontSize(11.5);
      state.doc.setTextColor(...TASK_COLORS.text);
      const valueLines = state.doc.splitTextToSize(item.value, width - 6).slice(0, 2);
      state.doc.text(valueLines, x + 3, state.y + 13);
      if (item.note) {
        state.doc.setFont("helvetica", "normal");
        state.doc.setFontSize(6.8);
        state.doc.setTextColor(...TASK_COLORS.secondary);
        state.doc.text(item.note, x + 3, state.y + 22);
      }
    });
    state.y += height + 4;
  }
}

function drawTable(
  state: PdfState,
  headers: string[],
  rows: string[][],
  widths: number[],
) {
  const rowHeight = 7;
  const drawHeader = () => {
    state.doc.setFillColor(...TASK_COLORS.itemBackground);
    state.doc.setDrawColor(...TASK_COLORS.border);
    state.doc.setLineWidth(0.25);
    state.doc.rect(MARGIN, state.y, CONTENT_WIDTH, rowHeight, "FD");
    state.doc.setFillColor(...TASK_COLORS.green);
    state.doc.rect(MARGIN, state.y, 1.4, rowHeight, "F");
    state.doc.setFont("helvetica", "bold");
    state.doc.setFontSize(7);
    state.doc.setTextColor(...TASK_COLORS.text);
    let x = MARGIN;
    headers.forEach((header, index) => {
      state.doc.text(header, x + (index === 0 ? 3 : 2), state.y + 4.6);
      x += widths[index];
    });
    state.y += rowHeight;
  };

  ensureSpace(state, rowHeight * 2);
  drawHeader();
  rows.forEach((row, rowIndex) => {
    if (state.y + rowHeight > PAGE_HEIGHT - 20) {
      addPage(state);
      drawHeader();
    }
    if (rowIndex % 2 === 0) {
      state.doc.setFillColor(...TASK_COLORS.itemBackground);
      state.doc.rect(MARGIN, state.y, CONTENT_WIDTH, rowHeight, "F");
    }
    state.doc.setDrawColor(...TASK_COLORS.border);
    state.doc.setLineWidth(0.15);
    state.doc.line(
      MARGIN,
      state.y + rowHeight,
      MARGIN + CONTENT_WIDTH,
      state.y + rowHeight,
    );
    state.doc.setFont("helvetica", "normal");
    state.doc.setFontSize(6.8);
    state.doc.setTextColor(...TASK_COLORS.text);
    let x = MARGIN;
    row.forEach((cell, index) => {
      const clipped = state.doc.splitTextToSize(cell, widths[index] - 4)[0] || "";
      state.doc.text(clipped, x + 2, state.y + 4.6);
      x += widths[index];
    });
    state.y += rowHeight;
  });
  state.y += 5;
}

function drawCashflowChart(state: PdfState, snapshot: ReportSnapshotV1) {
  const points = snapshot.projection.timeline;
  if (points.length < 2) {
    drawParagraph(state, "No hay suficientes puntos normalizados para dibujar la curva de gasto.");
    return;
  }
  ensureSpace(state, 62);
  const x = MARGIN + 5;
  const y = state.y + 3;
  const width = CONTENT_WIDTH - 10;
  const height = 48;
  const maxValue = Math.max(
    1,
    ...points.flatMap((point) => [
      point.actual_cumulative,
      point.projected_cumulative || 0,
    ]),
  );
  state.doc.setFillColor(...TASK_COLORS.itemBackground);
  state.doc.setDrawColor(...TASK_COLORS.border);
  state.doc.setLineWidth(0.25);
  state.doc.roundedRect(x, y, width, height, 0.8, 0.8, "FD");
  for (let grid = 1; grid < 4; grid += 1) {
    const gridY = y + (height / 4) * grid;
    state.doc.setDrawColor(...TASK_COLORS.border);
    state.doc.setLineWidth(0.15);
    state.doc.line(x, gridY, x + width, gridY);
  }
  const plot = (
    getter: (point: (typeof points)[number]) => number | null,
    color: [number, number, number],
  ) => {
    state.doc.setDrawColor(...color);
    state.doc.setLineWidth(0.7);
    let previous: { x: number; y: number } | null = null;
    points.forEach((point, index) => {
      const value = getter(point);
      if (value === null) return;
      const px = x + (index / Math.max(1, points.length - 1)) * width;
      const py = y + height - (value / maxValue) * height;
      if (previous) state.doc.line(previous.x, previous.y, px, py);
      previous = { x: px, y: py };
    });
  };
  plot((point) => point.actual_cumulative, TASK_COLORS.green);
  plot((point) => point.projected_cumulative, TASK_COLORS.blue);
  state.doc.setFontSize(7);
  state.doc.setTextColor(...TASK_COLORS.secondary);
  state.doc.text(`Inicio: ${points[0].date}`, x, y + height + 5);
  state.doc.text(
    `Corte: ${points[points.length - 1].date}`,
    x + width,
    y + height + 5,
    { align: "right" },
  );
  state.doc.setFillColor(...TASK_COLORS.green);
  state.doc.roundedRect(x, y - 4.3, 2.4, 2.4, 0.3, 0.3, "F");
  state.doc.setTextColor(...TASK_COLORS.text);
  state.doc.text("Real", x + 4, y - 2.2);
  state.doc.setFillColor(...TASK_COLORS.blue);
  state.doc.roundedRect(x + 18, y - 4.3, 2.4, 2.4, 0.3, 0.3, "F");
  state.doc.text("Proyectado", x + 22, y - 2.2);
  state.y += 61;
}

function drawInsights(state: PdfState, insights: ReportInsights) {
  drawParagraph(state, insights.executive_summary);
  if (insights.warning) {
    const warningLines = state.doc.splitTextToSize(
      insights.warning,
      CONTENT_WIDTH - 14,
    );
    const warningHeight = warningLines.length * 4 + 8;
    ensureSpace(state, warningHeight + 4);
    state.doc.setFillColor(...TASK_COLORS.itemBackground);
    state.doc.setDrawColor(...TASK_COLORS.border);
    state.doc.setLineWidth(0.25);
    state.doc.roundedRect(
      MARGIN,
      state.y,
      CONTENT_WIDTH,
      warningHeight,
      0.8,
      0.8,
      "FD",
    );
    state.doc.setFillColor(...TASK_COLORS.blue);
    state.doc.roundedRect(MARGIN + 4, state.y + 4, 3, 3, 0.4, 0.4, "F");
    state.doc.setFontSize(8);
    state.doc.setTextColor(...TASK_COLORS.text);
    state.doc.text(warningLines, MARGIN + 10, state.y + 6);
    state.y += warningHeight + 5;
  }
  if (!insights.insights.length) {
    drawParagraph(state, "No se detectaron alertas respaldadas por las métricas disponibles.");
    return;
  }
  for (const insight of insights.insights) {
    const evidence = insight.evidence
      .map((item) => `${item.metric_key}: ${String(item.observed_value)}`)
      .join(" · ");
    const statementLines = state.doc
      .splitTextToSize(insight.statement, CONTENT_WIDTH - 14)
      .slice(0, 2);
    const evidenceLines = state.doc
      .splitTextToSize(`Evidencia: ${evidence}`, CONTENT_WIDTH - 14)
      .slice(0, 2);
    const actionLines = state.doc
      .splitTextToSize(
        `Acción: ${insight.recommended_action}`,
        CONTENT_WIDTH - 14,
      )
      .slice(0, 2);
    const height =
      13
      + statementLines.length * 3.6
      + evidenceLines.length * 3.2
      + actionLines.length * 3.2;
    ensureSpace(state, height + 3);
    const tone: PdfColor =
      insight.severity === "critical" || insight.severity === "high"
        ? TASK_COLORS.danger
        : insight.severity === "medium"
          ? TASK_COLORS.blue
          : insight.severity === "low"
            ? TASK_COLORS.pending
            : TASK_COLORS.green;
    state.doc.setFillColor(...TASK_COLORS.itemBackground);
    state.doc.setDrawColor(...TASK_COLORS.border);
    state.doc.setLineWidth(0.25);
    state.doc.roundedRect(
      MARGIN,
      state.y,
      CONTENT_WIDTH,
      height,
      0.8,
      0.8,
      "FD",
    );
    state.doc.setFillColor(...tone);
    state.doc.rect(MARGIN, state.y, 1.5, height, "F");
    state.doc.roundedRect(MARGIN + 4, state.y + 3.5, 3, 3, 0.4, 0.4, "F");
    state.doc.setFont("helvetica", "bold");
    state.doc.setFontSize(9);
    state.doc.setTextColor(...TASK_COLORS.text);
    state.doc.text(insight.title, MARGIN + 10, state.y + 6);
    state.doc.setFont("helvetica", "normal");
    state.doc.setFontSize(6.5);
    state.doc.setTextColor(...TASK_COLORS.secondary);
    state.doc.text(
      insight.severity.toUpperCase(),
      MARGIN + CONTENT_WIDTH - 4,
      state.y + 5.5,
      { align: "right" },
    );
    state.doc.setFont("helvetica", "normal");
    state.doc.setFontSize(7.2);
    state.doc.setTextColor(...TASK_COLORS.text);
    const statementY = state.y + 11;
    state.doc.text(statementLines, MARGIN + 4, statementY);
    const evidenceY = statementY + statementLines.length * 3.6 + 1.2;
    state.doc.setTextColor(...TASK_COLORS.secondary);
    state.doc.text(evidenceLines, MARGIN + 4, evidenceY);
    const actionY = evidenceY + evidenceLines.length * 3.2 + 1.2;
    state.doc.text(actionLines, MARGIN + 4, actionY);
    state.y += height + 4;
  }
}

function selected(sections: ReportSection[], section: ReportSection) {
  return sections.includes(section);
}

export function renderReportPdf(
  snapshot: ReportSnapshotV1,
  insights: ReportInsights,
  sections: ReportSection[],
) {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const state: PdfState = { doc, y: 20 };
  const code = snapshot.project.currency;

  doc.setFillColor(...TASK_COLORS.white);
  doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...TASK_COLORS.secondary);
  doc.text("Proyecto", MARGIN, 22);
  doc.setFontSize(28);
  doc.setTextColor(...TASK_COLORS.text);
  doc.text("Reporte financiero", MARGIN, 39);
  doc.setFontSize(14);
  doc.text(
    doc.splitTextToSize(snapshot.project.name, CONTENT_WIDTH - 58),
    MARGIN,
    52,
  );
  doc.setFontSize(8.5);
  doc.setTextColor(...TASK_COLORS.secondary);
  doc.text("OGC - CONTROL DE OBRA", MARGIN, 68);
  doc.setFontSize(10);
  doc.setTextColor(...TASK_COLORS.text);
  doc.text(
    `Periodo: ${snapshot.period.start} a ${snapshot.period.end}`,
    MARGIN,
    77,
  );
  const badgeWidth = 48;
  const badgeX = PAGE_WIDTH - MARGIN - badgeWidth;
  doc.setFillColor(...TASK_COLORS.white);
  doc.setDrawColor(...TASK_COLORS.controlBorder);
  doc.setLineWidth(0.3);
  doc.roundedRect(badgeX, 18, badgeWidth, 14, 0.8, 0.8, "FD");
  doc.setFillColor(...TASK_COLORS.green);
  doc.roundedRect(badgeX + 4, 23.5, 3, 3, 0.4, 0.4, "F");
  doc.setFontSize(8);
  doc.setTextColor(...TASK_COLORS.secondary);
  doc.text("Reporte automatizado", badgeX + 10, 26);
  doc.setDrawColor(...TASK_COLORS.border);
  doc.line(0, 86, PAGE_WIDTH, 86);
  state.y = 102;
  drawParagraph(
    state,
    "Documento automatizado. Las cifras provienen de cálculos deterministas; los comentarios de IA se validan contra las métricas del snapshot.",
    { color: TASK_COLORS.secondary },
  );
  drawKpiGrid(state, [
    {
      label: "Gasto acumulado",
      value: currency(snapshot.financial.accumulated_cost, code),
    },
    {
      label: "Avance físico",
      value: `${number(snapshot.program.physical_progress_percent)}%`,
    },
    {
      label: "Calidad de datos",
      value: `${number(snapshot.data_quality.score, 0)}/100`,
    },
  ]);
  drawHeading(state, "Contenido autorizado");
  drawParagraph(
    state,
    sections.map((section) => REPORT_SECTION_LABELS[section]).join(" · "),
    { color: TASK_COLORS.secondary, size: 8.5 },
  );

  if (selected(sections, "executive")) {
    addPage(state);
    drawHeading(state, "Resumen ejecutivo", "Alertas deterministas e insights validados");
    drawInsights(state, insights);
  }

  if (selected(sections, "financial")) {
    drawHeading(state, "Estado financiero");
    drawKpiGrid(state, [
      { label: "Presupuesto original", value: currency(snapshot.financial.original_budget, code) },
      { label: "Presupuesto aprobado", value: currency(snapshot.financial.approved_budget, code) },
      { label: "Gasto del periodo", value: currency(snapshot.financial.period_cost, code) },
      { label: "Saldo", value: currency(snapshot.financial.balance, code) },
      { label: "Ejercido", value: `${number(snapshot.financial.exercised_percent)}%` },
      { label: "Flujo neto del periodo", value: currency(snapshot.financial.period_net_cashflow, code) },
      { label: "Ingresos acumulados", value: currency(snapshot.financial.accumulated_income, code) },
      { label: "Pagos pendientes", value: currency(snapshot.financial.pending_payments, code) },
      { label: "Compromisos aprobados", value: currency(snapshot.financial.approved_commitments, code) },
    ]);
  }

  if (selected(sections, "earned_value")) {
    drawHeading(state, "Valor ganado", "Indicadores calculados con el presupuesto aprobado");
    drawKpiGrid(state, [
      { label: "PV", value: currency(snapshot.earned_value.pv, code), note: "Valor planeado" },
      { label: "EV", value: currency(snapshot.earned_value.ev, code), note: "Valor ganado" },
      { label: "AC", value: currency(snapshot.earned_value.ac, code), note: "Costo real" },
      { label: "CPI", value: metric(snapshot.earned_value.cpi), note: "EV / AC" },
      { label: "SPI", value: metric(snapshot.earned_value.spi), note: "EV / PV" },
      { label: "EAC", value: snapshot.earned_value.eac === null ? "N/D" : currency(snapshot.earned_value.eac, code) },
      { label: "ETC", value: snapshot.earned_value.etc === null ? "N/D" : currency(snapshot.earned_value.etc, code) },
      {
        label: "Variación al cierre",
        value: snapshot.earned_value.variance_at_completion === null
          ? "N/D"
          : currency(snapshot.earned_value.variance_at_completion, code),
      },
      {
        label: "Físico / planeado",
        value: `${number(snapshot.earned_value.physical_progress_percent)}% / ${number(snapshot.earned_value.planned_progress_percent)}%`,
      },
    ]);
  }

  if (selected(sections, "cashflow")) {
    drawHeading(state, "Curva de gasto real contra proyección");
    drawCashflowChart(state, snapshot);
    drawKpiGrid(state, [
      {
        label: "Proyectado al corte",
        value: snapshot.projection.projected_to_date === null
          ? "N/D"
          : currency(snapshot.projection.projected_to_date, code),
      },
      {
        label: "Desviación",
        value: snapshot.projection.actual_vs_projection === null
          ? "N/D"
          : currency(snapshot.projection.actual_vs_projection, code),
      },
      {
        label: "Desviación porcentual",
        value: snapshot.projection.actual_vs_projection_percent === null
          ? "N/D"
          : `${number(snapshot.projection.actual_vs_projection_percent)}%`,
      },
    ]);
  }

  if (selected(sections, "variances")) {
    drawHeading(state, "Partidas con mayor desviación");
    drawTable(
      state,
      ["Partida", "Aprobado", "Costo", "Saldo", "Ejercido"],
      snapshot.variances.map((row) => [
        row.name,
        currency(row.approved_budget, code),
        currency(row.actual_cost, code),
        currency(row.variance, code),
        `${number(row.exercised_percent)}%`,
      ]),
      [64, 31, 31, 31, 21],
    );
    drawParagraph(
      state,
      `Las cinco partidas de mayor gasto concentran ${number(snapshot.concentration.top_five_share_percent)}% del gasto acumulado.`,
    );
  }

  if (selected(sections, "requisitions")) {
    drawHeading(state, "Requisiciones");
    drawKpiGrid(state, [
      { label: "Total", value: String(snapshot.requisitions.total) },
      { label: "Por revisar", value: String(snapshot.requisitions.pending_review) },
      { label: "Por pagar", value: String(snapshot.requisitions.pending_payment) },
      { label: "Por entregar", value: String(snapshot.requisitions.pending_delivery) },
      { label: "Entregas vencidas", value: String(snapshot.requisitions.overdue_deliveries) },
      { label: "Monto comprometido", value: currency(snapshot.requisitions.approved_commitments, code) },
    ]);
  }

  if (selected(sections, "program")) {
    drawHeading(state, "Programa de obra");
    drawKpiGrid(state, [
      { label: "Actividades", value: String(snapshot.program.scheduled_activities) },
      { label: "Atrasadas", value: String(snapshot.program.delayed_activities) },
      { label: "Avance físico", value: `${number(snapshot.program.physical_progress_percent)}%` },
      { label: "Avance planeado", value: `${number(snapshot.program.planned_progress_percent)}%` },
    ]);
  }

  if (selected(sections, "logbook")) {
    if (selected(sections, "data_quality")) {
      // Keep the two narrative sections together when both are requested.
      ensureSpace(state, 145);
    }
    drawHeading(state, "Bitácora");
    drawKpiGrid(state, [
      { label: "Entradas del periodo", value: String(snapshot.logbook.entries_in_period) },
      { label: "Incidencias", value: String(snapshot.logbook.incidents_in_period) },
    ]);
    snapshot.logbook.incident_summaries.forEach((summary) => {
      drawParagraph(state, `- ${summary}`, { size: 8.5 });
    });
  }

  if (selected(sections, "data_quality")) {
    drawHeading(state, "Calidad de datos y metodología");
    if (!snapshot.data_quality.issues.length) {
      drawParagraph(state, "No se detectaron incidencias automáticas de calidad de datos.");
    } else {
      drawTable(
        state,
        ["Indicador", "Registros", "Detalle"],
        snapshot.data_quality.issues.map((issue) => [
          issue.code,
          String(issue.count),
          issue.message,
        ]),
        [42, 25, 111],
      );
    }
    snapshot.methodology.forEach((note) => drawParagraph(state, `- ${note}`, { size: 8.2 }));
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    if (page > 1) {
      doc.setFillColor(...TASK_COLORS.green);
      doc.roundedRect(MARGIN, 10.5, 2.5, 2.5, 0.3, 0.3, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...TASK_COLORS.secondary);
      doc.text("REPORTE FINANCIERO", MARGIN + 5, 12.7);
      doc.setDrawColor(...TASK_COLORS.border);
      doc.setLineWidth(0.25);
      doc.line(MARGIN, 16, PAGE_WIDTH - MARGIN, 16);
    }
    doc.setDrawColor(...TASK_COLORS.border);
    doc.setLineWidth(0.25);
    doc.line(MARGIN, PAGE_HEIGHT - 14, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...TASK_COLORS.secondary);
    doc.text(
      `${snapshot.project.name} - ${snapshot.period.start} a ${snapshot.period.end}`,
      MARGIN,
      PAGE_HEIGHT - 9,
    );
    doc.setFillColor(...TASK_COLORS.green);
    doc.roundedRect(
      PAGE_WIDTH - MARGIN - 24,
      PAGE_HEIGHT - 11.4,
      2.5,
      2.5,
      0.3,
      0.3,
      "F",
    );
    doc.text(`Página ${page} de ${pageCount}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 9, {
      align: "right",
    });
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
