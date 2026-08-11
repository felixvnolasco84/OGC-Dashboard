import { jsPDF } from "jspdf";
import type {
  ReportInsights,
  ReportLogbookPhoto,
  ReportLogbookSection,
  ReportProgramActivity,
  ReportSection,
  ReportSnapshotV1,
} from "./reportTypes";

type PdfColor = [number, number, number];
type ImageAsset = { data: Uint8Array | string; format: "JPEG" | "PNG" };

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 13;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// Palette shared with TareasPage.
const COLORS = {
  text: [61, 61, 58] as PdfColor,
  secondary: [137, 137, 130] as PdfColor,
  tertiary: [165, 165, 160] as PdfColor,
  border: [230, 230, 230] as PdfColor,
  background: [251, 251, 251] as PdfColor,
  hover: [245, 245, 243] as PdfColor,
  pending: [173, 173, 173] as PdfColor,
  blue: [118, 175, 217] as PdfColor,
  green: [80, 172, 102] as PdfColor,
  greenDark: [37, 106, 52] as PdfColor,
  greenPale: [232, 246, 235] as PdfColor,
  danger: [128, 36, 36] as PdfColor,
  dangerPale: [248, 241, 241] as PdfColor,
  white: [255, 255, 255] as PdfColor,
};

const currency = (value: number, code: string) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: code || "MXN",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);

const compactCurrency = (value: number, code: string) => {
  const safe = Number.isFinite(value) ? value : 0;
  const absolute = Math.abs(safe);
  if (absolute >= 1_000_000) return `${safe < 0 ? "-" : ""}$${(absolute / 1_000_000).toFixed(1)}M`;
  if (absolute >= 1_000) return `${safe < 0 ? "-" : ""}$${(absolute / 1_000).toFixed(0)}K`;
  return currency(safe, code);
};

const number = (value: number, digits = 1) =>
  new Intl.NumberFormat("es-MX", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(Number.isFinite(value) ? value : 0);

const metric = (value: number | null, digits = 2) =>
  value === null || !Number.isFinite(value) ? "N/D" : number(value, digits);

const formatDate = (iso: string) => {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date).replace(/\./g, "");
};

const formatChartDate = (iso: string) => {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(date).replace(/\./g, "");
};

const niceAxisMax = (value: number) => {
  const safe = Math.max(1, value);
  const roughStep = safe / 3;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const niceStep = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return niceStep * magnitude * 3;
};

const axisCurrency = (value: number) => {
  if (value >= 1_000_000) return `$${number(value / 1_000_000, value % 1_000_000 === 0 ? 0 : 1)}M`;
  return `$${number(value / 1_000, 0)}K`;
};

const selected = (sections: ReportSection[], section: ReportSection) =>
  sections.includes(section);

const toneForMetric = (value: number | null, inverse = false): PdfColor => {
  if (value === null || !Number.isFinite(value)) return COLORS.text;
  const unfavorable = inverse ? value > 0 : value < 1;
  return unfavorable ? COLORS.danger : COLORS.greenDark;
};

function newPage(doc: jsPDF, title?: string) {
  doc.addPage();
  doc.setFillColor(...COLORS.white);
  doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, "F");
  if (!title) return;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...COLORS.secondary);
  doc.text(title.toUpperCase(), MARGIN, 13);
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.25);
  doc.line(MARGIN, 17, PAGE_WIDTH - MARGIN, 17);
}

function sectionTitle(doc: jsPDF, title: string, y: number, subtitle?: string) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(...COLORS.text);
  doc.text(title.toUpperCase(), MARGIN, y);
  if (subtitle) {
    doc.setFontSize(7.2);
    doc.setTextColor(...COLORS.secondary);
    doc.text(subtitle, PAGE_WIDTH - MARGIN, y, { align: "right" });
  }
}

function roundedCard(doc: jsPDF, x: number, y: number, width: number, height: number) {
  doc.setFillColor(...COLORS.background);
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.25);
  doc.roundedRect(x, y, width, height, 0.8, 0.8, "FD");
}

function drawMetricStrip(
  doc: jsPDF,
  y: number,
  items: Array<{ label: string; value: string; tone?: PdfColor }>,
  options: { height?: number; gap?: number } = {},
) {
  const gap = options.gap ?? 2.4;
  const height = options.height ?? 25;
  const width = (CONTENT_WIDTH - gap * (items.length - 1)) / items.length;
  items.forEach((item, index) => {
    const x = MARGIN + index * (width + gap);
    roundedCard(doc, x, y, width, height);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...COLORS.secondary);
    doc.text(item.label, x + 5, y + 7.2);
    doc.setFontSize(15.5);
    doc.setTextColor(...(item.tone || COLORS.text));
    doc.text(doc.splitTextToSize(item.value, width - 10)[0] || "", x + 5, y + 18.5);
  });
}

function drawSummary(doc: jsPDF, y: number, summary: string, warning?: string) {
  const lines = doc.splitTextToSize(summary || "Sin resumen disponible.", CONTENT_WIDTH - 12).slice(0, 4);
  const height = Math.max(29, 13 + lines.length * 4);
  roundedCard(doc, MARGIN, y, CONTENT_WIDTH, height);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...COLORS.secondary);
  doc.text(lines, MARGIN + 5, y + 10);
  if (warning) {
    doc.setFillColor(...COLORS.blue);
    doc.roundedRect(PAGE_WIDTH - MARGIN - 5, y + 4, 2.4, 2.4, 0.3, 0.3, "F");
  }
  return height;
}

function monthStart(iso: string) {
  const [year, month] = iso.split("-").map(Number);
  return Date.UTC(year, month - 1, 1);
}

function monthLabel(timestamp: number) {
  return new Intl.DateTimeFormat("es-MX", { month: "long", timeZone: "UTC" })
    .format(new Date(timestamp));
}

function drawGantt(
  doc: jsPDF,
  activities: ReportProgramActivity[],
  y: number,
  height: number,
  periodEnd: string,
  rangeActivities: ReportProgramActivity[] = activities,
) {
  const x = MARGIN;
  const width = CONTENT_WIDTH;
  roundedCard(doc, x, y, width, height);
  const valid = activities.filter((activity) => activity.start && activity.end);
  if (!valid.length) {
    doc.setFontSize(8.5);
    doc.setTextColor(...COLORS.secondary);
    doc.text("No hay actividades con fechas válidas para mostrar.", x + 6, y + height / 2);
    return;
  }
  const rangeValid = rangeActivities.filter((activity) => activity.start && activity.end);
  const rawMinTime = Math.min(...rangeValid.map((activity) => Date.parse(`${activity.start}T00:00:00Z`)));
  const rawMaxTime = Math.max(...rangeValid.flatMap((activity) => [activity.end, activity.extension_end]
    .filter((date): date is string => Boolean(date))
    .map((date) => Date.parse(`${date}T00:00:00Z`))));
  const minTime = monthStart(new Date(rawMinTime).toISOString().slice(0, 10));
  const rawMaxDate = new Date(rawMaxTime);
  const maxTime = Date.UTC(rawMaxDate.getUTCFullYear(), rawMaxDate.getUTCMonth() + 1, 1);
  const span = Math.max(86_400_000, maxTime - minTime);
  const chartX = x;
  const chartWidth = width;
  const headerHeight = 13.5;
  const rowHeight = (height - headerHeight) / activities.length;
  const dateToX = (date: string | number) => {
    const timestamp = typeof date === "number" ? date : Date.parse(`${date}T00:00:00Z`);
    return chartX + Math.max(0, Math.min(1, (timestamp - minTime) / span)) * chartWidth;
  };

  doc.setFillColor(...COLORS.white);
  doc.rect(x, y, width, headerHeight, "F");

  const parents = rangeValid.filter((activity) => activity.level === 1);
  const scheduleStart = Math.min(...rangeValid.map((activity) => Date.parse(`${activity.start}T00:00:00Z`)));
  const scheduleEnd = Math.max(...rangeValid.map((activity) => Date.parse(`${activity.end}T00:00:00Z`)));
  const masterX = dateToX(scheduleStart);
  const masterWidth = Math.max(1, dateToX(scheduleEnd) - masterX);
  const actualAverage = parents.length
    ? parents.reduce((sum, activity) => sum + activity.actual_progress_percent, 0) / parents.length
    : 0;
  const financialAverage = parents.length
    ? parents.reduce((sum, activity) => sum + (activity.financial_progress_percent ?? 0), 0) / parents.length
    : 0;
  doc.setFillColor(190, 227, 207);
  doc.rect(masterX, y + 0.8, masterWidth, 1.1, "F");
  doc.setFillColor(...COLORS.green);
  doc.rect(masterX, y + 0.8, masterWidth * Math.min(1, financialAverage / 100), 1.1, "F");
  doc.setFillColor(...COLORS.greenDark);
  doc.rect(masterX, y + 0.8, masterWidth * Math.min(1, actualAverage / 100), 1.1, "F");

  const firstYear = new Date(minTime).getUTCFullYear();
  const lastYear = new Date(maxTime - 1).getUTCFullYear();
  for (let year = firstYear; year <= lastYear; year += 1) {
    const yearStart = Math.max(minTime, Date.UTC(year, 0, 1));
    const yearEnd = Math.min(maxTime, Date.UTC(year + 1, 0, 1));
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.8);
    doc.setTextColor(...COLORS.secondary);
    doc.text(String(year), (dateToX(yearStart) + dateToX(yearEnd)) / 2, y + 4, { align: "center" });
  }

  let month = monthStart(new Date(minTime).toISOString().slice(0, 10));
  while (month < maxTime) {
    const next = Date.UTC(new Date(month).getUTCFullYear(), new Date(month).getUTCMonth() + 1, 1);
    const monthX = dateToX(month);
    const nextX = dateToX(Math.min(next, maxTime));
    doc.setDrawColor(210, 209, 206);
    doc.setLineWidth(0.2);
    doc.rect(monthX, y + 4.8, Math.max(0.1, nextX - monthX), headerHeight - 4.8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.1);
    doc.setTextColor(...COLORS.secondary);
    const label = monthLabel(month);
    doc.text(label.charAt(0).toUpperCase() + label.slice(1), (monthX + nextX) / 2, y + 9.3, { align: "center" });
    for (let week = month + 7 * 86_400_000; week < next; week += 7 * 86_400_000) {
      const weekX = dateToX(week);
      doc.setDrawColor(236, 236, 234);
      doc.setLineDashPattern([0.7, 0.8], 0);
      doc.setLineWidth(0.12);
      doc.line(weekX, y + headerHeight, weekX, y + height);
    }
    month = next;
  }
  doc.setLineDashPattern([], 0);
  doc.setDrawColor(210, 209, 206);
  doc.line(x, y + headerHeight, x + width, y + headerHeight);

  activities.forEach((activity, index) => {
    const rowY = y + headerHeight + index * rowHeight;
    if (!activity.start || !activity.end) return;
    const start = Date.parse(`${activity.start}T00:00:00Z`);
    const end = Date.parse(`${activity.end}T00:00:00Z`);
    const barX = dateToX(start);
    const barWidth = Math.max(1.2, dateToX(end) - barX);

    if (activity.level === 1) {
      doc.setFillColor(241, 241, 241);
      doc.rect(barX, rowY, barWidth, rowHeight, "F");
      doc.setFillColor(186, 202, 187);
      doc.rect(barX, rowY + 0.4, barWidth, 0.85, "F");
      doc.setFillColor(...COLORS.greenDark);
      doc.rect(barX, rowY + 0.4, barWidth * Math.min(1, activity.actual_progress_percent / 100), 0.85, "F");
      doc.setFillColor(190, 227, 207);
      doc.rect(barX, rowY + 1.25, barWidth, 0.85, "F");
      doc.setFillColor(...COLORS.green);
      doc.rect(barX, rowY + 1.25, barWidth * Math.min(1, (activity.financial_progress_percent ?? 0) / 100), 0.85, "F");

      if (activity.extension_end && Date.parse(`${activity.extension_end}T00:00:00Z`) > end) {
        const extensionX = dateToX(activity.extension_end);
        doc.setFillColor(194, 139, 139);
        doc.rect(dateToX(end), rowY + 0.4, Math.max(0.8, extensionX - dateToX(end)), 1.7, "F");
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(5.7);
      doc.setTextColor(...COLORS.text);
      doc.text(doc.splitTextToSize(activity.name, Math.max(8, barWidth - 2))[0] || "", barX + 1.4, rowY + rowHeight * 0.72);

      const milestone = activity.milestones?.find((item) => item.date >= activity.start! && item.date <= activity.end!);
      if (milestone) {
        const milestoneX = dateToX(milestone.date);
        const badgeWidth = milestone.type === "advance" ? 13 : 15;
        const badgeX = Math.max(x + 0.8, Math.min(x + width - badgeWidth - 0.8, milestoneX - badgeWidth / 2));
        doc.setFillColor(...(milestone.type === "advance" ? [175, 174, 162] as PdfColor : [196, 107, 52] as PdfColor));
        doc.roundedRect(badgeX, rowY + rowHeight * 0.37, badgeWidth, 3.6, 0.45, 0.45, "F");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(4.8);
        doc.setTextColor(...COLORS.white);
        const milestoneLabel = milestone.type === "advance" ? "Anticipo" : milestone.type === "supply" ? "Suministro" : "Finiquito";
        doc.text(milestoneLabel, badgeX + 1.3, rowY + rowHeight * 0.37 + 2.45);
        if (milestone.type === "advance") {
          doc.setDrawColor(...COLORS.white);
          doc.setLineWidth(0.25);
          doc.line(badgeX + badgeWidth - 2.4, rowY + rowHeight * 0.37 + 1.9, badgeX + badgeWidth - 1.7, rowY + rowHeight * 0.37 + 2.5);
          doc.line(badgeX + badgeWidth - 1.7, rowY + rowHeight * 0.37 + 2.5, badgeX + badgeWidth - 0.8, rowY + rowHeight * 0.37 + 1.2);
        }
        if (milestone.percentage !== null && milestone.percentage !== undefined) {
          doc.setFontSize(4.5);
          doc.setTextColor(...COLORS.secondary);
          doc.text(`${number(milestone.percentage, 0)}%`, badgeX + badgeWidth / 2, rowY + rowHeight - 0.4, { align: "center" });
        }
      }
    } else {
      const parentStart = activity.parent_start ? dateToX(activity.parent_start) : barX;
      const parentEnd = activity.parent_end ? dateToX(activity.parent_end) : barX + barWidth;
      if (activity.level === 2) {
        doc.setFillColor(247, 247, 246);
        doc.rect(parentStart, rowY, Math.max(1, parentEnd - parentStart), rowHeight, "F");
        doc.setFillColor(212, 212, 207);
        doc.rect(parentStart, rowY, 0.6, rowHeight, "F");
      }
      const lineColor = activity.level === 2 ? [158, 185, 161] as PdfColor : [204, 204, 199] as PdfColor;
      const progressColor = activity.level === 2 ? [65, 120, 71] as PdfColor : [137, 137, 130] as PdfColor;
      doc.setFillColor(...lineColor);
      doc.rect(barX, rowY + 0.5, barWidth, 0.65, "F");
      doc.setFillColor(...progressColor);
      doc.rect(barX, rowY + 0.5, barWidth * Math.min(1, activity.actual_progress_percent / 100), 0.65, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(5.2);
      doc.setTextColor(...COLORS.secondary);
      doc.text(doc.splitTextToSize(activity.name, Math.max(8, barWidth - 2))[0] || "", barX + 1.4, rowY + rowHeight * 0.72);
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.2);
    doc.setTextColor(...COLORS.secondary);
    doc.text(`${number(activity.actual_progress_percent, 0)}%`, Math.min(chartX + chartWidth - 1, barX + barWidth + 1.4), rowY + 1.35);
    doc.setDrawColor(210, 209, 206);
    doc.setLineWidth(0.12);
    doc.line(x, rowY + rowHeight, x + width, rowY + rowHeight);
  });

  const cutTime = Date.parse(`${periodEnd}T00:00:00Z`);
  if (cutTime >= minTime && cutTime <= maxTime) {
    const cutX = dateToX(cutTime);
    doc.setDrawColor(...COLORS.danger);
    doc.setLineDashPattern([1.2, 1.2], 0);
    doc.setLineWidth(0.35);
    doc.line(cutX, y + headerHeight, cutX, y + height);
    doc.setLineDashPattern([], 0);
  }
}

function drawLineChartCard(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  title: string,
  totalLabel: string,
  total: string,
  points: Array<{ date: string; value: number }>,
  axisType: "currency" | "number" = "currency",
) {
  doc.setFillColor(252, 252, 252);
  doc.setDrawColor(228, 226, 220);
  doc.setLineWidth(0.25);
  doc.roundedRect(x, y, width, height, 0.8, 0.8, "FD");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(...COLORS.text);
  doc.text(title, x + 6, y + 11);
  doc.setFontSize(7.5);
  doc.setTextColor(...COLORS.secondary);
  doc.text(totalLabel, x + 6, y + 21);
  doc.setFontSize(17);
  doc.setTextColor(...COLORS.text);
  doc.text(total, x + 6, y + 31);

  const chartX = x + 18;
  const chartY = y + 44;
  const chartWidth = width - 28;
  const chartHeight = height - 59;
  const maxValue = niceAxisMax(Math.max(1, ...points.map((point) => point.value)));
  for (let index = 0; index <= 3; index += 1) {
    const gridY = chartY + chartHeight * index / 3;
    const gridValue = maxValue * (1 - index / 3);
    doc.setDrawColor(234, 234, 234);
    doc.setLineDashPattern([1.5, 2], 0);
    doc.setLineWidth(0.16);
    doc.line(chartX, gridY, chartX + chartWidth, gridY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.7);
    doc.setTextColor(119, 119, 112);
    doc.text(axisType === "currency" ? axisCurrency(gridValue) : number(gridValue, 0), chartX - 2, gridY + 1.5, { align: "right" });
  }
  doc.setLineDashPattern([], 0);
  if (points.length === 0) {
    doc.setFontSize(8.2);
    doc.setTextColor(...COLORS.text);
    doc.text("Sin datos para mostrar", chartX + chartWidth / 2, chartY + chartHeight / 2 - 1, { align: "center" });
    doc.setFontSize(6.4);
    doc.setTextColor(...COLORS.secondary);
    doc.text("Ajusta los filtros para ver informacion.", chartX + chartWidth / 2, chartY + chartHeight / 2 + 4, { align: "center" });
    return;
  }
  if (points.length === 1) {
    const pointX = chartX + chartWidth / 2;
    const pointY = chartY + chartHeight - points[0].value / maxValue * chartHeight;
    doc.setFillColor(...COLORS.greenDark);
    doc.circle(pointX, pointY, 1.15, "F");
    doc.setFontSize(6.2);
    doc.setTextColor(...COLORS.secondary);
    doc.text(formatChartDate(points[0].date), pointX, y + height - 5, { align: "center" });
    return;
  }
  const plotted = points.map((point, index) => ({
    x: chartX + index / (points.length - 1) * chartWidth,
    y: chartY + chartHeight - point.value / maxValue * chartHeight,
  }));
  const polygon = [
    { x: plotted[0].x, y: chartY + chartHeight },
    ...plotted,
    { x: plotted[plotted.length - 1].x, y: chartY + chartHeight },
  ];
  const vectors = polygon.slice(1).map((point, index) => [
    point.x - polygon[index].x,
    point.y - polygon[index].y,
  ] as [number, number]);
  doc.setFillColor(194, 213, 197);
  doc.lines(vectors, polygon[0].x, polygon[0].y, [1, 1], "F", true);
  doc.setDrawColor(...COLORS.greenDark);
  doc.setLineWidth(0.55);
  plotted.slice(1).forEach((point, index) => doc.line(plotted[index].x, plotted[index].y, point.x, point.y));
  const lastPoint = plotted[plotted.length - 1];
  doc.setFillColor(...COLORS.greenDark);
  doc.circle(lastPoint.x, lastPoint.y, 0.85, "F");

  doc.setFontSize(6.2);
  doc.setTextColor(...COLORS.secondary);
  const tickCount = Math.min(4, points.length);
  const renderedTicks = new Set<number>();
  for (let tick = 0; tick < tickCount; tick += 1) {
    const index = Math.round(tick / Math.max(1, tickCount - 1) * (points.length - 1));
    if (renderedTicks.has(index)) continue;
    renderedTicks.add(index);
    const tickX = chartX + index / (points.length - 1) * chartWidth;
    doc.text(formatChartDate(points[index].date), tickX, y + height - 5, {
      align: tick === 0 ? "left" : tick === tickCount - 1 ? "right" : "center",
    });
  }
}

function summarizeWorkforceRoles(
  roles: Array<{ label: string; count: number | null }>,
) {
  if (roles.length <= 4) return roles;
  const sorted = [...roles].sort((left, right) => (right.count || 0) - (left.count || 0));
  const explicit = sorted.filter((role) => !/no desglosado|otros/i.test(role.label));
  const primary = explicit.slice(0, 3);
  const primarySet = new Set(primary);
  const remaining = sorted.filter((role) => !primarySet.has(role));
  return [
    ...primary,
    {
      label: "Otros/No desglosado",
      count: remaining.some((role) => role.count === null)
        ? null
        : remaining.reduce((sum, role) => sum + (role.count || 0), 0),
    },
  ];
}

function drawVarianceTable(doc: jsPDF, snapshot: ReportSnapshotV1, y: number) {
  const rows = snapshot.variances.slice(0, 5);
  const widths = [132, 42, 40, 36, 23];
  const headers = ["Partida", "Presupuesto", "Pagado", "Varianza", "Avance"];
  const rowHeight = 11;
  const tableWidth = widths.reduce((sum, width) => sum + width, 0);
  doc.setFillColor(...COLORS.white);
  doc.rect(MARGIN, y, tableWidth, rowHeight * (rows.length + 1), "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.8);
  doc.setTextColor(...COLORS.secondary);
  let x = MARGIN;
  headers.forEach((header, index) => {
    doc.text(header, x + 4, y + 7);
    x += widths[index];
  });
  rows.forEach((row, rowIndex) => {
    const rowY = y + rowHeight * (rowIndex + 1);
    if (rowIndex % 2 === 0) {
      doc.setFillColor(...COLORS.background);
      doc.rect(MARGIN, rowY, tableWidth, rowHeight, "F");
    }
    const values = [
      row.name,
      currency(row.approved_budget, snapshot.project.currency),
      currency(row.actual_cost, snapshot.project.currency),
      currency(row.variance, snapshot.project.currency),
      row.program_progress_percent === null || row.program_progress_percent === undefined
        ? "Sin dato"
        : `${number(row.program_progress_percent, 0)}%`,
    ];
    let cellX = MARGIN;
    values.forEach((value, index) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(index === 0 ? 7.6 : 7.1);
      doc.setTextColor(...(index === 3
        ? row.variance < 0 ? COLORS.danger : COLORS.greenDark
        : COLORS.text));
      doc.text(doc.splitTextToSize(value, widths[index] - 8)[0] || "", cellX + 4, rowY + 7);
      cellX += widths[index];
    });
  });

  // Draw the grid last so alternating row fills cannot cover cell borders.
  const tableHeight = rowHeight * (rows.length + 1);
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.25);
  doc.rect(MARGIN, y, tableWidth, tableHeight, "S");
  for (let rowIndex = 1; rowIndex <= rows.length; rowIndex += 1) {
    const lineY = y + rowHeight * rowIndex;
    doc.line(MARGIN, lineY, MARGIN + tableWidth, lineY);
  }
  x = MARGIN;
  widths.slice(0, -1).forEach((width) => {
    x += width;
    doc.line(x, y, x, y + tableHeight);
  });
  return y + rowHeight * (rows.length + 1);
}

async function loadImageAsset(url: string): Promise<ImageAsset | null> {
  try {
    if (url.startsWith("data:image/")) {
      return { data: url, format: url.startsWith("data:image/png") ? "PNG" : "JPEG" };
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6_000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) return null;
    const type = response.headers.get("content-type") || "";
    return {
      data: new Uint8Array(await response.arrayBuffer()),
      format: type.includes("png") || url.toLocaleLowerCase().includes(".png") ? "PNG" : "JPEG",
    };
  } catch {
    return null;
  }
}

async function loadLogbookAssets(snapshot: ReportSnapshotV1) {
  const urls = [...new Set((snapshot.logbook.sections || [])
    .flatMap((section) => section.photos.slice(0, 4))
    .map((photo) => photo.url)
    .filter((url): url is string => Boolean(url)))]
    .slice(0, 24);
  const pairs = await Promise.all(urls.map(async (url) => [url, await loadImageAsset(url)] as const));
  return new Map(pairs.filter((pair): pair is readonly [string, ImageAsset] => Boolean(pair[1])));
}

function drawPhotoCard(
  doc: jsPDF,
  photo: ReportLogbookPhoto | undefined,
  asset: ImageAsset | undefined,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  doc.setFillColor(...COLORS.white);
  doc.setDrawColor(...COLORS.border);
  doc.roundedRect(x, y, width, height, 0.8, 0.8, "FD");
  const imageHeight = height - 15;
  if (asset) {
    let graphicsStateSaved = false;
    try {
      const targetX = x + 0.4;
      const targetY = y + 0.4;
      const targetWidth = width - 0.8;
      const targetHeight = imageHeight - 0.4;

      const properties = doc.getImageProperties(asset.data);
      const sourceRatio = properties.width / Math.max(1, properties.height);
      const targetRatio = targetWidth / targetHeight;
      const renderedWidth = sourceRatio > targetRatio
        ? targetHeight * sourceRatio
        : targetWidth;
      const renderedHeight = sourceRatio > targetRatio
        ? targetHeight
        : targetWidth / Math.max(0.01, sourceRatio);
      const renderedX = targetX + (targetWidth - renderedWidth) / 2;
      const renderedY = targetY + (targetHeight - renderedHeight) / 2;

      doc.saveGraphicsState();
      graphicsStateSaved = true;
      doc.roundedRect(targetX, targetY, targetWidth, targetHeight, 0.6, 0.6, null);
      doc.clip();
      doc.discardPath();
      doc.addImage(
        asset.data,
        asset.format,
        renderedX,
        renderedY,
        renderedWidth,
        renderedHeight,
        undefined,
        "FAST",
      );
      doc.restoreGraphicsState();
      graphicsStateSaved = false;
    } catch {
      if (graphicsStateSaved) doc.restoreGraphicsState();
      doc.setFillColor(...COLORS.hover);
      doc.rect(x + 0.4, y + 0.4, width - 0.8, imageHeight - 0.4, "F");
    }
  } else {
    doc.setFillColor(...COLORS.hover);
    doc.rect(x + 0.4, y + 0.4, width - 0.8, imageHeight - 0.4, "F");
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.secondary);
    doc.text(photo ? "Vista previa no disponible" : "Sin evidencia", x + width / 2, y + imageHeight / 2, { align: "center" });
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.6);
  doc.setTextColor(...COLORS.secondary);
  doc.text("COMENTARIOS (1)", x + 3, y + imageHeight + 4);
  doc.setFontSize(5.2);
  doc.setTextColor(...COLORS.text);
  const caption = photo?.caption || "Sin comentario registrado";
  doc.text(doc.splitTextToSize(caption, width - 6)[0] || "", x + 3, y + imageHeight + 10);
}

function logbookPhotoCardHeight(width: number) {
  const imageWidth = width - 0.8;
  const imageHeight = imageWidth * 9 / 16;
  return imageHeight + 15.4;
}

function logbookSectionHeight(section: ReportLogbookSection) {
  const textHeight = section.incident ? 42 : 36;
  const gap = 2.5;
  const photoWidth = (CONTENT_WIDTH - gap * 2) / 3;
  return textHeight + 3 + logbookPhotoCardHeight(photoWidth);
}

function drawLogbookSection(
  doc: jsPDF,
  section: ReportLogbookSection,
  assets: Map<string, ImageAsset>,
  y: number,
) {
  const hasIncident = Boolean(section.incident);
  const textHeight = hasIncident ? 42 : 36;
  roundedCard(doc, MARGIN, y, CONTENT_WIDTH, textHeight);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.2);
  doc.setTextColor(...COLORS.text);
  doc.text(section.title, MARGIN + 6, y + 10);
  doc.setFontSize(7.4);
  doc.setTextColor(...COLORS.secondary);
  doc.text(
    `${formatDate(section.period_start)} - ${formatDate(section.period_end)} · ${section.author}`,
    PAGE_WIDTH - MARGIN - 6,
    y + 10,
    { align: "right" },
  );
  doc.setFontSize(7.7);
  const bullets = section.bullets.length
    ? section.bullets.slice(0, hasIncident ? 3 : 4)
    : ["Sin avances narrativos registrados en el periodo."];
  bullets.forEach((bullet, index) => {
    doc.setFillColor(...COLORS.pending);
    doc.circle(MARGIN + 7, y + 18.5 + index * 4.5, 0.65, "F");
    doc.setTextColor(...COLORS.secondary);
    doc.text(doc.splitTextToSize(bullet, CONTENT_WIDTH - 18)[0] || "", MARGIN + 10, y + 19.5 + index * 4.5);
  });
  if (section.incident) {
    doc.setFillColor(...COLORS.dangerPale);
    doc.roundedRect(MARGIN + 6, y + textHeight - 9, CONTENT_WIDTH - 12, 6.5, 0.6, 0.6, "F");
    doc.setTextColor(...COLORS.danger);
    doc.setFontSize(7.1);
    doc.text(doc.splitTextToSize(`Incidencia reportada: ${section.incident}`, CONTENT_WIDTH - 20)[0] || "", MARGIN + 9, y + textHeight - 4.5);
  }
  const photoY = y + textHeight + 3;
  const gap = 2.5;
  const photoWidth = (CONTENT_WIDTH - gap * 2) / 3;
  const photoHeight = logbookPhotoCardHeight(photoWidth);
  for (let index = 0; index < 3; index += 1) {
    const photo = section.photos[index];
    const asset = photo?.url ? assets.get(photo.url) : undefined;
    drawPhotoCard(doc, photo, asset, MARGIN + index * (photoWidth + gap), photoY, photoWidth, photoHeight);
  }
  return photoY + photoHeight;
}

function drawInsightCards(doc: jsPDF, insights: ReportInsights, y: number) {
  const cards = insights.insights.slice(0, 4);
  if (!cards.length) {
    roundedCard(doc, MARGIN, y, CONTENT_WIDTH, 22);
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.secondary);
    doc.text("No se detectaron alertas respaldadas por las métricas disponibles.", MARGIN + 5, y + 12);
    return y + 22;
  }
  const gap = 3;
  const width = (CONTENT_WIDTH - gap) / 2;
  cards.forEach((insight, index) => {
    const x = MARGIN + (index % 2) * (width + gap);
    const rowY = y + Math.floor(index / 2) * 33;
    roundedCard(doc, x, rowY, width, 29);
    const tone = insight.severity === "critical" || insight.severity === "high"
      ? COLORS.danger
      : insight.severity === "medium" ? COLORS.blue : COLORS.green;
    doc.setFillColor(...tone);
    doc.rect(x, rowY, 1.3, 29, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.1);
    doc.setTextColor(...COLORS.text);
    doc.text(doc.splitTextToSize(insight.title, width - 12)[0] || "", x + 5, rowY + 7);
    doc.setFontSize(6.5);
    doc.setTextColor(...COLORS.secondary);
    doc.text(doc.splitTextToSize(insight.statement, width - 10).slice(0, 2), x + 5, rowY + 13);
    doc.text(doc.splitTextToSize(`Acción: ${insight.recommended_action}`, width - 10).slice(0, 2), x + 5, rowY + 22);
  });
  return y + Math.ceil(cards.length / 2) * 33;
}

function addFooters(doc: jsPDF, snapshot: ReportSnapshotV1) {
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, PAGE_HEIGHT - 11, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 11);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.2);
    doc.setTextColor(...COLORS.secondary);
    doc.text(`${snapshot.project.name} · ${formatDate(snapshot.period.start)} - ${formatDate(snapshot.period.end)}`, MARGIN, PAGE_HEIGHT - 6.5);
    doc.setFillColor(...COLORS.green);
    doc.roundedRect(PAGE_WIDTH - MARGIN - 25, PAGE_HEIGHT - 8.7, 2.3, 2.3, 0.3, 0.3, "F");
    doc.text(`Página ${page} de ${pages}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 6.5, { align: "right" });
  }
}

// Kept temporarily for compatibility with older report compositions that may
// still be useful while the portrait template rolls out.
void [
  newPage,
  sectionTitle,
  drawMetricStrip,
  drawSummary,
  drawGantt,
  drawLineChartCard,
  drawVarianceTable,
  logbookSectionHeight,
  drawLogbookSection,
  drawInsightCards,
  addFooters,
];

// Rasterized directly from public/OGC-LOGO.svg so the server-side PDF
// generator can embed the official mark without relying on a browser DOM.
const OGC_LOGO_DATA_URL = "data:image/png;base64,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";

const preciseCurrency = (value: number, code: string) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: code || "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);

function paintWhitePage(doc: jsPDF, addPage = false) {
  if (addPage) doc.addPage();
  doc.setFillColor(...COLORS.white);
  doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, "F");
}

function drawCoverMark(doc: jsPDF) {
  const centerX = PAGE_WIDTH / 2;
  const centerY = PAGE_HEIGHT / 2 - 4;
  const width = 22;
  const height = width * 85.882 / 87.127;
  doc.addImage(
    OGC_LOGO_DATA_URL,
    "PNG",
    centerX - width / 2,
    centerY - height / 2,
    width,
    height,
    "ogc-logo",
    "FAST",
  );
}

function portraitSectionTitle(doc: jsPDF, title: string, y: number) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.4);
  doc.setTextColor(...COLORS.text);
  doc.text(title.toUpperCase(), MARGIN, y);
}

function outlineCard(doc: jsPDF, x: number, y: number, width: number, height: number) {
  doc.setFillColor(253, 253, 253);
  doc.setDrawColor(222, 222, 219);
  doc.setLineWidth(0.28);
  doc.roundedRect(x, y, width, height, 1.2, 1.2, "FD");
}

function drawPortraitMetricCards(
  doc: jsPDF,
  y: number,
  items: Array<{ label: string; value: string; tone?: PdfColor }>,
  height = 19,
) {
  const gap = 1.1;
  const width = (CONTENT_WIDTH - gap * (items.length - 1)) / items.length;
  items.forEach((item, index) => {
    const x = MARGIN + index * (width + gap);
    outlineCard(doc, x, y, width, height);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.4);
    doc.setTextColor(...COLORS.secondary);
    const label = doc.splitTextToSize(item.label, width - 7)[0] || item.label;
    doc.text(label, x + 3.8, y + 6.2);
    doc.setFontSize(item.value.length > 12 ? 10.2 : 13.2);
    doc.setTextColor(...(item.tone || COLORS.text));
    doc.text(doc.splitTextToSize(item.value, width - 7)[0] || item.value, x + 3.8, y + 14.8);
  });
}

function drawPortraitSummary(doc: jsPDF, y: number, summary: string) {
  const height = 25.5;
  outlineCard(doc, MARGIN, y, CONTENT_WIDTH, height);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.1);
  doc.setTextColor(...COLORS.secondary);
  const lines = doc.splitTextToSize(summary || "Sin resumen disponible.", CONTENT_WIDTH - 8).slice(0, 6);
  doc.text(lines, MARGIN + 3.8, y + 6.2, { lineHeightFactor: 1.12 });
}

function drawPortraitLineChart(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  title: string,
  total: string,
  points: Array<{ date: string; value: number }>,
) {
  doc.setFillColor(252, 252, 252);
  doc.setDrawColor(231, 231, 229);
  doc.setLineWidth(0.24);
  doc.roundedRect(x, y, width, height, 0.7, 0.7, "FD");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.6);
  doc.setTextColor(...COLORS.text);
  doc.text(title, x + 4.8, y + 7.7);
  doc.setFontSize(4.6);
  doc.setTextColor(...COLORS.secondary);
  doc.text("Total", x + 4.8, y + 15.2);
  doc.setFontSize(6.3);
  doc.setTextColor(...COLORS.text);
  doc.text(total, x + 4.8, y + 19.2);

  const chartX = x + 12;
  const chartY = y + 26;
  const chartWidth = width - 19;
  const chartHeight = height - 35;
  const maxValue = niceAxisMax(Math.max(1, ...points.map((point) => point.value)));
  for (let index = 0; index <= 3; index += 1) {
    const gridY = chartY + chartHeight * index / 3;
    const gridValue = maxValue * (1 - index / 3);
    doc.setDrawColor(235, 235, 233);
    doc.setLineDashPattern([0.8, 1.1], 0);
    doc.setLineWidth(0.12);
    doc.line(chartX, gridY, chartX + chartWidth, gridY);
    doc.setFontSize(3.9);
    doc.setTextColor(...COLORS.secondary);
    doc.text(axisCurrency(gridValue), chartX - 1.5, gridY + 1, { align: "right" });
  }
  doc.setLineDashPattern([], 0);

  if (!points.length) {
    doc.setFontSize(6.5);
    doc.setTextColor(...COLORS.secondary);
    doc.text("Sin datos para mostrar", chartX + chartWidth / 2, chartY + chartHeight / 2, { align: "center" });
    return;
  }

  const plotted = points.map((point, index) => ({
    x: chartX + (points.length === 1 ? 0.5 : index / (points.length - 1)) * chartWidth,
    y: chartY + chartHeight - point.value / maxValue * chartHeight,
  }));
  if (plotted.length > 1) {
    const polygon = [
      { x: plotted[0].x, y: chartY + chartHeight },
      ...plotted,
      { x: plotted[plotted.length - 1].x, y: chartY + chartHeight },
    ];
    const vectors = polygon.slice(1).map((point, index) => [
      point.x - polygon[index].x,
      point.y - polygon[index].y,
    ] as [number, number]);
    doc.setFillColor(205, 222, 207);
    doc.lines(vectors, polygon[0].x, polygon[0].y, [1, 1], "F", true);
    doc.setDrawColor(...COLORS.greenDark);
    doc.setLineWidth(0.4);
    plotted.slice(1).forEach((point, index) => {
      doc.line(plotted[index].x, plotted[index].y, point.x, point.y);
    });
  } else {
    doc.setFillColor(...COLORS.greenDark);
    doc.circle(plotted[0].x, plotted[0].y, 0.7, "F");
  }

  doc.setFontSize(3.9);
  doc.setTextColor(...COLORS.secondary);
  const tickCount = Math.min(5, points.length);
  const rendered = new Set<number>();
  for (let tick = 0; tick < tickCount; tick += 1) {
    const index = Math.round(tick / Math.max(1, tickCount - 1) * (points.length - 1));
    if (rendered.has(index)) continue;
    rendered.add(index);
    const tickX = chartX + (points.length === 1 ? 0.5 : index / (points.length - 1)) * chartWidth;
    doc.text(formatChartDate(points[index].date), tickX, y + height - 3.2, {
      align: tick === 0 ? "left" : tick === tickCount - 1 ? "right" : "center",
    });
  }
}

function workforceRolesForOverview(
  roles: Array<{ label: string; count: number | null }>,
) {
  const summarized = summarizeWorkforceRoles(roles).slice(0, 4);
  const fallbacks = ["Oficiales albañiles", "Oficial carpintero", "Oficial fierrero", "Ayudantes"];
  while (summarized.length < 4) {
    summarized.push({ label: fallbacks[summarized.length], count: null });
  }
  return summarized;
}

function drawOverviewPage(
  doc: jsPDF,
  snapshot: ReportSnapshotV1,
  insights: ReportInsights,
) {
  paintWhitePage(doc, true);
  const code = snapshot.project.currency;
  const workforce = snapshot.workforce;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.2);
  doc.setTextColor(...COLORS.text);
  doc.text("Reporte Semanal de Obra", MARGIN, 13.2);
  doc.setFontSize(12.8);
  doc.text(doc.splitTextToSize(snapshot.project.name, 118)[0] || snapshot.project.name, MARGIN, 25.5);
  doc.setFontSize(8.4);
  doc.setTextColor(...COLORS.secondary);
  doc.text(`Periodo del ${formatDate(snapshot.period.start)} al ${formatDate(snapshot.period.end)}`, MARGIN, 32.2);

  doc.setFontSize(6.8);
  doc.text("Total ingresos", PAGE_WIDTH - MARGIN, 12.4, { align: "right" });
  doc.setFontSize(13.2);
  doc.setTextColor(...COLORS.text);
  doc.text(preciseCurrency(snapshot.financial.accumulated_income, code), PAGE_WIDTH - MARGIN, 20.2, { align: "right" });

  const headlineWidth = CONTENT_WIDTH / 3;
  [
    { label: "Presupuesto aprobado", value: preciseCurrency(snapshot.financial.approved_budget, code), tone: COLORS.text },
    { label: "Gasto total", value: preciseCurrency(snapshot.financial.accumulated_cost, code), tone: COLORS.danger },
    { label: "Por ejercer", value: preciseCurrency(snapshot.financial.balance, code), tone: COLORS.text },
  ].forEach((item, index) => {
    const x = MARGIN + index * headlineWidth + 0.6;
    doc.setFontSize(6.6);
    doc.setTextColor(...COLORS.secondary);
    doc.text(item.label, x, 48.2);
    doc.setFontSize(item.value.length > 16 ? 12.2 : 13.5);
    doc.setTextColor(...item.tone);
    doc.text(item.value, x, 56.2);
  });
  doc.setDrawColor(198, 198, 194);
  doc.setLineWidth(0.25);
  doc.line(MARGIN, 64, PAGE_WIDTH - MARGIN, 64);

  portraitSectionTitle(doc, "Resumen ejecutivo", 75.5);
  drawPortraitSummary(doc, 80.8, insights.executive_summary);
  drawPortraitMetricCards(doc, 110.5, [
    { label: "Avance físico real", value: `${number(snapshot.earned_value.physical_progress_percent, 0)}%` },
    { label: "Valor ganado (EV)", value: compactCurrency(snapshot.earned_value.ev, code) },
    { label: "Costo real acum. (AC)", value: compactCurrency(snapshot.earned_value.ac, code) },
    { label: "CPI", value: metric(snapshot.earned_value.cpi), tone: toneForMetric(snapshot.earned_value.cpi) },
    {
      label: "EAC (Costo al cierre)",
      value: snapshot.earned_value.eac === null ? "N/D" : compactCurrency(snapshot.earned_value.eac, code),
      tone: toneForMetric(snapshot.earned_value.variance_at_completion),
    },
  ]);

  doc.setDrawColor(198, 198, 194);
  doc.line(MARGIN, 136.8, PAGE_WIDTH - MARGIN, 136.8);
  portraitSectionTitle(doc, "Fuerza de trabajo semanal", 149);
  const roles = workforceRolesForOverview(workforce?.roles || []);
  drawPortraitMetricCards(doc, 153.8, [
    {
      label: "Personal en obra",
      value: workforce?.total === null || workforce?.total === undefined ? "-" : String(workforce.total),
    },
    ...roles.map((role) => ({ label: role.label, value: role.count === null ? "-" : String(role.count) })),
  ]);

  const gap = 4.2;
  const chartWidth = (CONTENT_WIDTH - gap) / 2;
  const laborPoints = (workforce?.labor_cost_timeline || []).map((point) => ({ date: point.date, value: point.cumulative }));
  const financialPoints = snapshot.projection.timeline.map((point) => ({ date: point.date, value: point.actual_cumulative }));
  drawPortraitLineChart(
    doc,
    MARGIN,
    178.5,
    chartWidth,
    66,
    "Gasto Mano de Obra",
    compactCurrency(workforce?.labor_cost_total || 0, code),
    laborPoints,
  );
  drawPortraitLineChart(
    doc,
    MARGIN + chartWidth + gap,
    178.5,
    chartWidth,
    66,
    "Avance financiero acumulado",
    compactCurrency(snapshot.financial.accumulated_cost, code),
    financialPoints,
  );
}

function normalizedLabel(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function drawProgramMatrix(
  doc: jsPDF,
  snapshot: ReportSnapshotV1,
  activities: ReportProgramActivity[],
  y: number,
) {
  const rows = activities.filter((activity) => activity.start && activity.end).slice(0, 12);
  const height = 109;
  const tableWidth = 65;
  const valueWidth = 19;
  const chartX = MARGIN + tableWidth;
  const chartWidth = CONTENT_WIDTH - tableWidth;
  const headerHeight = 12.2;
  const rowHeight = (height - headerHeight) / Math.max(1, rows.length);

  doc.setFillColor(...COLORS.white);
  doc.setDrawColor(213, 213, 210);
  doc.setLineWidth(0.2);
  doc.rect(MARGIN, y, CONTENT_WIDTH, height, "FD");
  if (!rows.length) {
    doc.setFontSize(7.5);
    doc.setTextColor(...COLORS.secondary);
    doc.text("No hay actividades con fechas válidas para mostrar.", MARGIN + 5, y + height / 2);
    return height;
  }

  const minRaw = Math.min(...rows.map((activity) => Date.parse(`${activity.start}T00:00:00Z`)));
  const maxRaw = Math.max(...rows.map((activity) => Date.parse(`${activity.extension_end || activity.end}T00:00:00Z`)));
  const minTime = monthStart(new Date(minRaw).toISOString().slice(0, 10));
  const maxDate = new Date(maxRaw);
  const maxTime = Date.UTC(maxDate.getUTCFullYear(), maxDate.getUTCMonth() + 1, 1);
  const span = Math.max(86_400_000, maxTime - minTime);
  const dateToX = (date: string | number) => {
    const timestamp = typeof date === "number" ? date : Date.parse(`${date}T00:00:00Z`);
    return chartX + Math.max(0, Math.min(1, (timestamp - minTime) / span)) * chartWidth;
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(4.5);
  doc.setTextColor(...COLORS.secondary);
  doc.text("PARTIDA · FAMILIA", MARGIN + 2.5, y + 5.1);
  doc.text("PRESUPUESTO", MARGIN + tableWidth - valueWidth + 1.5, y + 5.1);
  doc.setDrawColor(217, 217, 214);
  doc.line(MARGIN + tableWidth - valueWidth, y, MARGIN + tableWidth - valueWidth, y + height);
  doc.line(chartX, y, chartX, y + height);

  const monthBoundaries: number[] = [];
  let month = minTime;
  while (month < maxTime) {
    const current = new Date(month);
    const next = Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 1);
    const monthX = dateToX(month);
    const nextX = dateToX(Math.min(next, maxTime));
    monthBoundaries.push(monthX);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(4.6);
    doc.setTextColor(...COLORS.secondary);
    const label = monthLabel(month);
    doc.text(label.charAt(0).toUpperCase() + label.slice(1), (monthX + nextX) / 2, y + 4.5, { align: "center" });
    doc.setDrawColor(220, 220, 217);
    doc.line(monthX, y, monthX, y + height);
    const monthDays = Math.max(28, Math.round((next - month) / 86_400_000));
    for (let week = 0; week < 5; week += 1) {
      const weekTime = month + Math.min(monthDays, week * 7) * 86_400_000;
      const weekX = dateToX(weekTime);
      doc.setFontSize(3.2);
      doc.setTextColor(185, 185, 181);
      doc.text(`S${week + 1}`, weekX + 0.8, y + 9.6);
      doc.setDrawColor(235, 235, 233);
      doc.setLineDashPattern([0.5, 0.7], 0);
      doc.line(weekX, y + headerHeight, weekX, y + height);
    }
    month = next;
  }
  doc.setLineDashPattern([], 0);
  doc.line(MARGIN, y + headerHeight, PAGE_WIDTH - MARGIN, y + headerHeight);

  const varianceByName = new Map(snapshot.variances.map((item) => [normalizedLabel(item.name), item.approved_budget]));
  rows.forEach((activity, index) => {
    const rowY = y + headerHeight + index * rowHeight;
    if (activity.level === 1) {
      doc.setFillColor(250, 250, 249);
      doc.rect(MARGIN, rowY, tableWidth, rowHeight, "F");
    }
    doc.setDrawColor(224, 224, 221);
    doc.setLineWidth(0.14);
    doc.line(MARGIN, rowY + rowHeight, PAGE_WIDTH - MARGIN, rowY + rowHeight);

    doc.setFont("helvetica", activity.level === 1 ? "bold" : "normal");
    doc.setFontSize(activity.level === 1 ? 4.9 : 4.6);
    doc.setTextColor(activity.level === 1 ? COLORS.text[0] : 91, activity.level === 1 ? COLORS.text[1] : 91, activity.level === 1 ? COLORS.text[2] : 88);
    const indent = activity.level === 1 ? 4.8 : 8.2;
    const availableNameWidth = tableWidth - valueWidth - indent - 2;
    const rowName = doc.splitTextToSize(activity.name, availableNameWidth)[0] || activity.name;
    doc.text(rowName, MARGIN + indent, rowY + rowHeight * 0.63);
    if (activity.level === 1) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(5.5);
      doc.setTextColor(...COLORS.secondary);
      doc.text("v", MARGIN + 2, rowY + rowHeight * 0.63);
    }

    const matchingBudget = varianceByName.get(normalizedLabel(activity.name))
      ?? varianceByName.get(normalizedLabel(activity.group));
    const value = activity.level === 1 && matchingBudget
      ? compactCurrency(matchingBudget, snapshot.project.currency)
      : `Avance: ${number(activity.actual_progress_percent, 0)}%`;
    doc.setFont("helvetica", activity.level === 1 ? "bold" : "normal");
    doc.setFontSize(activity.level === 1 ? 4.6 : 3.9);
    doc.setTextColor(...COLORS.text);
    doc.text(value, MARGIN + tableWidth - 1.5, rowY + rowHeight * 0.63, { align: "right" });

    const barX = dateToX(activity.start!);
    const endX = dateToX(activity.end!);
    const barWidth = Math.max(0.9, endX - barX);
    if (activity.level === 1) {
      doc.setFillColor(244, 239, 236);
      doc.rect(barX, rowY, barWidth, rowHeight, "F");
      doc.setFillColor(190, 219, 199);
      doc.rect(barX, rowY, barWidth, 0.9, "F");
      doc.setFillColor(23, 151, 91);
      doc.rect(barX, rowY, barWidth * Math.min(1, activity.actual_progress_percent / 100), 0.9, "F");
    } else {
      doc.setFillColor(235, 235, 232);
      doc.rect(barX, rowY + 0.5, barWidth, Math.max(0.7, rowHeight - 1), "F");
      doc.setFillColor(129, 176, 143);
      doc.rect(barX, rowY + 0.5, barWidth * Math.min(1, activity.actual_progress_percent / 100), 0.65, "F");
    }
    if (activity.extension_end && Date.parse(`${activity.extension_end}T00:00:00Z`) > Date.parse(`${activity.end}T00:00:00Z`)) {
      doc.setFillColor(186, 126, 121);
      doc.rect(endX, rowY + 0.2, Math.max(0.8, dateToX(activity.extension_end) - endX), 0.8, "F");
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(3.5);
    doc.setTextColor(...COLORS.secondary);
    const chartLabel = doc.splitTextToSize(activity.name.toUpperCase(), Math.max(7, barWidth - 1.8))[0] || "";
    doc.text(chartLabel, barX + 1, rowY + rowHeight * 0.68);
  });

  // Draw the structural grid last so row backgrounds and Gantt bars cannot
  // cover the table borders.
  doc.setLineDashPattern([], 0);
  doc.setDrawColor(210, 210, 207);
  doc.setLineWidth(0.2);
  doc.rect(MARGIN, y, CONTENT_WIDTH, height, "S");
  doc.line(MARGIN + tableWidth - valueWidth, y, MARGIN + tableWidth - valueWidth, y + height);
  doc.line(chartX, y, chartX, y + height);
  doc.line(MARGIN, y + headerHeight, PAGE_WIDTH - MARGIN, y + headerHeight);
  for (let index = 1; index < rows.length; index += 1) {
    const rowLineY = y + headerHeight + index * rowHeight;
    doc.line(MARGIN, rowLineY, PAGE_WIDTH - MARGIN, rowLineY);
  }
  monthBoundaries.slice(1).forEach((boundaryX) => {
    doc.line(boundaryX, y, boundaryX, y + height);
  });

  const cutTime = Date.parse(`${snapshot.period.end}T00:00:00Z`);
  if (cutTime >= minTime && cutTime <= maxTime) {
    const cutX = dateToX(cutTime);
    doc.setDrawColor(...COLORS.danger);
    doc.setLineDashPattern([1, 0.8], 0);
    doc.setLineWidth(0.35);
    doc.line(cutX, y + headerHeight, cutX, y + height);
    doc.setLineDashPattern([], 0);
  }
  return height;
}

function programNarrative(activities: ReportProgramActivity[]) {
  const candidates = activities.filter((activity) => activity.level === 1).slice(0, 4);
  const selectedActivities = candidates.length ? candidates : activities.slice(0, 4);
  return selectedActivities.map((activity) => {
    const actual = number(activity.actual_progress_percent, 0);
    const planned = activity.planned_progress_percent;
    const progress = planned === null
      ? `registra ${actual}% de avance real`
      : `registra ${actual}% real frente a ${number(planned, 0)}% planeado`;
    const timing = activity.delayed
      ? "presenta atraso y requiere seguimiento inmediato"
      : planned !== null && activity.actual_progress_percent + 2 < planned
        ? "avanza por debajo del plan y conviene revisar el siguiente frente"
        : "se mantiene dentro de una trayectoria controlada";
    const window = activity.start && activity.end
      ? ` Su ventana programada va del ${formatDate(activity.start)} al ${formatDate(activity.end)}.`
      : "";
    return `${activity.name}: ${progress}; ${timing}.${window}`;
  });
}

function drawBulletedNarrativeCard(doc: jsPDF, y: number, bullets: string[]) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  const wrapped = bullets.map((bullet) => doc.splitTextToSize(bullet, CONTENT_WIDTH - 19).slice(0, 3));
  const lineHeight = 3.9;
  const contentHeight = wrapped.reduce((sum, lines) => sum + Math.max(1, lines.length) * lineHeight + 1.4, 0);
  const height = Math.min(72, Math.max(30, contentHeight + 7));
  outlineCard(doc, MARGIN, y, CONTENT_WIDTH, height);
  let textY = y + 7.2;
  wrapped.forEach((lines) => {
    doc.setFillColor(...COLORS.secondary);
    doc.circle(MARGIN + 5.2, textY - 1.2, 0.42, "F");
    doc.setTextColor(...COLORS.secondary);
    doc.text(lines, MARGIN + 10.5, textY, { lineHeightFactor: 1.08 });
    textY += Math.max(1, lines.length) * lineHeight + 1.4;
  });
  return height;
}

function drawProgramPage(doc: jsPDF, snapshot: ReportSnapshotV1, activities: ReportProgramActivity[]) {
  paintWhitePage(doc, true);
  portraitSectionTitle(doc, "Programa de obra - avance por concepto", 31.5);
  const matrixHeight = drawProgramMatrix(doc, snapshot, activities, 40.5);
  drawBulletedNarrativeCard(doc, 40.5 + matrixHeight + 7, programNarrative(activities));
}

function drawImageCover(
  doc: jsPDF,
  asset: ImageAsset | undefined,
  photo: ReportLogbookPhoto | undefined,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  doc.setFillColor(246, 246, 244);
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.2);
  doc.roundedRect(x, y, width, height, 1.1, 1.1, "FD");
  if (!asset) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.secondary);
    doc.text(photo ? "Vista previa no disponible" : "Sin evidencia", x + width / 2, y + height / 2, { align: "center" });
    return;
  }
  let saved = false;
  try {
    const properties = doc.getImageProperties(asset.data);
    const sourceRatio = properties.width / Math.max(1, properties.height);
    const targetRatio = width / height;
    const renderedWidth = sourceRatio > targetRatio ? height * sourceRatio : width;
    const renderedHeight = sourceRatio > targetRatio ? height : width / Math.max(0.01, sourceRatio);
    const renderedX = x + (width - renderedWidth) / 2;
    const renderedY = y + (height - renderedHeight) / 2;
    doc.saveGraphicsState();
    saved = true;
    doc.roundedRect(x, y, width, height, 1.1, 1.1, null);
    doc.clip();
    doc.discardPath();
    doc.addImage(asset.data, asset.format, renderedX, renderedY, renderedWidth, renderedHeight, undefined, "FAST");
    doc.restoreGraphicsState();
    saved = false;
  } catch {
    if (saved) doc.restoreGraphicsState();
  }
}

function drawEvidencePage(
  doc: jsPDF,
  section: ReportLogbookSection,
  assets: Map<string, ImageAsset>,
) {
  paintWhitePage(doc, true);
  portraitSectionTitle(doc, section.title, 27.5);
  const sourceBullets = section.bullets.length
    ? section.bullets.slice(0, 4)
    : ["Sin avances narrativos registrados en el periodo."];
  const bullets = section.incident
    ? [...sourceBullets.slice(0, 3), `Incidencia reportada: ${section.incident}`]
    : sourceBullets;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.4);
  const wrapped = bullets.map((bullet) => doc.splitTextToSize(bullet, CONTENT_WIDTH - 20).slice(0, 3));
  const lineHeight = 4.05;
  const textHeight = Math.max(49, wrapped.reduce((sum, lines) => sum + Math.max(1, lines.length) * lineHeight + 1.4, 0) + 8);
  outlineCard(doc, MARGIN, 32.5, CONTENT_WIDTH, textHeight);
  let textY = 40;
  wrapped.forEach((lines) => {
    doc.setFillColor(...COLORS.secondary);
    doc.circle(MARGIN + 3.7, textY - 1.25, 0.42, "F");
    doc.setTextColor(...COLORS.secondary);
    doc.text(lines, MARGIN + 9.5, textY, { lineHeightFactor: 1.08 });
    textY += Math.max(1, lines.length) * lineHeight + 1.4;
  });

  const imageGap = 2.5;
  const imageWidth = (CONTENT_WIDTH - imageGap) / 2;
  const imageHeight = 62;
  const firstImageY = 32.5 + textHeight + 9;
  for (let index = 0; index < 4; index += 1) {
    const photo = section.photos[index];
    const asset = photo?.url ? assets.get(photo.url) : undefined;
    const column = index % 2;
    const row = Math.floor(index / 2);
    drawImageCover(
      doc,
      asset,
      photo,
      MARGIN + column * (imageWidth + imageGap),
      firstImageY + row * (imageHeight + imageGap),
      imageWidth,
      imageHeight,
    );
  }
}

function drawControlPage(
  doc: jsPDF,
  snapshot: ReportSnapshotV1,
  insights: ReportInsights,
  sections: ReportSection[],
) {
  paintWhitePage(doc, true);
  portraitSectionTitle(doc, "Control y seguimiento", 28);
  let y = 34;
  if (selected(sections, "requisitions")) {
    drawPortraitMetricCards(doc, y, [
      { label: "Requisiciones", value: String(snapshot.requisitions.total) },
      { label: "Por revisar", value: String(snapshot.requisitions.pending_review) },
      { label: "Por pagar", value: String(snapshot.requisitions.pending_payment) },
      { label: "Por entregar", value: String(snapshot.requisitions.pending_delivery) },
      { label: "Vencidas", value: String(snapshot.requisitions.overdue_deliveries), tone: snapshot.requisitions.overdue_deliveries ? COLORS.danger : COLORS.text },
    ]);
    y += 29;
  }

  if (selected(sections, "variances")) {
    portraitSectionTitle(doc, "Partidas con mayor varianza", y);
    y += 5;
    const rows = snapshot.variances.slice(0, 5);
    const widths = [67, 29, 29, 31, 28];
    const headers = ["PARTIDA", "PRESUPUESTO", "PAGADO", "VARIANZA", "AVANCE"];
    const rowHeight = 9;
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.2);
    doc.rect(MARGIN, y, CONTENT_WIDTH, rowHeight * (rows.length + 1), "S");
    let columnX = MARGIN;
    headers.forEach((header, index) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(4.6);
      doc.setTextColor(...COLORS.secondary);
      doc.text(header, columnX + 2.2, y + 5.6);
      columnX += widths[index];
      if (index < widths.length - 1) doc.line(columnX, y, columnX, y + rowHeight * (rows.length + 1));
    });
    rows.forEach((row, index) => {
      const rowY = y + rowHeight * (index + 1);
      if (index % 2 === 0) {
        doc.setFillColor(250, 250, 249);
        doc.rect(MARGIN, rowY, CONTENT_WIDTH, rowHeight, "F");
      }
      doc.line(MARGIN, rowY, PAGE_WIDTH - MARGIN, rowY);
      const values = [
        row.name,
        compactCurrency(row.approved_budget, snapshot.project.currency),
        compactCurrency(row.actual_cost, snapshot.project.currency),
        compactCurrency(row.variance, snapshot.project.currency),
        row.program_progress_percent === null || row.program_progress_percent === undefined
          ? "Sin dato"
          : `${number(row.program_progress_percent, 0)}%`,
      ];
      columnX = MARGIN;
      values.forEach((value, valueIndex) => {
        doc.setFontSize(valueIndex === 0 ? 5.8 : 5.3);
        doc.setTextColor(...(valueIndex === 3 && row.variance < 0 ? COLORS.danger : COLORS.text));
        doc.text(doc.splitTextToSize(value, widths[valueIndex] - 4)[0] || value, columnX + 2.2, rowY + 5.8);
        columnX += widths[valueIndex];
      });
    });

    // Redraw the complete grid after alternating row fills so every cell
    // keeps its border in the exported PDF.
    const tableHeight = rowHeight * (rows.length + 1);
    doc.setDrawColor(218, 218, 215);
    doc.setLineWidth(0.2);
    doc.rect(MARGIN, y, CONTENT_WIDTH, tableHeight, "S");
    for (let rowIndex = 1; rowIndex <= rows.length; rowIndex += 1) {
      doc.line(MARGIN, y + rowHeight * rowIndex, PAGE_WIDTH - MARGIN, y + rowHeight * rowIndex);
    }
    columnX = MARGIN;
    widths.slice(0, -1).forEach((width) => {
      columnX += width;
      doc.line(columnX, y, columnX, y + tableHeight);
    });
    y += rowHeight * (rows.length + 1) + 11;
  }

  if (insights.insights.length) {
    portraitSectionTitle(doc, "Insights y acciones recomendadas", y);
    y += 5.5;
    const insightBullets = insights.insights.slice(0, 4).map((insight) => `${insight.title}: ${insight.statement} Acción: ${insight.recommended_action}`);
    y += drawBulletedNarrativeCard(doc, y, insightBullets) + 9;
  }

  if (selected(sections, "data_quality")) {
    portraitSectionTitle(doc, "Calidad de datos y metodología", y);
    y += 5.5;
    const notes = [
      `Calidad de datos: ${number(snapshot.data_quality.score, 0)}/100.`,
      ...snapshot.data_quality.issues.slice(0, 3).map((issue) => `${issue.code}: ${issue.message}`),
      ...snapshot.methodology.slice(0, 2),
    ];
    drawBulletedNarrativeCard(doc, y, notes);
  }
}

export async function renderReportPdf(
  snapshot: ReportSnapshotV1,
  insights: ReportInsights,
  sections: ReportSection[],
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const activities = snapshot.program.activities || [];
  const logbookSections = snapshot.logbook.sections || [];
  const assets = selected(sections, "logbook") ? await loadLogbookAssets(snapshot) : new Map<string, ImageAsset>();

  paintWhitePage(doc);
  drawCoverMark(doc);

  if (
    selected(sections, "executive")
    || selected(sections, "financial")
    || selected(sections, "earned_value")
    || selected(sections, "cashflow")
  ) {
    drawOverviewPage(doc, snapshot, insights);
  }

  if (selected(sections, "program")) {
    drawProgramPage(doc, snapshot, activities);
  }

  if (selected(sections, "logbook")) {
    if (logbookSections.length) {
      logbookSections.forEach((section) => drawEvidencePage(doc, section, assets));
    } else {
      paintWhitePage(doc, true);
      portraitSectionTitle(doc, "Bitácora y evidencia fotográfica", 28);
      outlineCard(doc, MARGIN, 34, CONTENT_WIDTH, 42);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...COLORS.secondary);
      doc.text("No hay entradas de Bitácora en el periodo seleccionado.", MARGIN + 6, 55);
    }
  }

  if (selected(sections, "variances") || selected(sections, "requisitions") || selected(sections, "data_quality")) {
    drawControlPage(doc, snapshot, insights, sections);
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
