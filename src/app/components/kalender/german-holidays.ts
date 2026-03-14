// ── German Public Holidays (Feiertage) ────────────────────────────
// Computed locally, never persisted to Supabase.
// Covers all bundesweite Feiertage + the most important regional ones.

export interface Holiday {
  /** Unique stable ID, e.g. "holiday-2025-2025-04-18" */
  id: string;
  /** Full German name, e.g. "Karfreitag" */
  name: string;
  /** Compact name for the month-grid cell (≤ 12 chars target) */
  shortName: string;
  /** ISO date key YYYY-MM-DD */
  dateKey: string;
  /** false = bundesweit, true = only in specific states */
  regional: boolean;
  /** State codes if regional, e.g. ["BW", "BY"] */
  states?: string[];
}

// ── Gaussian Easter algorithm ──────────────────────────────────────
function getEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1; // 0-indexed
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function dk(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Holidays for a single year ─────────────────────────────────────
export function getHolidaysForYear(year: number): Holiday[] {
  const easter = getEasterSunday(year);
  const list: Holiday[] = [];

  const add = (
    date: Date,
    name: string,
    shortName: string,
    regional = false,
    states?: string[],
  ) => {
    list.push({ id: `holiday-${year}-${dk(date)}`, name, shortName, dateKey: dk(date), regional, states });
  };

  // ── Bundesweite Feiertage ──────────────────────────────────────
  add(new Date(year, 0, 1),  "Neujahr",                    "Neujahr");
  add(new Date(year, 4, 1),  "Tag der Arbeit",              "1. Mai");
  add(new Date(year, 9, 3),  "Tag der Deutschen Einheit",   "3. Oktober");
  add(new Date(year, 11, 25),"1. Weihnachtstag",            "Weihnachten");
  add(new Date(year, 11, 26),"2. Weihnachtstag",            "2. Weihnachten");

  // Easter-based (bundesweit)
  add(addDays(easter, -2),  "Karfreitag",          "Karfreitag");
  add(easter,                "Ostersonntag",         "Ostern");
  add(addDays(easter,  1),  "Ostermontag",          "Ostermontag");
  add(addDays(easter, 39),  "Christi Himmelfahrt",  "Himmelfahrt");
  add(addDays(easter, 49),  "Pfingstsonntag",       "Pfingstsonntag");
  add(addDays(easter, 50),  "Pfingstmontag",        "Pfingstmontag");

  // ── Regionale Feiertage ────────────────────────────────────────
  add(
    new Date(year, 0, 6),
    "Heilige Drei Könige",
    "H. Drei Könige",
    true,
    ["BW", "BY", "ST"],
  );
  add(
    addDays(easter, 60),
    "Fronleichnam",
    "Fronleichnam",
    true,
    ["BW", "BY", "HE", "NW", "RP", "SL"],
  );
  add(
    new Date(year, 9, 31),
    "Reformationstag",
    "Reformation",
    true,
    ["BB", "HB", "HH", "MV", "NI", "SN", "ST", "TH"],
  );
  add(
    new Date(year, 10, 1),
    "Allerheiligen",
    "Allerheiligen",
    true,
    ["BW", "BY", "NW", "RP", "SL"],
  );

  return list;
}

// ── Multi-year cache + map builder ────────────────────────────────
const _cache = new Map<number, Holiday[]>();

/**
 * Returns a Map<dateKey, Holiday[]> for the given years.
 * Results are cached so re-navigation is free.
 */
export function getHolidaysForYears(years: number[]): Map<string, Holiday[]> {
  const result = new Map<string, Holiday[]>();
  for (const year of years) {
    if (!_cache.has(year)) _cache.set(year, getHolidaysForYear(year));
    for (const h of _cache.get(year)!) {
      const bucket = result.get(h.dateKey) ?? [];
      bucket.push(h);
      result.set(h.dateKey, bucket);
    }
  }
  return result;
}
