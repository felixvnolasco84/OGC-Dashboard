import type {
  ReportFrequency,
  ReportSection,
} from "./reportTypes";
const REPORT_SECTION_KEYS = [
  "executive",
  "financial",
  "earned_value",
  "cashflow",
  "variances",
  "requisitions",
  "program",
  "logbook",
  "data_quality",
] as const;

const SPANISH_MONTHS: Record<string, number> = {
  enero: 1,
  ene: 1,
  febrero: 2,
  feb: 2,
  marzo: 3,
  mar: 3,
  abril: 4,
  abr: 4,
  mayo: 5,
  may: 5,
  junio: 6,
  jun: 6,
  julio: 7,
  jul: 7,
  agosto: 8,
  ago: 8,
  septiembre: 9,
  setiembre: 9,
  sep: 9,
  octubre: 10,
  oct: 10,
  noviembre: 11,
  nov: 11,
  diciembre: 12,
  dic: 12,
};

export type IsoDate = `${number}-${number}-${number}`;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function isValidUtcDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function toIsoDate(year: number, month: number, day: number): IsoDate | null {
  if (!isValidUtcDate(year, month, day)) return null;
  return `${year}-${pad(month)}-${pad(day)}` as IsoDate;
}

export function parseProjectDate(value: unknown): IsoDate | null {
  if (typeof value !== "string") return null;
  const text = value.trim().toLocaleLowerCase("es-MX");
  if (!text) return null;

  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[t\s].*)?$/);
  if (isoMatch) {
    return toIsoDate(
      Number(isoMatch[1]),
      Number(isoMatch[2]),
      Number(isoMatch[3]),
    );
  }

  const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    return toIsoDate(
      Number(slashMatch[3]),
      Number(slashMatch[2]),
      Number(slashMatch[1]),
    );
  }

  const namedMonthMatch = text
    .replace(/,/g, "")
    .match(/^(\d{1,2})\s+(?:de\s+)?([a-záéíóúñ]+)\s+(?:de\s+)?(\d{4})$/);
  if (namedMonthMatch) {
    const normalizedMonth = namedMonthMatch[2]
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const month = SPANISH_MONTHS[normalizedMonth];
    if (month) {
      return toIsoDate(
        Number(namedMonthMatch[3]),
        month,
        Number(namedMonthMatch[1]),
      );
    }
  }

  return null;
}

export function excelSerialToIsoDate(serial: number): IsoDate | null {
  if (!Number.isFinite(serial) || serial <= 0) return null;
  // Excel's 1900 date system includes the non-existent 1900-02-29.
  const milliseconds = Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000;
  const date = new Date(milliseconds);
  return toIsoDate(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
}

export function isoDateToUtc(value: string) {
  const iso = parseProjectDate(value);
  return iso ? Date.parse(`${iso}T00:00:00.000Z`) : Number.NaN;
}

export function addIsoDays(value: string, days: number): IsoDate {
  const timestamp = isoDateToUtc(value);
  if (!Number.isFinite(timestamp)) throw new Error(`Invalid ISO date: ${value}`);
  const date = new Date(timestamp + days * 86_400_000);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` as IsoDate;
}

export function compareIsoDates(a: string, b: string) {
  return a.localeCompare(b);
}

export function isDateInRange(date: string | null, start: string, end: string) {
  return Boolean(date && date >= start && date <= end);
}

export function sanitizeSections(values: string[]): ReportSection[] {
  const allowed = new Set<string>(REPORT_SECTION_KEYS);
  return [...new Set(values.filter((value) => allowed.has(value)))] as ReportSection[];
}

export function sanitizeReportText(value: unknown, maxLength = 240) {
  if (typeof value !== "string") return "";
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[correo]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[teléfono]")
    .replace(/\b(?:\d[ -]?){10,20}\b/g, "[referencia]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
};

const WEEKDAYS: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

export function getZonedParts(timestamp: number, timezone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(new Date(timestamp));
  const findNumber = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const weekdayName = parts.find((part) => part.type === "weekday")?.value || "Mon";
  return {
    year: findNumber("year"),
    month: findNumber("month"),
    day: findNumber("day"),
    hour: findNumber("hour"),
    minute: findNumber("minute"),
    weekday: WEEKDAYS[weekdayName] || 1,
  };
}

export function zonedDateTimeToTimestamp(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
) {
  // Iteratively correct a UTC guess using the wall-clock representation. This
  // handles ordinary DST transitions without introducing a client dependency.
  let guess = Date.UTC(year, month - 1, day, hour, minute);
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const actual = getZonedParts(guess, timezone);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
    );
    const delta = targetAsUtc - actualAsUtc;
    guess += delta;
    if (delta === 0) break;
  }
  return guess;
}

function datePartsFromIso(value: string) {
  const iso = parseProjectDate(value);
  if (!iso) throw new Error(`Invalid ISO date: ${value}`);
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month, day };
}

function isoFromTimestampUtc(timestamp: number): IsoDate {
  const value = new Date(timestamp);
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}` as IsoDate;
}

function localIsoDate(timestamp: number, timezone: string): IsoDate {
  const parts = getZonedParts(timestamp, timezone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}` as IsoDate;
}

export type ReportSchedule = {
  frequency: ReportFrequency;
  timezone: string;
  local_hour: number;
  local_minute: number;
  day_of_week?: number;
  day_of_month?: number;
};

export function validateTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

export function nextRunAt(schedule: ReportSchedule, afterTimestamp: number) {
  if (!validateTimezone(schedule.timezone)) throw new Error("Invalid IANA timezone");
  const local = getZonedParts(afterTimestamp, schedule.timezone);
  const today = `${local.year}-${pad(local.month)}-${pad(local.day)}` as IsoDate;
  let candidateDate = today;

  if (schedule.frequency === "weekly") {
    const target = Math.min(7, Math.max(1, schedule.day_of_week || 1));
    const daysAhead = (target - local.weekday + 7) % 7;
    candidateDate = addIsoDays(today, daysAhead);
  } else if (schedule.frequency === "monthly") {
    const targetDay = Math.min(28, Math.max(1, schedule.day_of_month || 1));
    candidateDate = toIsoDate(local.year, local.month, targetDay) as IsoDate;
    if (candidateDate < today) {
      const nextMonth = new Date(Date.UTC(local.year, local.month, 1));
      candidateDate = toIsoDate(
        nextMonth.getUTCFullYear(),
        nextMonth.getUTCMonth() + 1,
        targetDay,
      ) as IsoDate;
    }
  }

  let parts = datePartsFromIso(candidateDate);
  let candidate = zonedDateTimeToTimestamp(
    parts.year,
    parts.month,
    parts.day,
    schedule.local_hour,
    schedule.local_minute,
    schedule.timezone,
  );

  if (candidate <= afterTimestamp) {
    if (schedule.frequency === "daily") candidateDate = addIsoDays(candidateDate, 1);
    if (schedule.frequency === "weekly") candidateDate = addIsoDays(candidateDate, 7);
    if (schedule.frequency === "monthly") {
      const nextMonth = new Date(Date.UTC(parts.year, parts.month, 1));
      candidateDate = toIsoDate(
        nextMonth.getUTCFullYear(),
        nextMonth.getUTCMonth() + 1,
        Math.min(28, Math.max(1, schedule.day_of_month || 1)),
      ) as IsoDate;
    }
    parts = datePartsFromIso(candidateDate);
    candidate = zonedDateTimeToTimestamp(
      parts.year,
      parts.month,
      parts.day,
      schedule.local_hour,
      schedule.local_minute,
      schedule.timezone,
    );
  }

  return candidate;
}

export function previousPeriod(
  frequency: ReportFrequency,
  scheduledTimestamp: number,
  timezone: string,
) {
  const today = localIsoDate(scheduledTimestamp, timezone);
  if (frequency === "daily") {
    const day = addIsoDays(today, -1);
    return { start: day, end: day, key: `daily:${day}` };
  }

  if (frequency === "weekly") {
    const local = getZonedParts(scheduledTimestamp, timezone);
    const currentMonday = addIsoDays(today, -(local.weekday - 1));
    const start = addIsoDays(currentMonday, -7);
    const end = addIsoDays(currentMonday, -1);
    return { start, end, key: `weekly:${start}:${end}` };
  }

  const { year, month } = datePartsFromIso(today);
  const previousMonth = new Date(Date.UTC(year, month - 2, 1));
  const start = isoFromTimestampUtc(Date.UTC(
    previousMonth.getUTCFullYear(),
    previousMonth.getUTCMonth(),
    1,
  ));
  const end = isoFromTimestampUtc(Date.UTC(year, month - 1, 0));
  return { start, end, key: `monthly:${start}:${end}` };
}

export function calculateEarnedValue(input: {
  approvedBudget: number;
  actualCost: number;
  physicalProgressPercent: number;
  plannedProgressPercent: number;
}) {
  const bac = Math.max(0, input.approvedBudget);
  const ac = Math.max(0, input.actualCost);
  const physical = Math.min(100, Math.max(0, input.physicalProgressPercent));
  const planned = Math.min(100, Math.max(0, input.plannedProgressPercent));
  const ev = bac * (physical / 100);
  const pv = bac * (planned / 100);
  const cpi = ac > 0 ? ev / ac : null;
  const spi = pv > 0 ? ev / pv : null;
  const eac = cpi && cpi > 0 ? bac / cpi : null;
  const etc = eac === null ? null : Math.max(0, eac - ac);
  const varianceAtCompletion = eac === null ? null : bac - eac;
  return { pv, ev, ac, cpi, spi, eac, etc, varianceAtCompletion };
}

export function calculateApprovedCommitments(
  requisitions: Array<{
    id: string;
    status: string;
    reviewStatus?: string;
  }>,
  items: Array<{
    requisitionId: string;
    amount?: number;
    reviewStatus?: string;
  }>,
) {
  const approvedIds = new Set(
    requisitions
      .filter((row) =>
        ["Aprobada", "Parcialmente Aprobada"].includes(row.reviewStatus || "") &&
        row.status !== "Pagado" &&
        row.status !== "Cancelado")
      .map((row) => row.id),
  );
  return items.reduce((total, item) => {
    if (!approvedIds.has(item.requisitionId) || item.reviewStatus === "rechazado") {
      return total;
    }
    const amount = Number(item.amount);
    return total + (Number.isFinite(amount) ? amount : 0);
  }, 0);
}

export const REPORT_SUBSCRIPTION_LEASE_MS = 10 * 60_000;

export function canClaimReportSubscription(
  leaseUntil: number | undefined,
  now: number,
): boolean {
  return (leaseUntil || 0) <= now;
}

export function reportSubscriptionPeriodKey(
  subscriptionId: string,
  periodKey: string,
): string {
  return `${subscriptionId}:${periodKey}`;
}

export const MAX_REPORT_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export function shouldAttachReportPdf(size: number): boolean {
  return size < MAX_REPORT_ATTACHMENT_BYTES;
}
