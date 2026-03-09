import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Clock,
  Repeat,
  Bell,
  PenLine,
  FileText,
  Link,
  Palette,
  Trash2,
  Calendar,
  Check,
  Users,
  Search,
} from "lucide-react";
import { CookingPot, Notepad } from "phosphor-react";
import { apiFetch } from "../supabase-client";
import { useKvRealtime, markLocalWrite } from "../use-kv-realtime";
import {
  CalendarEvent,
  CalendarLabel,
  EventColor,
  RepeatRule,
  NotificationMinutes,
  REPEAT_OPTIONS,
  DEFAULT_LABELS,
  DEV_HOUSEHOLD_ID,
  DEV_MEMBERS,
  HouseholdMember,
  generateId,
  getColorHex,
} from "./calendar-types";

// ── Constants & Helpers ────────────────────────────────────────────

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

const MONTHS_DE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

const MONTHS_SHORT = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const DAYS_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateLong(d: Date): string {
  const days = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  return `${days[d.getDay()]}, ${d.getDate()}. ${MONTHS_DE[d.getMonth()]}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatEventDateTime(iso: string, allDay: boolean): string {
  const d = new Date(iso);
  const dayName = DAYS_SHORT[d.getDay()];
  const day = d.getDate();
  const month = MONTHS_SHORT[d.getMonth()];
  const year = d.getFullYear();
  if (allDay) return `${dayName}, ${day}. ${month} ${year}`;
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  return `${dayName}, ${day}. ${month} ${year} \u00b7 ${hours}:${mins}`;
}

function formatNotification(minutes: number): string {
  if (minutes === 0) return "Zum Zeitpunkt";
  if (minutes < 60) return `${minutes} Min. vorher`;
  if (minutes === 60) return "1 Stunde vorher";
  if (minutes < 1440 && minutes % 60 === 0) return `${minutes / 60} Std. vorher`;
  if (minutes === 1440) return "1 Tag vorher";
  if (minutes > 1440 && minutes % 1440 === 0) return `${minutes / 1440} Tage vorher`;
  return `${minutes} Min. vorher`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  let startOffset = (firstDay.getDay() + 6) % 7;
  const days: { date: Date; inMonth: boolean }[] = [];

  for (let i = startOffset - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({ date: d, inMonth: false });
  }
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push({ date: new Date(year, month, i), inMonth: true });
  }
  while (days.length < 42) {
    const d = new Date(year, month + 1, days.length - startOffset - lastDay.getDate() + 1);
    days.push({ date: d, inMonth: false });
  }
  return days;
}

function dateMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isMultiDay(ev: CalendarEvent): boolean {
  return toDateKey(new Date(ev.start_time)) !== toDateKey(new Date(ev.end_time));
}

function getEventsForDate(events: CalendarEvent[], targetDate: Date): CalendarEvent[] {
  const target = toDateKey(targetDate);
  const targetMid = dateMidnight(targetDate);
  const result: CalendarEvent[] = [];

  for (const ev of events) {
    const start = new Date(ev.start_time);

    if (ev.recurring_exception_dates?.includes(target)) continue;

    // Respect end_repeat_date – skip recurring instances on or after this date
    if (ev.repeat_rule !== "none" && ev.end_repeat_date) {
      const endRepeat = new Date(ev.end_repeat_date);
      if (targetMid >= dateMidnight(endRepeat)) continue;
    }

    const edit = ev.recurring_edits?.[target];
    const effective = edit ? { ...ev, ...edit } : ev;

    if (ev.repeat_rule === "none") {
      const end = new Date(ev.end_time);
      const startMid = dateMidnight(start);
      const endMid = dateMidnight(end);
      if (targetMid >= startMid && targetMid <= endMid) {
        result.push(effective);
      }
      continue;
    }

    if (targetDate < new Date(start.getFullYear(), start.getMonth(), start.getDate())) continue;

    switch (ev.repeat_rule) {
      case "daily":
        result.push(effective);
        break;
      case "weekly":
        if ((targetDate.getDay() + 6) % 7 === (start.getDay() + 6) % 7) {
          result.push(effective);
        }
        break;
      case "monthly":
        if (targetDate.getDate() === start.getDate()) {
          result.push(effective);
        }
        break;
      case "yearly":
        if (targetDate.getMonth() === start.getMonth() && targetDate.getDate() === start.getDate()) {
          result.push(effective);
        }
        break;
    }
  }

  return result.sort((a, b) => {
    const aMulti = a.all_day || isMultiDay(a);
    const bMulti = b.all_day || isMultiDay(b);
    if (aMulti && !bMulti) return -1;
    if (!aMulti && bMulti) return 1;
    return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
  });
}

// ── Multi-day band layout for week rows ────────────────────────────

interface MultiDaySegment {
  event: CalendarEvent;
  startCol: number;
  span: number;
  lane: number;
}

function computeWeekBands(
  weekDates: { date: Date; inMonth: boolean }[],
  events: CalendarEvent[]
): MultiDaySegment[] {
  const segments: MultiDaySegment[] = [];
  const wStartMid = dateMidnight(weekDates[0].date);
  const wEndMid = dateMidnight(weekDates[6].date);

  const multiDayEvs = events.filter((ev) => {
    if (ev.repeat_rule !== "none") return false;
    if (!isMultiDay(ev)) return false;
    const sMid = dateMidnight(new Date(ev.start_time));
    const eMid = dateMidnight(new Date(ev.end_time));
    return sMid <= wEndMid && eMid >= wStartMid;
  });

  multiDayEvs.sort((a, b) => {
    const sa = new Date(a.start_time).getTime();
    const sb = new Date(b.start_time).getTime();
    if (sa !== sb) return sa - sb;
    return (new Date(b.end_time).getTime() - sb) - (new Date(a.end_time).getTime() - sa);
  });

  for (const ev of multiDayEvs) {
    const sMid = dateMidnight(new Date(ev.start_time));
    const eMid = dateMidnight(new Date(ev.end_time));

    const startCol = sMid < wStartMid
      ? 0
      : weekDates.findIndex((d) => toDateKey(d.date) === toDateKey(sMid));
    const endCol = eMid > wEndMid
      ? 6
      : weekDates.findIndex((d) => toDateKey(d.date) === toDateKey(eMid));

    if (startCol < 0 || endCol < 0) continue;

    let lane = 0;
    while (lane < 2) {
      const conflict = segments.some(
        (seg) =>
          seg.lane === lane &&
          !(seg.startCol + seg.span <= startCol || seg.startCol > endCol)
      );
      if (!conflict) break;
      lane++;
    }
    if (lane >= 2) continue;

    segments.push({
      event: ev,
      startCol,
      span: endCol - startCol + 1,
      lane,
    });
  }

  return segments;
}

function bandsAtCol(segments: MultiDaySegment[], col: number): number {
  let max = 0;
  for (const seg of segments) {
    if (col >= seg.startCol && col < seg.startCol + seg.span) {
      if (seg.lane + 1 > max) max = seg.lane + 1;
    }
  }
  return max;
}

// ── Month Grid Data helper ─────────────────────────────────────────

interface MonthGridData {
  weeks: { date: Date; inMonth: boolean }[][];
  weekBands: MultiDaySegment[][];
  cellSingleEvents: Record<string, CalendarEvent[]>;
  cellAllEvents: Record<string, CalendarEvent[]>;
}

function computeMonthGridData(year: number, month: number, events: CalendarEvent[]): MonthGridData {
  const monthDays = getMonthDays(year, month);
  const weeks: { date: Date; inMonth: boolean }[][] = [];
  for (let i = 0; i < monthDays.length; i += 7) weeks.push(monthDays.slice(i, i + 7));
  const weekBands = weeks.map((week) => computeWeekBands(week, events));
  const cellSingleEvents: Record<string, CalendarEvent[]> = {};
  const cellAllEvents: Record<string, CalendarEvent[]> = {};
  for (const { date } of monthDays) {
    const key = toDateKey(date);
    const evs = getEventsForDate(events, date);
    if (evs.length > 0) cellAllEvents[key] = evs;
    const singles = evs.filter((ev) => !isMultiDay(ev));
    if (singles.length > 0) cellSingleEvents[key] = singles;
  }
  return { weeks, weekBands, cellSingleEvents, cellAllEvents };
}

// ── Extracted MonthGrid component ──────────────────────────────────

const BAND_HEIGHT = 16;
const BAND_GAP = 1;
const DAY_NUM_HEIGHT = 28;

interface MonthGridProps {
  data: MonthGridData;
  selectedDate: Date;
  highlightMonth: number;
  today: Date;
  isDark: boolean;
  onDayClick: (date: Date) => void;
}

const MonthGrid = React.memo(function MonthGrid({ data, selectedDate, highlightMonth, today, isDark, onDayClick }: MonthGridProps) {
  const { weeks, weekBands, cellSingleEvents, cellAllEvents } = data;
  return (
    // height: 100% fills the track panel height set by the outer grid container
    <div style={{ flex: "0 0 33.3333%", height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Weekday labels row — never shrinks */}
      <div className="grid grid-cols-7 mb-0.5 flex-shrink-0">
        {WEEKDAYS.map((wd) => (
          <div key={wd} className="text-center text-[11px] font-semibold text-text-3 py-1">
            {wd}
          </div>
        ))}
      </div>
      {/* Weeks wrapper: flex-col distributes height equally across week rows */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      {weeks.map((week, weekIdx) => {
        const bands = weekBands[weekIdx];
        const maxLanes = bands.length > 0 ? Math.max(...bands.map((b) => b.lane)) + 1 : 0;
        const bandAreaHeight = maxLanes * (BAND_HEIGHT + BAND_GAP);
        return (
          <div
              key={weekIdx}
              className="relative grid grid-cols-7"
              // flex:1 → equal height share; overflow:hidden clips events beyond row height
              style={{ flex: 1, minHeight: 0, overflow: "hidden" }}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const col = Math.min(6, Math.max(0, Math.floor((e.clientX - rect.left) / (rect.width / 7))));
                onDayClick(week[col].date);
              }}
            >
            {bands.map((seg) => {
              const pillStyle = getEventPillStyle(seg.event.color, isDark);
              const sMid = dateMidnight(new Date(seg.event.start_time));
              const eMid = dateMidnight(new Date(seg.event.end_time));
              const isStart = toDateKey(sMid) >= toDateKey(week[0].date);
              const isEnd = toDateKey(eMid) <= toDateKey(week[6].date);
              return (
                <div
                  key={`band-${seg.event.id}-${weekIdx}`}
                  className={`absolute z-20 flex items-center overflow-hidden ${
                    isStart && isEnd ? "rounded-sm" : isStart ? "rounded-l-sm" : isEnd ? "rounded-r-sm" : ""
                  }`}
                  style={{
                    left: `${(seg.startCol / 7) * 100}%`,
                    width: `${(seg.span / 7) * 100}%`,
                    top: DAY_NUM_HEIGHT + seg.lane * (BAND_HEIGHT + BAND_GAP),
                    height: BAND_HEIGHT,
                    backgroundColor: pillStyle.bg,
                    pointerEvents: "none",
                  }}
                >
                  <span className="text-[10px] font-medium truncate w-full px-1 leading-none" style={{ color: pillStyle.text }}>
                    {seg.event.title}
                  </span>
                </div>
              );
            })}
            {week.map((dayObj, colIdx) => {
              const { date, inMonth } = dayObj;
              const key = toDateKey(date);
              const isToday = isSameDay(date, today);
              const isSelected = isSameDay(date, selectedDate) && date.getMonth() === highlightMonth;
              const singleEvents = cellSingleEvents[key] || [];
              const allEvents = cellAllEvents[key] || [];
              const bandsHere = bandsAtCol(bands, colIdx);
              const maxSingleSlots = Math.max(0, 3 - bandsHere);
              const visibleSingle = singleEvents.slice(0, maxSingleSlots);
              const visibleIds = new Set<string>();
              for (const seg of bands) {
                if (colIdx >= seg.startCol && colIdx < seg.startCol + seg.span) visibleIds.add(seg.event.id);
              }
              for (const ev of visibleSingle) visibleIds.add(ev.id);
              const hiddenEvents = allEvents.filter((ev) => !visibleIds.has(ev.id));
              const hiddenCount = hiddenEvents.length;
              const hiddenColors = [...new Set(hiddenEvents.map((ev) => ev.color))];
              return (
                <button
                  key={colIdx}
                  onClick={(e) => { e.stopPropagation(); onDayClick(date); }}
                  className={`flex flex-col items-center pt-1 relative overflow-visible ${
                    isSelected ? "rounded-lg" : ""
                  }`}
                  style={{ height: "100%", backgroundColor: isSelected ? "var(--surface-2)" : undefined }}
                >
                  <div
                    className={`w-6 h-6 flex items-center justify-center rounded-full text-xs relative z-10 flex-shrink-0 ${
                      isToday
                        ? "text-white font-bold"
                        : isSelected
                        ? "font-bold"
                        : inMonth
                        ? "text-text-1"
                        : "text-text-3"
                    }`}
                    style={
                      isToday
                        ? { background: "var(--today-circle)" }
                        : isSelected
                        ? { color: "var(--text-1)", fontWeight: 700 }
                        : undefined
                    }
                  >
                    {date.getDate()}
                  </div>
                  {visibleSingle.length > 0 && (
                    <div className="w-full flex flex-col gap-px absolute left-0 right-0" style={{ top: DAY_NUM_HEIGHT + bandAreaHeight }}>
                      {visibleSingle.map((ev) => {
                        const pillStyle = getEventPillStyle(ev.color, isDark);
                        return (
                          <div
                            key={ev.id}
                            className={`flex items-center overflow-hidden rounded-sm ${ev.all_day ? "w-full" : "mx-1"}`}
                            style={{ height: BAND_HEIGHT, backgroundColor: pillStyle.bg }}
                          >
                            <span className="text-[10px] font-medium truncate w-full px-1 leading-none" style={{ color: pillStyle.text }}>
                              {ev.title}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {hiddenCount > 0 && (
                    <div
                      className="absolute flex items-center justify-center gap-0.5 w-full px-0.5"
                      style={{
                        top: DAY_NUM_HEIGHT + bandAreaHeight + visibleSingle.length * (BAND_HEIGHT + BAND_GAP),
                        height: 14,
                      }}
                    >
                      <span className="text-[9px] font-semibold leading-none flex-shrink-0" style={{ color: "var(--color-accent)" }}>+{hiddenCount}</span>
                      {hiddenColors.slice(0, 3).map((c) => (
                        <div key={c} className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: getColorHex(c) }} />
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        );
      })}
      </div>{/* end weeks wrapper */}
    </div>
  );
});

// Interpolate: (1-ratio)*255 white + ratio*hex  →  tinted white for dark pill text
function mixWithWhite(hex: string, ratio: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.round(255 * (1 - ratio) + r * ratio)},${Math.round(255 * (1 - ratio) + g * ratio)},${Math.round(255 * (1 - ratio) + b * ratio)})`;
}

function getEventPillStyle(color: EventColor, isDark: boolean): { bg: string; text: string } {
  const lightMap: Record<EventColor, { bg: string; text: string }> = {
    orange: { bg: "rgba(249,115,22,0.15)", text: "#EA580C" },
    blue:   { bg: "rgba(59,130,246,0.15)",  text: "#2563EB" },
    green:  { bg: "rgba(34,197,94,0.15)",   text: "#16A34A" },
    red:    { bg: "rgba(239,68,68,0.15)",   text: "#DC2626" },
    purple: { bg: "rgba(139,92,246,0.15)",  text: "#7C3AED" },
    gray:   { bg: "rgba(107,114,128,0.15)", text: "#4B5563" },
  };
  const darkHex: Record<EventColor, string> = {
    orange: "#F97316", blue: "#3B82F6", green: "#22C55E",
    red: "#EF4444", purple: "#8B5CF6", gray: "#6B7280",
  };
  const darkBg: Record<EventColor, string> = {
    orange: "rgba(249,115,22,0.28)", blue: "rgba(59,130,246,0.28)",
    green: "rgba(34,197,94,0.28)", red: "rgba(239,68,68,0.28)",
    purple: "rgba(139,92,246,0.28)", gray: "rgba(107,114,128,0.28)",
  };
  if (isDark) {
    const hex = darkHex[color] ?? darkHex.orange;
    return { bg: darkBg[color] ?? darkBg.orange, text: mixWithWhite(hex, 0.15) };
  }
  return lightMap[color] ?? lightMap.orange;
}

// ── Main Component ─────────────────────────────────────────────────

export function KalenderScreen({ onNavigate }: { onNavigate?: (tab: string, itemId?: string | null) => void } = {}) {
  const today = useMemo(() => new Date(), []);
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState(today);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [labels, setLabels] = useState<CalendarLabel[]>([]);
  const [isDark, setIsDark] = useState(() => document.documentElement.dataset.theme === "dark");

  useEffect(() => {
    const obs = new MutationObserver(() => {
      setIsDark(document.documentElement.dataset.theme === "dark");
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [showRecurringPrompt, setShowRecurringPrompt] = useState(false);
  const [pendingEdit, setPendingEdit] = useState<{ event: CalendarEvent; dateKey: string } | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadErrorRef = useRef(false);

  // ── Server sync ────────────────────────────────────────────────

  const loadEvents = useCallback(async () => {
    try {
      const data = await apiFetch(`/calendar-events?household_id=${DEV_HOUSEHOLD_ID}`);
      setEvents(data.events || []);
      if (loadErrorRef.current) {
        console.log("Kalender-Events erfolgreich geladen nach vorherigem Fehler.");
        loadErrorRef.current = false;
      }
    } catch (err) {
      if (!loadErrorRef.current) {
        console.error("Fehler beim Laden der Kalender-Events:", err);
        loadErrorRef.current = true;
      }
    }
  }, []);

  const saveEvents = useCallback((newEvents: CalendarEvent[]) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        markLocalWrite();
        await apiFetch("/calendar-events", {
          method: "PUT",
          body: JSON.stringify({ household_id: DEV_HOUSEHOLD_ID, events: newEvents }),
        });
      } catch (err) {
        console.error("Fehler beim Speichern der Kalender-Events:", err);
      }
    }, 500);
  }, []);

  // ── Labels sync ────────────────────────────────────────────────

  const loadLabels = useCallback(async () => {
    try {
      const data = await apiFetch(`/calendar-labels?household_id=${DEV_HOUSEHOLD_ID}`);
      const loaded = data.labels || [];
      if (loaded.length === 0) {
        // Seed default labels on first load
        setLabels(DEFAULT_LABELS);
        await apiFetch("/calendar-labels", {
          method: "PUT",
          body: JSON.stringify({ household_id: DEV_HOUSEHOLD_ID, labels: DEFAULT_LABELS }),
        });
        console.log("Standard-Labels gespeichert.");
      } else {
        setLabels(loaded);
      }
    } catch (err) {
      console.error("Fehler beim Laden der Labels:", err);
      // Fallback to defaults
      setLabels(DEFAULT_LABELS);
    }
  }, []);

  const reloadAll = useCallback(() => {
    loadEvents();
    loadLabels();
  }, [loadEvents, loadLabels]);

  useEffect(() => {
    // Stagger initial loads slightly to avoid overwhelming edge function cold start
    loadEvents();
    const labelTimer = setTimeout(loadLabels, 200);
    // If initial load failed, retry a few more times with increasing delay
    let retryCount = 0;
    const maxRetries = 3;
    const retryTimer = setInterval(() => {
      if (loadErrorRef.current && retryCount < maxRetries) {
        retryCount++;
        console.log(`Kalender: Auto-Retry ${retryCount}/${maxRetries}...`);
        loadEvents();
      }
    }, 3000);
    return () => {
      clearTimeout(labelTimer);
      clearInterval(retryTimer);
    };
  }, [loadEvents, loadLabels]);

  // ── Supabase Realtime subscription for live sync ──
  useKvRealtime(
    [`calendar_events:${DEV_HOUSEHOLD_ID}`, `calendar_labels:${DEV_HOUSEHOLD_ID}`],
    reloadAll,
  );

  // ── Event CRUD ─────────────────────────────────────────────────

  const updateEvents = useCallback(
    (newEvents: CalendarEvent[]) => {
      setEvents(newEvents);
      saveEvents(newEvents);
    },
    [saveEvents]
  );

  const handleNewEvent = () => {
    const startDate = new Date(selectedDate);
    startDate.setHours(12, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setHours(13, 0, 0, 0);

    setEditingEvent({
      id: "",
      household_id: DEV_HOUSEHOLD_ID,
      title: "",
      start_time: startDate.toISOString(),
      end_time: endDate.toISOString(),
      all_day: false,
      description: "",
      color: "orange",
      repeat_rule: "none",
      notification_minutes: 0,
      notifications: [],
      linked_recipe_id: null,
      linked_list_id: null,
      linked_page_id: null,
    });
    setShowEditor(true);
  };

  const handleEditEvent = (ev: CalendarEvent) => {
    if (ev.repeat_rule !== "none") {
      setPendingEdit({ event: ev, dateKey: toDateKey(selectedDate) });
      setShowRecurringPrompt(true);
    } else {
      setEditingEvent({ ...ev });
      setShowEditor(true);
    }
  };

  const handleRecurringChoice = (editAll: boolean) => {
    if (!pendingEdit) return;
    setShowRecurringPrompt(false);

    if (editAll) {
      setEditingEvent({ ...pendingEdit.event });
      setShowEditor(true);
    } else {
      const ev = { ...pendingEdit.event };
      setEditingEvent({
        ...ev,
        id: ev.id,
        _singleEditDate: pendingEdit.dateKey,
      } as any);
      setShowEditor(true);
    }
    setPendingEdit(null);
  };

  const handleSaveEvent = (ev: CalendarEvent) => {
    const singleEditDate = (ev as any)._singleEditDate;
    delete (ev as any)._singleEditDate;

    if (singleEditDate && ev.id) {
      const updated = events.map((e) => {
        if (e.id !== ev.id) return e;
        const edits = { ...(e.recurring_edits || {}) };
        edits[singleEditDate] = {
          title: ev.title,
          start_time: ev.start_time,
          end_time: ev.end_time,
          all_day: ev.all_day,
          description: ev.description,
          color: ev.color,
          notification_minutes: ev.notification_minutes,
          notifications: ev.notifications,
        };
        return { ...e, recurring_edits: edits };
      });
      updateEvents(updated);
    } else if (ev.id) {
      updateEvents(events.map((e) => (e.id === ev.id ? ev : e)));
    } else {
      updateEvents([...events, { ...ev, id: generateId() }]);
    }
    setShowEditor(false);
    setEditingEvent(null);
  };

  /** Auto-save for existing events — saves without closing the editor */
  const handleAutoSaveEvent = useCallback(
    (ev: CalendarEvent) => {
      const singleEditDate = (ev as any)._singleEditDate;

      if (singleEditDate && ev.id) {
        setEvents((prev) => {
          const updated = prev.map((e) => {
            if (e.id !== ev.id) return e;
            const edits = { ...(e.recurring_edits || {}) };
            edits[singleEditDate] = {
              title: ev.title,
              start_time: ev.start_time,
              end_time: ev.end_time,
              all_day: ev.all_day,
              description: ev.description,
              color: ev.color,
              notification_minutes: ev.notification_minutes,
              notifications: ev.notifications,
            };
            return { ...e, recurring_edits: edits };
          });
          saveEvents(updated);
          return updated;
        });
      } else if (ev.id) {
        setEvents((prev) => {
          const updated = prev.map((e) => (e.id === ev.id ? ev : e));
          saveEvents(updated);
          return updated;
        });
      }
    },
    [saveEvents]
  );

  const handleDeleteEvent = (id: string, mode: "all" | "single" | "future" = "all", dateKey?: string) => {
    if (mode === "all") {
      updateEvents(events.filter((e) => e.id !== id));
    } else if (mode === "single" && dateKey) {
      updateEvents(
        events.map((e) => {
          if (e.id !== id) return e;
          const exceptions = [...(e.recurring_exception_dates || [])];
          if (!exceptions.includes(dateKey)) exceptions.push(dateKey);
          // Also remove any single-occurrence edits for this date
          const edits = { ...(e.recurring_edits || {}) };
          delete edits[dateKey];
          return { ...e, recurring_exception_dates: exceptions, recurring_edits: edits };
        })
      );
    } else if (mode === "future" && dateKey) {
      updateEvents(
        events.map((e) => {
          if (e.id !== id) return e;
          return { ...e, end_repeat_date: dateKey };
        })
      );
    }
    setShowEditor(false);
    setEditingEvent(null);
  };

  // ── Navigation ─────────────────────────────────────────────────

  const goToPrevMonth = useCallback(() => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  }, [currentMonth]);

  const goToNextMonth = useCallback(() => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  }, [currentMonth]);

  // ── Derived data (3 months: prev, current, next) ────────────────

  const selectedDayEvents = useMemo(() => getEventsForDate(events, selectedDate), [events, selectedDate]);

  const [prevYear, prevMonth] = useMemo<[number, number]>(
    () => (currentMonth === 0 ? [currentYear - 1, 11] : [currentYear, currentMonth - 1]),
    [currentYear, currentMonth]
  );
  const [nextYear, nextMonth] = useMemo<[number, number]>(
    () => (currentMonth === 11 ? [currentYear + 1, 0] : [currentYear, currentMonth + 1]),
    [currentYear, currentMonth]
  );

  const curData = useMemo(() => computeMonthGridData(currentYear, currentMonth, events), [currentYear, currentMonth, events]);
  const prevData = useMemo(() => computeMonthGridData(prevYear, prevMonth, events), [prevYear, prevMonth, events]);
  const nextData = useMemo(() => computeMonthGridData(nextYear, nextMonth, events), [nextYear, nextMonth, events]);

  // ── Swipe gesture with 3-panel track ──────────────────────────
  const touchStartXRef = useRef<number | null>(null);
  const swipingRef = useRef(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const isTransitioningRef = useRef(false);

  // Grid uses height: 58dvh (viewport-relative CSS, set inline in JSX).
  // dvh = dynamic viewport height → automatically correct on iOS/Android,
  // accounts for browser chrome. No ResizeObserver needed.

  const animateToMonth = useCallback((direction: "prev" | "next") => {
    if (isTransitioningRef.current) return;
    const track = trackRef.current;
    if (!track) return;
    isTransitioningRef.current = true;

    // Enable transition & slide to prev or next panel
    track.style.transition = "transform 200ms cubic-bezier(0.25, 0.1, 0.25, 1)";
    track.style.transform = direction === "next"
      ? "translateX(-66.6667%)"
      : "translateX(0%)";

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      track.removeEventListener("transitionend", finish);
      // Update month state (this re-renders with new prev/cur/next)
      if (direction === "next") {
        goToNextMonth();
      } else {
        goToPrevMonth();
      }
      // Instantly snap back to center without transition
      track.style.transition = "none";
      track.style.transform = "translateX(-33.3333%)";
      // Force reflow so the snap is instant before next paint
      void track.offsetHeight;
      isTransitioningRef.current = false;
      swipingRef.current = false;
    };
    track.addEventListener("transitionend", finish);
    // Safety fallback in case transitionend doesn't fire
    setTimeout(finish, 250);
  }, [goToNextMonth, goToPrevMonth]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!swipingRef.current) {
      touchStartXRef.current = e.touches[0].clientX;
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartXRef.current === null || swipingRef.current) return;
    const diff = touchStartXRef.current - e.changedTouches[0].clientX;
    touchStartXRef.current = null;

    if (Math.abs(diff) > 50) {
      swipingRef.current = true;
      animateToMonth(diff > 0 ? "next" : "prev");
    }
  }, [animateToMonth]);

  const handleDayClick = useCallback((date: Date) => {
    setSelectedDate(date);
    if (date.getMonth() !== currentMonth || date.getFullYear() !== currentYear) {
      setCurrentMonth(date.getMonth());
      setCurrentYear(date.getFullYear());
    }
  }, [currentMonth, currentYear]);

  return (
    // Screen container: fills the MainShell "absolute inset-0" slot.
    // paddingTop pushes content below the status bar via safe-area-inset-top.
    <div
      className="absolute inset-0 flex flex-col overflow-hidden"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      {/* Screen Header */}
      <div className="flex-shrink-0 px-4 pt-4 pb-2" style={{ background: "var(--zu-bg)" }}>
        <h2 className="text-lg font-bold text-text-1">Kalender</h2>
      </div>

      {/* Month Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 py-2 bg-surface rounded-t-[16px]">
        <button
          onClick={() => animateToMonth("prev")}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-text-3 hover:text-text-1 hover:bg-surface-2 transition"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h2 className="text-sm font-bold text-text-1">
          {MONTHS_DE[currentMonth]} {currentYear}
        </h2>
        <button
          onClick={() => animateToMonth("next")}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-text-3 hover:text-text-1 hover:bg-surface-2 transition"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Calendar Grid — 3-panel track: [prev] [current] [next]
          height: 58dvh — fixed proportion of the dynamic viewport height.
          dvh already accounts for browser chrome / address bar on mobile.
          The grid never scrolls; MonthGrid rows distribute height via flex:1. */}
      <div
        className="flex-shrink-0 bg-surface px-1 pb-1 pt-1 overflow-hidden rounded-b-[16px]"
        style={{ boxShadow: "var(--shadow-card)", height: "58dvh" }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          ref={trackRef}
          style={{
            display: "flex",
            width: "300%",
            height: "100%",
            transform: "translateX(-33.3333%)",
            willChange: "transform",
          }}
        >
          <MonthGrid
            data={prevData}
            selectedDate={selectedDate}
            highlightMonth={prevMonth}
            today={today}
            isDark={isDark}
            onDayClick={handleDayClick}
          />
          <MonthGrid
            data={curData}
            selectedDate={selectedDate}
            highlightMonth={currentMonth}
            today={today}
            isDark={isDark}
            onDayClick={handleDayClick}
          />
          <MonthGrid
            data={nextData}
            selectedDate={selectedDate}
            highlightMonth={nextMonth}
            today={today}
            isDark={isDark}
            onDayClick={handleDayClick}
          />
        </div>
      </div>

      {/* Event Panel — takes all remaining space; min-height so it's always visible */}
      <div className="flex flex-col min-h-0 overflow-hidden" style={{ flex: 1, minHeight: 120, background: "var(--zu-bg)" }}>
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-3">
          <h3 className="text-sm font-bold text-text-1">{formatDateLong(selectedDate)}</h3>
          <button
            onClick={handleNewEvent}
            className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-white shadow-sm hover:bg-accent-dark transition active:scale-95"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* paddingBottom includes env(safe-area-inset-bottom) for the gesture bar */}
        <div
          className="flex-1 min-h-0 px-4 overflow-y-auto"
          style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
        >
          {selectedDayEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-text-3">
              <p className="text-sm">Keine Termine</p>
            </div>
          ) : (
            <div className="space-y-2">
              {selectedDayEvents.map((ev) => {
                const hasAssigned = ev.assigned_to && ev.assigned_to.length > 0;
                const hasNote = !!ev.description;
                const hasLink = ev.linked_recipe_id != null || ev.linked_list_id != null || ev.linked_page_id != null;
                const hasRepeat = ev.repeat_rule !== "none";
                const hasMeta = hasAssigned || hasNote || hasLink || hasRepeat;

                return (
                  <button
                    key={`${ev.id}-${toDateKey(selectedDate)}`}
                    onClick={() => handleEditEvent(ev)}
                    className="w-full flex items-stretch bg-surface rounded-xl overflow-hidden transition active:scale-[0.98]"
                    style={{ boxShadow: "var(--shadow-card)" }}
                  >
                    <div className="w-1.5 flex-shrink-0" style={{ backgroundColor: getColorHex(ev.color) }} />
                    <div className="flex-1 flex items-center gap-3 px-3 py-2.5 min-w-0">
                      <div className="flex-shrink-0 text-xs text-text-3 w-12 text-right">
                        {ev.all_day ? (
                          <span className="font-medium text-text-3">Ganzt.</span>
                        ) : (
                          <span>{formatTime(ev.start_time)}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-text-1 truncate text-left">{ev.title}</p>
                      </div>
                      {hasMeta && (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {hasAssigned && (
                            <div className="flex items-center flex-shrink-0">
                              {ev.assigned_to!.map((memberId, idx) => {
                                const member = DEV_MEMBERS.find((m) => m.id === memberId);
                                if (!member) return null;
                                const initial = member.display_name.charAt(0).toUpperCase();
                                return member.avatar_url ? (
                                  <img
                                    key={member.id}
                                    src={member.avatar_url}
                                    alt={member.display_name}
                                    className="w-6 h-6 rounded-full object-cover ring-2 ring-surface"
                                    style={{ marginLeft: idx > 0 ? -8 : 0 }}
                                  />
                                ) : (
                                  <div
                                    key={member.id}
                                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white ring-2 ring-surface"
                                    style={{ backgroundColor: member.initials_color, marginLeft: idx > 0 ? -8 : 0 }}
                                  >
                                    {initial}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {hasNote && <FileText className="w-4 h-4 text-text-3 flex-shrink-0" />}
                          {hasLink && <Link className="w-4 h-4 text-text-3 flex-shrink-0" />}
                          {hasRepeat && <Repeat className="w-4 h-4 text-text-3 flex-shrink-0" />}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Event Editor Bottom Sheet */}
      <AnimatePresence>
        {showEditor && editingEvent && (
          <EventEditorSheet
            event={editingEvent}
            contextDateKey={toDateKey(selectedDate)}
            labels={labels}
            allEvents={events}
            onSave={handleSaveEvent}
            onAutoSave={handleAutoSaveEvent}
            onDelete={editingEvent.id ? (mode: "all" | "single" | "future", dateKey?: string) => handleDeleteEvent(editingEvent.id, mode, dateKey) : undefined}
            onNavigate={onNavigate}
            onClose={() => {
              setShowEditor(false);
              setEditingEvent(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* Recurring edit prompt */}
      <AnimatePresence>
        {showRecurringPrompt && (
          <RecurringPrompt
            onEditAll={() => handleRecurringChoice(true)}
            onEditSingle={() => handleRecurringChoice(false)}
            onCancel={() => {
              setShowRecurringPrompt(false);
              setPendingEdit(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Recurring Prompt ───────────────────────────────────────────────

function RecurringPrompt({
  onEditAll,
  onEditSingle,
  onCancel,
}: {
  onEditAll: () => void;
  onEditSingle: () => void;
  onCancel: () => void;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-[1000] flex items-end justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <motion.div
        className="relative w-full bg-surface rounded-t-[20px] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
        style={{ boxShadow: "var(--shadow-elevated)" }}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
      >
        <div className="flex justify-center mb-4">
          <div className="w-9 h-1 rounded-full" style={{ background: "var(--zu-border)" }} />
        </div>
        <div className="space-y-2">
          <button
            onClick={onEditSingle}
            className="w-full py-3 rounded-full bg-surface-2 text-text-2 font-semibold text-sm hover:bg-surface-2 transition"
          >
            Nur dieses Event ändern
          </button>
          <button
            onClick={onEditAll}
            className="w-full py-3 rounded-full bg-accent text-white font-semibold text-sm hover:bg-accent-dark transition"
          >
            Alle Wiederholungen ändern
          </button>
          
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Drum Roll Picker ───────────────────────────────────────────────

const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, i) => i * 5);
const ITEM_HEIGHT = 40;
const VISIBLE_ITEMS = 5;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

function DrumWheel({
  items,
  selectedIndex,
  onSelect,
  renderItem,
}: {
  items: readonly any[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  renderItem: (item: any, index: number) => string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(-selectedIndex * ITEM_HEIGHT);
  const offsetRef = useRef(-selectedIndex * ITEM_HEIGHT);
  const dragRef = useRef({
    active: false,
    startY: 0,
    startOffset: 0,
    lastY: 0,
    lastTime: 0,
    velocity: 0,
  });
  const animRef = useRef<number>(0);
  const didMount = useRef(false);

  const maxOffset = 0;
  const minOffset = -(items.length - 1) * ITEM_HEIGHT;
  const paddingTop = Math.floor(VISIBLE_ITEMS / 2) * ITEM_HEIGHT;

  const snapTo = useCallback((index: number) => {
    cancelAnimationFrame(animRef.current);
    const target = -index * ITEM_HEIGHT;
    const start = offsetRef.current;
    const distance = target - start;
    if (Math.abs(distance) < 0.5) {
      offsetRef.current = target;
      setOffset(target);
      return;
    }
    const duration = 250;
    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + distance * eased;
      offsetRef.current = current;
      setOffset(current);
      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate);
      }
    };
    animRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    const target = -selectedIndex * ITEM_HEIGHT;
    offsetRef.current = target;
    setOffset(target);
    didMount.current = true;
  }, []);

  useEffect(() => {
    if (!didMount.current) return;
    if (!dragRef.current.active) {
      snapTo(selectedIndex);
    }
  }, [selectedIndex, snapTo]);

  useEffect(() => {
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  const handleDragStart = useCallback((clientY: number) => {
    cancelAnimationFrame(animRef.current);
    dragRef.current = {
      active: true,
      startY: clientY,
      startOffset: offsetRef.current,
      lastY: clientY,
      lastTime: performance.now(),
      velocity: 0,
    };
  }, []);

  const handleDragMove = useCallback(
    (clientY: number) => {
      if (!dragRef.current.active) return;
      const delta = clientY - dragRef.current.startY;
      const now = performance.now();
      const dt = now - dragRef.current.lastTime;
      if (dt > 0) {
        dragRef.current.velocity = (clientY - dragRef.current.lastY) / dt;
      }
      dragRef.current.lastY = clientY;
      dragRef.current.lastTime = now;

      let newOffset = dragRef.current.startOffset + delta;
      if (newOffset > maxOffset) {
        newOffset = maxOffset + (newOffset - maxOffset) * 0.3;
      } else if (newOffset < minOffset) {
        newOffset = minOffset + (newOffset - minOffset) * 0.3;
      }
      offsetRef.current = newOffset;
      setOffset(newOffset);
    },
    [maxOffset, minOffset]
  );

  const handleDragEnd = useCallback(() => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;

    const velocityPx = dragRef.current.velocity * 120;
    const projected = offsetRef.current + velocityPx;
    const targetIdx = Math.round(-projected / ITEM_HEIGHT);
    const clamped = Math.max(0, Math.min(items.length - 1, targetIdx));

    snapTo(clamped);
    onSelect(clamped);
  }, [items.length, onSelect, snapTo]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current.active) return;
      e.preventDefault();
      handleDragMove(e.clientY);
    };
    const handleMouseUp = () => {
      if (!dragRef.current.active) return;
      handleDragEnd();
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleDragMove, handleDragEnd]);

  const centerIdx = Math.round(-offset / ITEM_HEIGHT);

  return (
    <div
      ref={containerRef}
      className="h-full overflow-hidden relative touch-none select-none cursor-grab active:cursor-grabbing"
      onTouchStart={(e) => handleDragStart(e.touches[0].clientY)}
      onTouchMove={(e) => {
        e.preventDefault();
        handleDragMove(e.touches[0].clientY);
      }}
      onTouchEnd={handleDragEnd}
      onMouseDown={(e) => {
        e.preventDefault();
        handleDragStart(e.clientY);
      }}
    >
      <div style={{ transform: `translateY(${offset + paddingTop}px)` }}>
        {items.map((item, i) => {
          const isCenter = i === centerIdx;
          return (
            <div key={i} style={{ height: ITEM_HEIGHT }} className="flex items-center justify-center">
              <span
                className={`transition-all duration-100 text-sm ${
                  isCenter ? "font-medium text-text-1" : "font-normal text-text-3"
                }`}
              >
                {renderItem(item, i)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Date Time Picker Bottom Sheet ──────────────────────────────────

function DateTimePickerSheet({
  value,
  allDay,
  onChange,
  onClose,
}: {
  value: string;
  allDay: boolean;
  onChange: (iso: string) => void;
  onClose: () => void;
}) {
  const d = new Date(value);
  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(
    () => Array.from({ length: 11 }, (_, i) => currentYear - 5 + i),
    [currentYear]
  );
  const dayOptions = useMemo(() => Array.from({ length: 31 }, (_, i) => i + 1), []);

  const [dayIdx, setDayIdx] = useState(d.getDate() - 1);
  const [monthIdx, setMonthIdx] = useState(d.getMonth());
  const [yearIdx, setYearIdx] = useState(() => {
    const idx = yearOptions.indexOf(d.getFullYear());
    return idx >= 0 ? idx : 5;
  });
  const [hourIdx, setHourIdx] = useState(d.getHours());
  const [minuteIdx, setMinuteIdx] = useState(() => {
    const m = d.getMinutes();
    const snapped = Math.round(m / 5);
    return snapped >= 12 ? 11 : snapped;
  });

  const handleDone = () => {
    const selectedYear = yearOptions[yearIdx];
    const selectedMonth = monthIdx;
    const maxDay = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const selectedDay = Math.min(dayIdx + 1, maxDay);
    const selectedHour = allDay ? 0 : hourIdx;
    const selectedMinute = allDay ? 0 : MINUTE_OPTIONS[minuteIdx];
    const newDate = new Date(selectedYear, selectedMonth, selectedDay, selectedHour, selectedMinute, 0);
    onChange(newDate.toISOString());
    onClose();
  };

  return (
    <motion.div
      className="fixed inset-0 z-[1000] flex items-end justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <motion.div
        className="relative w-full bg-surface rounded-t-[20px] flex flex-col"
        style={{ boxShadow: "var(--shadow-elevated)" }}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-9 h-1 rounded-full" style={{ background: "var(--zu-border)" }} />
        </div>

        {/* Drum wheels container */}
        <div className="relative px-3 pb-4">
          <div
            className="absolute left-3 right-3 bg-accent-light border-y border-accent-mid pointer-events-none z-10 rounded-lg"
            style={{
              top: `${Math.floor(VISIBLE_ITEMS / 2) * ITEM_HEIGHT}px`,
              height: `${ITEM_HEIGHT}px`,
            }}
          />

          <div className="flex gap-0" style={{ height: WHEEL_HEIGHT }}>
            <div className="flex-1 relative z-20">
              <DrumWheel
                items={dayOptions}
                selectedIndex={dayIdx}
                onSelect={setDayIdx}
                renderItem={(item) => String(item).padStart(2, "0")}
              />
            </div>
            <div className="flex-1 relative z-20">
              <DrumWheel
                items={MONTHS_SHORT}
                selectedIndex={monthIdx}
                onSelect={setMonthIdx}
                renderItem={(item) => item}
              />
            </div>
            <div className="flex-1 relative z-20">
              <DrumWheel
                items={yearOptions}
                selectedIndex={yearIdx}
                onSelect={setYearIdx}
                renderItem={(item) => String(item)}
              />
            </div>
            {!allDay && (
              <>
                <div className="w-px my-4 flex-shrink-0" style={{ background: "var(--zu-border)" }} />
                <div className="flex-1 relative z-20">
                  <DrumWheel
                    items={Array.from({ length: 24 }, (_, i) => i)}
                    selectedIndex={hourIdx}
                    onSelect={setHourIdx}
                    renderItem={(item) => String(item).padStart(2, "0")}
                  />
                </div>
                <div className="flex items-center justify-center w-3 relative z-20">
                  <span className="text-sm font-medium text-text-1">:</span>
                </div>
                <div className="flex-1 relative z-20">
                  <DrumWheel
                    items={MINUTE_OPTIONS}
                    selectedIndex={minuteIdx}
                    onSelect={setMinuteIdx}
                    renderItem={(item) => String(item).padStart(2, "0")}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        <div className="px-5 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <button
            onClick={handleDone}
            className="w-full py-3 rounded-full bg-accent text-white font-semibold text-sm hover:bg-accent-dark transition"
          >
            Fertig
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Custom Notification Drum Roll Sheet ────────────────────────────

const CUSTOM_UNITS = [
  { label: "Minuten", factor: 1 },
  { label: "Stunden", factor: 60 },
  { label: "Tage", factor: 1440 },
];

function CustomNotificationSheet({
  onSelect,
  onClose,
}: {
  onSelect: (minutes: number) => void;
  onClose: () => void;
}) {
  const numberOptions = useMemo(() => Array.from({ length: 60 }, (_, i) => i + 1), []);
  const [numberIdx, setNumberIdx] = useState(9);
  const [unitIdx, setUnitIdx] = useState(0);

  const handleDone = () => {
    const num = numberOptions[numberIdx];
    const factor = CUSTOM_UNITS[unitIdx].factor;
    onSelect(num * factor);
    onClose();
  };

  return (
    <motion.div
      className="fixed inset-0 z-[1000] flex items-end justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <motion.div
        className="relative w-full bg-surface rounded-t-[20px] flex flex-col"
        style={{ boxShadow: "var(--shadow-elevated)" }}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-9 h-1 rounded-full" style={{ background: "var(--zu-border)" }} />
        </div>

        <div className="relative px-3 pb-4">
          <div
            className="absolute left-3 right-3 bg-accent-light border-y border-accent-mid pointer-events-none z-10 rounded-lg"
            style={{
              top: `${Math.floor(VISIBLE_ITEMS / 2) * ITEM_HEIGHT}px`,
              height: `${ITEM_HEIGHT}px`,
            }}
          />
          <div className="flex gap-0" style={{ height: WHEEL_HEIGHT }}>
            <div className="flex-1 relative z-20">
              <DrumWheel
                items={numberOptions}
                selectedIndex={numberIdx}
                onSelect={setNumberIdx}
                renderItem={(item) => String(item)}
              />
            </div>
            <div className="flex-[1.5] relative z-20">
              <DrumWheel
                items={CUSTOM_UNITS}
                selectedIndex={unitIdx}
                onSelect={setUnitIdx}
                renderItem={(item) => item.label}
              />
            </div>
          </div>
        </div>

        <div className="px-5 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <button
            onClick={handleDone}
            className="w-full py-3 rounded-full bg-accent text-white font-semibold text-sm hover:bg-accent-dark transition"
          >
            Fertig
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Generic Popup Sheet (no title) ─────────────────────────────────

function PopupSheet({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-[1000] flex items-end justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <motion.div
        className="relative w-full bg-surface rounded-t-[20px] flex flex-col"
        style={{ maxHeight: "60dvh", boxShadow: "var(--shadow-elevated)" }}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-9 h-1 rounded-full" style={{ background: "var(--zu-border)" }} />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {children}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Delete Confirmation Modal ──────────────────────────────────────

function DeleteConfirmModal({
  isRecurring,
  onDeleteAll,
  onDeleteSingle,
  onDeleteFuture,
  onCancel,
}: {
  isRecurring: boolean;
  onDeleteAll: () => void;
  onDeleteSingle?: () => void;
  onDeleteFuture?: () => void;
  onCancel: () => void;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-[1000] flex items-end justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/40" onClick={(e) => { e.stopPropagation(); onCancel(); }} />
      {isRecurring ? (
        <motion.div
          className="relative w-full bg-surface rounded-t-[20px] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
          style={{ boxShadow: "var(--shadow-elevated)" }}
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-center mb-4">
            <div className="w-9 h-1 rounded-full" style={{ background: "var(--zu-border)" }} />
          </div>
          <h3 className="text-base font-bold text-text-1 text-center mb-1">Wiederkehrendes Event löschen</h3>
          <p className="text-sm text-text-3 text-center mb-4">
            Wie soll dieses wiederkehrende Event gelöscht werden?
          </p>
          <div className="space-y-2">
            <button
              onClick={onDeleteSingle}
              className="w-full py-3 rounded-full bg-surface-2 text-text-2 font-semibold text-sm hover:bg-surface-2 transition"
            >
              Nur dieses Event löschen
            </button>
            <button
              onClick={onDeleteFuture}
              className="w-full py-3 rounded-full bg-surface-2 text-text-2 font-semibold text-sm hover:bg-surface-2 transition"
            >
              Dieses und alle folgenden löschen
            </button>
            <button
              onClick={onDeleteAll}
              className="w-full py-3 rounded-full bg-danger text-white font-semibold text-sm hover:bg-danger transition"
            >
              Alle Wiederholungen löschen
            </button>
          </div>
        </motion.div>
      ) : (
        <motion.div
          className="relative w-full bg-surface rounded-t-[20px] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
          style={{ boxShadow: "var(--shadow-elevated)" }}
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-center mb-4">
            <div className="w-9 h-1 rounded-full" style={{ background: "var(--zu-border)" }} />
          </div>
          <h3 className="text-base font-bold text-text-1 text-center">Event löschen?</h3>
          <p className="text-sm text-text-3 text-center mt-2 mb-5">
            Diese Aktion kann nicht rückgängig gemacht werden.
          </p>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-full bg-surface-2 text-text-2 text-sm font-semibold transition"
            >
              Abbrechen
            </button>
            <button
              onClick={onDeleteAll}
              className="flex-1 py-2.5 rounded-full bg-danger text-white text-sm font-semibold transition"
            >
              Löschen
            </button>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

// ── Note Picker Drawer ─────────────────────────────────────────────

function NotePickerDrawer({
  pages,
  selectedPageId,
  onSelect,
  onClose,
}: {
  pages: { id: string; title: string; icon: string; parent_id: string | null; position: number }[];
  selectedPageId: string | null;
  onSelect: (pageId: string | null) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => searchRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  const filteredPages = useMemo(() => {
    if (!search.trim()) return pages;
    const q = search.trim().toLowerCase();
    return pages.filter((p) => p.title.toLowerCase().includes(q));
  }, [pages, search]);

  return (
    <motion.div
      className="fixed inset-0 z-[1000] flex items-end justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div
        className="absolute inset-0 bg-black/40"
        style={{ touchAction: "none" }}
        onClick={onClose}
      />
      <motion.div
        className="relative w-full bg-surface rounded-t-[20px] flex flex-col"
        style={{ height: "40dvh", boxShadow: "var(--shadow-elevated)", left: 0, right: 0 }}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
          <div className="w-9 h-1 rounded-full" style={{ background: "var(--zu-border)" }} />
        </div>

        {/* Search field */}
        <div className="px-4 pb-2 flex-shrink-0">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: "var(--surface-2)" }}>
            <Search className="w-4 h-4 text-text-3 flex-shrink-0" />
            <input
              ref={searchRef}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Notiz suchen..."
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              data-form-type="other"
              inputMode="text"
              className="flex-1 text-sm text-text-1 placeholder:text-text-3 outline-none bg-transparent"
              style={{ caretColor: "#F97316" }}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="w-5 h-5 flex items-center justify-center text-text-3"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 min-h-0 overflow-y-auto pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
          {/* "Keine Notiz" option */}
          <button
            onClick={() => onSelect(null)}
            className="w-full flex items-center px-5 py-3 active:bg-surface-2 transition-colors"
            style={{ borderBottom: "1px solid var(--zu-border)" }}
          >
            <span className="flex-1 text-sm text-text-1 text-left">Keine Notiz</span>
            {selectedPageId === null && <Check className="w-4 h-4 text-accent flex-shrink-0" />}
          </button>

          {filteredPages.map((page) => (
            <button
              key={page.id}
              onClick={() => onSelect(page.id)}
              className="w-full flex items-center gap-3 px-5 py-3 active:bg-surface-2 transition-colors"
              style={{ borderBottom: "1px solid var(--zu-border)" }}
            >
              <span className="text-base flex-shrink-0">{page.icon || "📄"}</span>
              <span className="flex-1 text-sm text-text-1 text-left truncate">{page.title || "Ohne Titel"}</span>
              {selectedPageId === page.id && <Check className="w-4 h-4 text-accent flex-shrink-0" />}
            </button>
          ))}

          {filteredPages.length === 0 && search.trim() && (
            <div className="px-5 py-6 text-center">
              <p className="text-sm text-text-3">Keine Notizen gefunden</p>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Recipe Picker Drawer ───────────────────────────────────────────

function RecipePickerDrawer({
  recipes,
  selectedRecipeId,
  onSelect,
  onClose,
}: {
  recipes: { id: string; title: string; description: string; categories: string[]; image_url: string | null }[];
  selectedRecipeId: string | null;
  onSelect: (recipeId: string | null) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => searchRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  const filteredRecipes = useMemo(() => {
    if (!search.trim()) return recipes;
    const q = search.trim().toLowerCase();
    return recipes.filter((r) => r.title.toLowerCase().includes(q));
  }, [recipes, search]);

  return (
    <motion.div
      className="fixed inset-0 z-[1000] flex items-end justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div
        className="absolute inset-0 bg-black/40"
        style={{ touchAction: "none" }}
        onClick={onClose}
      />
      <motion.div
        className="relative w-full bg-surface rounded-t-[20px] flex flex-col"
        style={{ height: "40dvh", boxShadow: "var(--shadow-elevated)", left: 0, right: 0 }}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
          <div className="w-9 h-1 rounded-full" style={{ background: "var(--zu-border)" }} />
        </div>

        {/* Search field */}
        <div className="px-4 pb-2 flex-shrink-0">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: "var(--surface-2)" }}>
            <Search className="w-4 h-4 text-text-3 flex-shrink-0" />
            <input
              ref={searchRef}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rezept suchen..."
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              data-form-type="other"
              inputMode="text"
              className="flex-1 text-sm text-text-1 placeholder:text-text-3 outline-none bg-transparent"
              style={{ caretColor: "#F97316" }}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="w-5 h-5 flex items-center justify-center text-text-3"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 min-h-0 overflow-y-auto pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
          {/* "Kein Rezept" option at the top */}
          <button
            onClick={() => onSelect(null)}
            className="w-full flex items-center px-5 py-3 active:bg-surface-2 transition-colors"
            style={{ borderBottom: "1px solid var(--zu-border)" }}
          >
            <span className="flex-1 text-sm text-text-1 text-left">Kein Rezept</span>
            {selectedRecipeId === null && <Check className="w-4 h-4 text-accent flex-shrink-0" />}
          </button>

          {filteredRecipes.map((recipe) => (
            <button
              key={recipe.id}
              onClick={() => onSelect(recipe.id)}
              className="w-full flex items-center gap-3 px-5 py-3 active:bg-surface-2 transition-colors"
              style={{ borderBottom: "1px solid var(--zu-border)" }}
            >
              <span className="text-base flex-shrink-0">🍳</span>
              <span className="flex-1 text-sm text-text-1 text-left truncate">{recipe.title}</span>
              {selectedRecipeId === recipe.id && <Check className="w-4 h-4 text-accent flex-shrink-0" />}
            </button>
          ))}

          {filteredRecipes.length === 0 && search.trim() && (
            <div className="px-5 py-6 text-center">
              <p className="text-sm text-text-3">Keine Rezepte gefunden</p>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Event Editor Bottom Sheet ──────────────────────────────────────

const NOTIFICATION_PRESETS: { value: number; label: string }[] = [
  { value: 0, label: "Zum Zeitpunkt" },
  { value: 5, label: "5 Minuten vorher" },
  { value: 10, label: "10 Minuten vorher" },
  { value: 30, label: "30 Minuten vorher" },
  { value: 60, label: "1 Stunde vorher" },
  { value: 1440, label: "1 Tag vorher" },
];

function EventEditorSheet({
  event,
  contextDateKey,
  labels,
  allEvents,
  onSave,
  onAutoSave,
  onDelete,
  onNavigate,
  onClose,
}: {
  event: CalendarEvent;
  contextDateKey: string;
  labels: CalendarLabel[];
  allEvents: CalendarEvent[];
  onSave: (ev: CalendarEvent) => void;
  onAutoSave: (ev: CalendarEvent) => void;
  onDelete?: (mode: "all" | "single" | "future", dateKey?: string) => void;
  onNavigate?: (tab: string, itemId?: string | null) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(event.title);
  const [startTime, setStartTime] = useState(event.start_time);
  const [endTime, setEndTime] = useState(event.end_time);
  const [allDay, setAllDay] = useState(event.all_day);
  const [repeatRule, setRepeatRule] = useState<RepeatRule>(event.repeat_rule);
  const [color, setColor] = useState<EventColor>(event.color);
  const [description, setDescription] = useState(event.description);
  const [notifications, setNotifications] = useState<number[]>(() => {
    if (event.notifications?.length) return [...event.notifications];
    if (event.notification_minutes > 0) return [event.notification_minutes];
    return [];
  });
  const [assignedTo, setAssignedTo] = useState<string[]>(event.assigned_to || []);
  const [linkedPageId, setLinkedPageId] = useState<string | null>(event.linked_page_id ?? null);
  const [linkedRecipeId, setLinkedRecipeId] = useState<string | null>(event.linked_recipe_id ?? null);

  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [showLabelPopup, setShowLabelPopup] = useState(false);
  const [showRepeatPopup, setShowRepeatPopup] = useState(false);
  const [showNotificationPopup, setShowNotificationPopup] = useState(false);
  const [showCustomNotification, setShowCustomNotification] = useState(false);
  const [editingNote, setEditingNote] = useState(!!event.description);
  const [showRecipePickerDrawer, setShowRecipePickerDrawer] = useState(false);
  const [showNotePickerDrawer, setShowNotePickerDrawer] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // ── visualViewport height for dynamic maxHeight ────────────────
  const [vpHeight, setVpHeight] = useState(() => window.visualViewport?.height ?? window.innerHeight);
  useEffect(() => {
    const vp = window.visualViewport;
    if (!vp) return;
    const update = () => setVpHeight(vp.height);
    vp.addEventListener("resize", update);
    update();
    return () => vp.removeEventListener("resize", update);
  }, []);
  // Always leave 72 px visible above the drawer so it looks like a sheet, not a full screen
  const drawerMaxHeight = vpHeight - 72;

  // ── Pages for note linking ─────────────────────────────────────
  interface LinkedPage { id: string; title: string; icon: string; parent_id: string | null; position: number; }
  const [availablePages, setAvailablePages] = useState<LinkedPage[]>([]);
  const [pagesLoaded, setPagesLoaded] = useState(false);

  // ── Recipes for recipe linking ────────────────────────────────
  interface LinkedRecipe { id: string; title: string; description: string; categories: string[]; image_url: string | null; }
  const [availableRecipes, setAvailableRecipes] = useState<LinkedRecipe[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [pagesRes, recipesRes] = await Promise.all([
          apiFetch(`/custom-pages?household_id=${DEV_HOUSEHOLD_ID}`),
          apiFetch(`/recipes?household_id=${DEV_HOUSEHOLD_ID}`),
        ]);
        setAvailablePages(pagesRes.pages || []);
        setAvailableRecipes(recipesRes.recipes || []);
      } catch (err) {
        console.error("Fehler beim Laden der Seiten/Rezepte:", err);
      } finally {
        setPagesLoaded(true);
      }
    })();
  }, []);

  const linkedPage = useMemo(
    () => linkedPageId ? availablePages.find((p) => p.id === linkedPageId) || null : null,
    [linkedPageId, availablePages]
  );

  const linkedRecipe = useMemo(
    () => linkedRecipeId ? availableRecipes.find((r) => r.id === linkedRecipeId) || null : null,
    [linkedRecipeId, availableRecipes]
  );

  const isNew = !event.id;

  // ── Autocomplete suggestions ──────────────────────────────────
  interface AutocompleteSuggestion {
    title: string;
    start_time: string;
    end_time: string;
    color: EventColor;
    description: string;
    notifications: number[];
    notification_minutes: NotificationMinutes;
    linked_recipe_id: string | null;
    linked_list_id: string | null;
    linked_page_id: string | null;
    all_day: boolean;
    assigned_to?: string[];
  }
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [dismissedTitles, setDismissedTitles] = useState<Set<string>>(new Set());
  const suggestDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Search past events for autocomplete
  useEffect(() => {
    if (!isNew) { setSuggestions([]); return; }
    if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current);

    if (!title.trim() || title.trim().length < 1) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    suggestDebounceRef.current = setTimeout(() => {
      const query = title.trim().toLowerCase();
      // Group events by title (case-insensitive), pick the most recent occurrence
      const titleMap = new Map<string, CalendarEvent>();
      for (const ev of allEvents) {
        const evStart = new Date(ev.start_time);
        if (!ev.title.toLowerCase().includes(query)) continue;
        const key = ev.title.toLowerCase();
        if (dismissedTitles.has(key)) continue;
        const existing = titleMap.get(key);
        if (!existing || new Date(existing.start_time) < evStart) {
          titleMap.set(key, ev);
        }
      }
      // Take up to 5 suggestions sorted by most recent
      const results = Array.from(titleMap.values())
        .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
        .slice(0, 5)
        .map((ev) => ({
          title: ev.title,
          start_time: ev.start_time,
          end_time: ev.end_time,
          color: ev.color,
          description: ev.description,
          notifications: ev.notifications || (ev.notification_minutes > 0 ? [ev.notification_minutes] : []),
          notification_minutes: ev.notification_minutes,
          linked_recipe_id: ev.linked_recipe_id,
          linked_list_id: ev.linked_list_id,
          linked_page_id: ev.linked_page_id,
          all_day: ev.all_day,
          assigned_to: ev.assigned_to,
        }));

      setSuggestions(results);
      setShowSuggestions(results.length > 0);
    }, 200);

    return () => {
      if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current);
    };
  }, [title, allEvents, dismissedTitles]);

  const handleSelectSuggestion = useCallback((s: AutocompleteSuggestion) => {
    // Pre-fill title
    setTitle(s.title);

    // Pre-fill time: keep the selected date but use the old event's time-of-day & duration
    const oldStart = new Date(s.start_time);
    const oldEnd = new Date(s.end_time);
    const durationMs = oldEnd.getTime() - oldStart.getTime();
    const selDate = new Date(startTime); // current selected date from the form
    const newStart = new Date(selDate.getFullYear(), selDate.getMonth(), selDate.getDate(),
      oldStart.getHours(), oldStart.getMinutes(), oldStart.getSeconds());
    const newEnd = new Date(newStart.getTime() + durationMs);
    setStartTime(newStart.toISOString());
    setEndTime(newEnd.toISOString());

    // Pre-fill other fields
    setAllDay(s.all_day);
    setColor(s.color);
    setDescription(s.description);
    setNotifications(s.notifications);
    if (s.assigned_to) setAssignedTo(s.assigned_to);
    if (s.linked_page_id) setLinkedPageId(s.linked_page_id);
    if (s.linked_recipe_id) setLinkedRecipeId(s.linked_recipe_id);
    if (s.description) setEditingNote(true);

    // Hide suggestions
    setShowSuggestions(false);
    setSuggestions([]);
  }, [startTime]);

  const handleDismissSuggestion = useCallback((titleToDismiss: string) => {
    setDismissedTitles((prev) => new Set(prev).add(titleToDismiss.toLowerCase()));
    setSuggestions((prev) => {
      const filtered = prev.filter((s) => s.title.toLowerCase() !== titleToDismiss.toLowerCase());
      if (filtered.length === 0) setShowSuggestions(false);
      return filtered;
    });
  }, []);

  const isFirstRender = useRef(true);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Build current event object from form state
  const buildCurrentEvent = useCallback((): CalendarEvent => {
    return {
      ...event,
      title: title.trim(),
      start_time: startTime,
      end_time: endTime,
      all_day: allDay,
      repeat_rule: repeatRule,
      color,
      description,
      notification_minutes: (notifications[0] ?? 0) as NotificationMinutes,
      notifications,
      assigned_to: assignedTo,
      linked_page_id: linkedPageId,
      linked_recipe_id: linkedRecipeId,
    };
  }, [event, title, startTime, endTime, allDay, repeatRule, color, description, notifications, assignedTo, linkedPageId, linkedRecipeId]);

  // Auto-save for existing events
  const formSnapshot = useMemo(
    () => JSON.stringify({ title, startTime, endTime, allDay, repeatRule, color, description, notifications, assignedTo, linkedPageId, linkedRecipeId }),
    [title, startTime, endTime, allDay, repeatRule, color, description, notifications, assignedTo, linkedPageId, linkedRecipeId]
  );

  useEffect(() => {
    if (isNew) return;
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      const ev = buildCurrentEvent();
      if (ev.title) {
        onAutoSave(ev);
      }
    }, 400);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [formSnapshot, isNew, buildCurrentEvent, onAutoSave]);

  // Track initial snapshot to detect dirty state for new events
  const initialSnapshot = useRef(formSnapshot);

  const isDirty = useCallback(() => {
    return formSnapshot !== initialSnapshot.current;
  }, [formSnapshot]);

  const handleCloseAttempt = useCallback(() => {
    if (isNew && isDirty()) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  }, [isNew, isDirty, onClose]);

  // Force-close: reset ALL overlay states, then call parent onClose
  const forceClose = useCallback(() => {
    setShowStartPicker(false);
    setShowEndPicker(false);
    setShowLabelPopup(false);
    setShowRepeatPopup(false);
    setShowNotificationPopup(false);
    setShowCustomNotification(false);
    setShowRecipePickerDrawer(false);
    setShowNotePickerDrawer(false);
    setShowDeleteConfirm(false);
    setShowDiscardConfirm(false);
    onClose();
  }, [onClose]);

  const handleSave = () => {
    if (!title.trim()) return;
    onSave(buildCurrentEvent());
  };

  const addNotification = (minutes: number) => {
    if (!notifications.includes(minutes)) {
      setNotifications([...notifications, minutes]);
    }
    setShowNotificationPopup(false);
  };

  const removeNotification = (minutes: number) => {
    setNotifications(notifications.filter((n) => n !== minutes));
  };

  // Find matching label for the current color
  const currentLabel = labels.find((l) => l.color === color);
  const repeatLabel = REPEAT_OPTIONS.find((r) => r.value === repeatRule)?.label || "Keine";

  // ── Avatar assignment helpers ───────────────────────────────────
  const toggleAssigned = (memberId: string) => {
    setAssignedTo((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
    );
  };

  // DEV BYPASS: use DEV_MEMBERS; replace with real household members from profiles table
  const householdMembers: HouseholdMember[] = DEV_MEMBERS;

  // ── Row component ──────────────────────────────────────────────
  const FormRow = ({
    icon,
    children,
    onClick,
    noBorder,
  }: {
    icon: React.ReactNode;
    children: React.ReactNode;
    onClick?: () => void;
    noBorder?: boolean;
  }) => {
    const Tag = onClick ? "button" : ("div" as any);
    return (
      <Tag
        onClick={onClick}
        className={`w-full flex items-center px-4 py-3 ${
          noBorder ? "" : ""
        } ${onClick ? "active:bg-surface-2 transition-colors" : ""}`}
        style={noBorder ? undefined : { borderBottom: "1px solid var(--zu-border)" }}
      >
        <div className="w-5 h-5 flex items-center justify-center text-text-3 mr-3 flex-shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0 flex items-center">{children}</div>
      </Tag>
    );
  };

  return (
    <motion.div
      className="fixed inset-0 z-[1000] flex items-end justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/40" onClick={handleCloseAttempt} />
      <motion.div
        className="relative w-full bg-surface rounded-t-[20px] flex flex-col"
        style={{ maxHeight: drawerMaxHeight, boxShadow: "var(--shadow-elevated)" }}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.4 }}
        dragSnapToOrigin
        onDragEnd={(_, info) => {
          if (info.offset.y > 100) handleCloseAttempt();
        }}
      >
        {/* Handle bar */}
        <div className="flex-shrink-0 flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing">
          <div className="w-9 h-1 rounded-full" style={{ background: "var(--zu-border)" }} />
        </div>

        {/* Header — different for new vs edit */}
        {isNew ? (
          <div className="flex items-center justify-end px-4 pb-2 flex-shrink-0">
            <button
              onClick={handleSave}
              disabled={!title.trim()}
              className="text-sm font-semibold text-accent disabled:opacity-40 transition"
            >
              Speichern
            </button>
          </div>
        ) : (
          /* Edit mode: no save button — just the handle bar for swipe-down */
          <div className="h-1" />
        )}

        {/* Title — fixed in header, never scrolls away */}
        <div className="flex-shrink-0 relative" style={{ borderBottom: "1px solid var(--zu-border)" }}>
          <div className="px-4 py-3">
            <input
              ref={titleInputRef}
              type="text"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              data-form-type="other"
              inputMode="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
              onBlur={() => { setTimeout(() => setShowSuggestions(false), 150); }}
              placeholder="Titel hinzufügen"
              className="w-full text-lg text-text-1 placeholder:text-text-3 outline-none bg-transparent"
              style={{ caretColor: "#F97316" }}
              autoFocus={isNew}
            />
          </div>

          {/* Autocomplete suggestions */}
          {isNew && showSuggestions && suggestions.length > 0 && (
            <div
              className="absolute left-3 right-3 z-50 rounded-xl overflow-hidden"
              style={{
                top: "100%",
                background: "var(--surface-2)",
                boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
              }}
            >
                {suggestions.map((s, idx) => {
                  const oldStart = new Date(s.start_time);
                  const timeStr = `${String(oldStart.getHours()).padStart(2, "0")}:${String(oldStart.getMinutes()).padStart(2, "0")}`;
                  return (
                    <div
                      key={`${s.title}-${idx}`}
                      className="flex items-center gap-3 px-3 py-2.5 active:bg-surface transition-colors"
                      style={idx < suggestions.length - 1 ? { borderBottom: "1px solid var(--zu-border)" } : undefined}
                      onPointerDown={(e) => { e.preventDefault(); handleSelectSuggestion(s); }}
                    >
                      <Clock className="w-4 h-4 text-text-3 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-semibold text-text-1 block truncate">{s.title}</span>
                        <span className="text-xs text-text-3">{timeStr} Uhr</span>
                      </div>
                      <button
                        className="w-7 h-7 flex items-center justify-center rounded-full text-text-3 flex-shrink-0 active:bg-surface-2"
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDismissSuggestion(s.title);
                        }}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        {/* Scrollable form rows */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* Ganztägig */}
          <FormRow icon={<Clock className="w-5 h-5" />}>
            <span className="flex-1 text-sm text-text-1">Ganztägig</span>
            <button
              onClick={() => setAllDay(!allDay)}
              className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${
                allDay ? "bg-accent" : ""
              }`}
              style={!allDay ? { background: "var(--switch-background)" } : undefined}
            >
              <div
                className={`w-5 h-5 rounded-full shadow absolute top-0.5 transition-transform ${
                  allDay ? "translate-x-[22px]" : "translate-x-0.5"
                }`}
                style={{ background: "var(--surface)" }}
              />
            </button>
          </FormRow>

          {/* Start */}
          <FormRow icon={<Calendar className="w-5 h-5" />} onClick={() => setShowStartPicker(true)}>
            <div className="flex-1 text-left">
              <div className="text-xs text-text-3">Start</div>
              <div className="text-sm text-text-1">{formatEventDateTime(startTime, allDay)}</div>
            </div>
            <ChevronRight className="w-4 h-4 text-text-3 flex-shrink-0" />
          </FormRow>

          {/* Ende */}
          <FormRow icon={<Calendar className="w-5 h-5" />} onClick={() => setShowEndPicker(true)}>
            <div className="flex-1 text-left">
              <div className="text-xs text-text-3">Ende</div>
              <div className="text-sm text-text-1">{formatEventDateTime(endTime, allDay)}</div>
            </div>
            <ChevronRight className="w-4 h-4 text-text-3 flex-shrink-0" />
          </FormRow>

          {/* Label */}
          <FormRow icon={<Palette className="w-5 h-5" />} onClick={() => setShowLabelPopup(true)}>
            <div className="flex items-center gap-2 flex-1">
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: currentLabel?.hex || getColorHex(color) }}
              />
              <span className="text-sm text-text-1">{currentLabel?.name || "Kein Label"}</span>
            </div>
            <ChevronRight className="w-4 h-4 text-text-3 flex-shrink-0" />
          </FormRow>

          {/* Zugewiesen an */}
          <FormRow icon={<Users className="w-5 h-5" />}>
            <div className="flex items-center gap-2 flex-1">
              <span className="text-sm text-text-1 mr-1">Zugewiesen</span>
              <div className="flex items-center gap-1.5">
                {householdMembers.map((member) => {
                  const isActive = assignedTo.includes(member.id);
                  const initial = member.display_name.charAt(0).toUpperCase();
                  return (
                    <button
                      key={member.id}
                      onClick={() => toggleAssigned(member.id)}
                      className="relative flex-shrink-0"
                      type="button"
                    >
                      {member.avatar_url ? (
                        <img
                          src={member.avatar_url}
                          alt={member.display_name}
                          className={`w-8 h-8 rounded-full object-cover transition ${
                            isActive ? "" : "opacity-40"
                          }`}
                        />
                      ) : (
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white transition ${
                            isActive ? "" : "opacity-40"
                          }`}
                          style={{ backgroundColor: member.initials_color }}
                        >
                          {initial}
                        </div>
                      )}
                      {/* Orange checkmark badge — same style as Einkaufen store item-count badge */}
                      {isActive && (
                        <div className="absolute -bottom-0.5 -right-0.5 bg-accent rounded-full w-[16px] h-[16px] flex items-center justify-center ring-2 ring-surface">
                          <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </FormRow>

          {/* Wiederholung */}
          <FormRow icon={<Repeat className="w-5 h-5" />} onClick={() => setShowRepeatPopup(true)}>
            {repeatRule === "none" ? (
              <span className="flex-1 text-sm text-left" style={{ color: "var(--text-3)" }}>
                Wiederholung hinzufügen
              </span>
            ) : (
              <div className="flex items-center flex-1 min-w-0">
                <span className="flex-1 text-sm text-left" style={{ color: "var(--text-1)" }}>
                  {repeatLabel}
                </span>
                <ChevronRight className="w-4 h-4 text-text-3 flex-shrink-0" />
              </div>
            )}
          </FormRow>

          {/* Existing notifications */}
          {notifications.map((n) => (
            <FormRow key={n} icon={<Bell className="w-5 h-5" />} noBorder>
              <span className="flex-1 text-sm" style={{ color: "var(--text-1)" }}>{formatNotification(n)}</span>
              <button
                onClick={() => removeNotification(n)}
                className="text-text-3 hover:text-text-1 transition flex-shrink-0 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </FormRow>
          ))}

          {/* Add notification — placeholder always visible */}
          <FormRow icon={notifications.length === 0 ? <Bell className="w-5 h-5" /> : <div className="w-5 h-5" />} onClick={() => setShowNotificationPopup(true)}>
            <span className="flex-1 text-sm text-left" style={{ color: "var(--text-3)" }}>
              Benachrichtigung hinzufügen
            </span>
          </FormRow>

          {/* Beschreibung */}
          {editingNote ? (
            <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--zu-border)" }}>
              <div className="flex items-start">
                <div className="w-5 h-5 flex items-center justify-center text-text-3 mr-3 flex-shrink-0 mt-0.5">
                  <PenLine className="w-5 h-5" />
                </div>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Beschreibung hinzufügen..."
                  rows={3}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-form-type="other"
                  className="flex-1 text-sm text-text-1 placeholder:text-text-3 outline-none bg-transparent resize-none"
                  autoFocus
                />
              </div>
            </div>
          ) : (
            <FormRow icon={<PenLine className="w-5 h-5" />} onClick={() => setEditingNote(true)}>
              <span className="flex-1 text-sm text-left" style={{ color: description ? "var(--text-1)" : "var(--text-3)" }}>
                {description || "Beschreibung hinzufügen"}
              </span>
            </FormRow>
          )}

          {/* Rezept-Verknüpfung — split: left navigates, right opens picker */}
          <div className="w-full flex items-center" style={{ borderBottom: "1px solid var(--zu-border)" }}>
            <button
              className="flex items-center flex-1 min-w-0 px-4 py-3 active:bg-surface-2 transition-colors"
              onClick={() => linkedRecipe && linkedRecipeId ? onNavigate?.("kochen", linkedRecipeId) : setShowRecipePickerDrawer(true)}
            >
              <div className="w-5 h-5 flex items-center justify-center text-text-3 mr-3 flex-shrink-0">
                <CookingPot size={20} weight="regular" />
              </div>
              <div className="flex-1 min-w-0 flex items-center">
                {linkedRecipe ? (
                  <span
                    className="inline-flex items-center gap-1 truncate"
                    style={{
                      background: "var(--surface-2)",
                      borderRadius: 999,
                      padding: "4px 10px",
                      fontSize: 13,
                      color: "var(--text-1)",
                    }}
                  >
                    🍳 {linkedRecipe.title}
                  </span>
                ) : (
                  <span className="flex-1 text-sm text-left" style={{ color: "var(--text-3)" }}>
                    Rezept hinzufügen
                  </span>
                )}
              </div>
            </button>
            <button
              className="flex items-center justify-center flex-shrink-0 py-3 active:bg-surface-2 transition-colors"
              style={{ padding: "0 16px", minWidth: 44, minHeight: 44 }}
              onClick={() => setShowRecipePickerDrawer(true)}
            >
              <ChevronRight className="w-4 h-4 text-text-3" />
            </button>
          </div>

          {/* Notiz-Verknüpfung — split: left navigates, right opens picker */}
          <div className="w-full flex items-center" style={{ borderBottom: "1px solid var(--zu-border)" }}>
            <button
              className="flex items-center flex-1 min-w-0 px-4 py-3 active:bg-surface-2 transition-colors"
              onClick={() => linkedPage && linkedPageId ? onNavigate?.("listen", linkedPageId) : setShowNotePickerDrawer(true)}
            >
              <div className="w-5 h-5 flex items-center justify-center text-text-3 mr-3 flex-shrink-0">
                <Notepad size={20} weight="regular" />
              </div>
              <div className="flex-1 min-w-0 flex items-center">
                {linkedPage ? (
                  <span
                    className="inline-flex items-center gap-1 truncate"
                    style={{
                      background: "var(--surface-2)",
                      borderRadius: 999,
                      padding: "4px 10px",
                      fontSize: 13,
                      color: "var(--text-1)",
                    }}
                  >
                    {linkedPage.icon || "📄"} {linkedPage.title || "Ohne Titel"}
                  </span>
                ) : (
                  <span className="flex-1 text-sm text-left" style={{ color: "var(--text-3)" }}>
                    Notiz hinzufügen
                  </span>
                )}
              </div>
            </button>
            <button
              className="flex items-center justify-center flex-shrink-0 py-3 active:bg-surface-2 transition-colors"
              style={{ padding: "0 16px", minWidth: 44, minHeight: 44 }}
              onClick={() => setShowNotePickerDrawer(true)}
            >
              <ChevronRight className="w-4 h-4 text-text-3" />
            </button>
          </div>

          {/* Delete — only for existing events */}
          {onDelete && (
            <div className="px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full flex items-center justify-center gap-2 py-3 text-danger text-sm font-medium hover:text-danger transition"
              >
                <Trash2 className="w-4 h-4" />
                Event löschen
              </button>
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Popups ──────────────────────────────────────────────── */}

      <AnimatePresence>
        {showStartPicker && (
          <DateTimePickerSheet
            value={startTime}
            allDay={allDay}
            onChange={(iso) => setStartTime(iso)}
            onClose={() => setShowStartPicker(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showEndPicker && (
          <DateTimePickerSheet
            value={endTime}
            allDay={allDay}
            onChange={(iso) => setEndTime(iso)}
            onClose={() => setShowEndPicker(false)}
          />
        )}
      </AnimatePresence>

      {/* Label popup */}
      <AnimatePresence>
        {showLabelPopup && (
          <PopupSheet onClose={() => setShowLabelPopup(false)}>
            {labels.map((label) => (
              <button
                key={label.id}
                onClick={() => {
                  setColor(label.color);
                  setShowLabelPopup(false);
                }}
                className="w-full flex items-center px-5 py-3 active:bg-surface-2 transition-colors"
              >
                <div
                  className="w-4 h-4 rounded-full mr-3 flex-shrink-0"
                  style={{ backgroundColor: label.hex }}
                />
                <span className="flex-1 text-sm text-text-1 text-left">{label.name}</span>
                {label.color === color && <Check className="w-4 h-4 text-accent flex-shrink-0" />}
              </button>
            ))}
            <div className="px-5 pt-3 pb-1">
              <span className="text-xs text-text-3">Labels verwalten (kommt bald)</span>
            </div>
          </PopupSheet>
        )}
      </AnimatePresence>

      {/* Repeat popup */}
      <AnimatePresence>
        {showRepeatPopup && (
          <PopupSheet onClose={() => setShowRepeatPopup(false)}>
            {/* "Keine Wiederholung" as first option to remove */}
            {repeatRule !== "none" && (
              <button
                onClick={() => {
                  setRepeatRule("none");
                  setShowRepeatPopup(false);
                }}
                className="w-full flex items-center px-5 py-3 active:bg-surface-2 transition-colors"
                style={{ borderBottom: "1px solid var(--zu-border)" }}
              >
                <span className="flex-1 text-sm text-text-1 text-left">Keine Wiederholung</span>
              </button>
            )}
            {REPEAT_OPTIONS.filter((opt) => opt.value !== "none").map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  setRepeatRule(opt.value);
                  setShowRepeatPopup(false);
                }}
                className="w-full flex items-center px-5 py-3 active:bg-surface-2 transition-colors"
              >
                <span className="flex-1 text-sm text-text-1 text-left">{opt.label}</span>
                {repeatRule === opt.value && (
                  <Check className="w-4 h-4 text-accent flex-shrink-0" />
                )}
              </button>
            ))}
          </PopupSheet>
        )}
      </AnimatePresence>

      {/* Notification popup */}
      <AnimatePresence>
        {showNotificationPopup && (
          <PopupSheet onClose={() => setShowNotificationPopup(false)}>
            {NOTIFICATION_PRESETS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => addNotification(opt.value)}
                className="w-full flex items-center px-5 py-3 active:bg-surface-2 transition-colors"
              >
                <span className="flex-1 text-sm text-text-1 text-left">{opt.label}</span>
                {notifications.includes(opt.value) && (
                  <Check className="w-4 h-4 text-accent flex-shrink-0" />
                )}
              </button>
            ))}
            <button
              onClick={() => {
                setShowNotificationPopup(false);
                setTimeout(() => setShowCustomNotification(true), 200);
              }}
              className="w-full flex items-center px-5 py-3 active:bg-surface-2 transition-colors"
            >
              <span className="flex-1 text-sm text-text-1 text-left">Benutzerdefiniert...</span>
            </button>
          </PopupSheet>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCustomNotification && (
          <CustomNotificationSheet
            onSelect={(minutes) => {
              addNotification(minutes);
              setShowCustomNotification(false);
            }}
            onClose={() => setShowCustomNotification(false)}
          />
        )}
      </AnimatePresence>

      {/* Recipe picker drawer */}
      <AnimatePresence>
        {showRecipePickerDrawer && (
          <RecipePickerDrawer
            recipes={availableRecipes}
            selectedRecipeId={linkedRecipeId}
            onSelect={(recipeId) => {
              setLinkedRecipeId(recipeId);
              setShowRecipePickerDrawer(false);
            }}
            onClose={() => setShowRecipePickerDrawer(false)}
          />
        )}
      </AnimatePresence>

      {/* Note picker drawer */}
      <AnimatePresence>
        {showNotePickerDrawer && (
          <NotePickerDrawer
            pages={availablePages}
            selectedPageId={linkedPageId}
            onSelect={(pageId) => {
              setLinkedPageId(pageId);
              setShowNotePickerDrawer(false);
            }}
            onClose={() => setShowNotePickerDrawer(false)}
          />
        )}
      </AnimatePresence>

      {/* Delete confirmation modal */}
      <AnimatePresence>
        {showDeleteConfirm && onDelete && (
          <DeleteConfirmModal
            isRecurring={event.repeat_rule !== "none"}
            onDeleteAll={() => {
              setShowDeleteConfirm(false);
              onDelete("all");
            }}
            onDeleteSingle={event.repeat_rule !== "none" ? () => {
              setShowDeleteConfirm(false);
              const dateKey = (event as any)._singleEditDate || contextDateKey;
              onDelete("single", dateKey);
            } : undefined}
            onDeleteFuture={event.repeat_rule !== "none" ? () => {
              setShowDeleteConfirm(false);
              const dateKey = (event as any)._singleEditDate || contextDateKey;
              onDelete("future", dateKey);
            } : undefined}
            onCancel={() => setShowDeleteConfirm(false)}
          />
        )}
      </AnimatePresence>

      {/* Discard confirmation modal for new events */}
      <AnimatePresence>
        {showDiscardConfirm && (
          <motion.div
            className="fixed inset-0 z-[1000] flex items-center justify-center px-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/40" onClick={(e) => { e.stopPropagation(); setShowDiscardConfirm(false); }} />
            <motion.div
              className="relative w-full max-w-[320px] rounded-2xl p-6"
              style={{ background: "var(--surface)", boxShadow: "var(--shadow-elevated)" }}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 400 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-base font-bold text-text-1 text-center">Termin verwerfen?</h3>
              <p className="text-sm text-text-3 text-center mt-2">
                Du hast Änderungen vorgenommen. Möchtest du diese verwerfen?
              </p>
              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => setShowDiscardConfirm(false)}
                  className="flex-1 py-2.5 rounded-full bg-surface-2 text-text-2 text-sm font-semibold transition"
                >
                  Abbrechen
                </button>
                <button
                  onClick={forceClose}
                  className="flex-1 py-2.5 rounded-full bg-danger text-white text-sm font-semibold transition"
                >
                  Verwerfen
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}