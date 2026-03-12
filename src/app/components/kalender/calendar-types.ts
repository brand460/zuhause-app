export type RepeatRule = "none" | "daily" | "weekly" | "monthly" | "yearly";

export type EventColor = "orange" | "blue" | "green" | "red" | "purple" | "gray";

export type NotificationMinutes = 0 | 10 | 30 | 60 | 1440; // 0=at time, 1440=1 day

export interface CalendarEvent {
  id: string;
  household_id: string;
  title: string;
  start_time: string; // ISO string
  end_time: string; // ISO string
  all_day: boolean;
  description: string;
  color: EventColor;
  repeat_rule: RepeatRule;
  end_repeat_date?: string; // ISO date string – recurring events stop after this date
  notification_minutes: NotificationMinutes; // kept for backward compat
  notifications?: number[]; // array of notification values in minutes
  assigned_to?: string[]; // array of household member IDs
  linked_recipe_id: string | null;
  linked_list_id: string | null;
  linked_page_id: string | null;
  // For single-occurrence edits of recurring events
  recurring_exception_dates?: string[]; // ISO date strings where this event is modified
  recurring_edits?: Record<string, Partial<CalendarEvent>>; // date -> overrides
}

export const EVENT_COLORS: { id: EventColor; label: string; hex: string; bg: string }[] = [
  { id: "orange", label: "Orange", hex: "#F97316", bg: "#FFF7ED" },
  { id: "blue", label: "Blau", hex: "#3B82F6", bg: "#EFF6FF" },
  { id: "green", label: "Grün", hex: "#22C55E", bg: "#F0FDF4" },
  { id: "red", label: "Rot", hex: "#EF4444", bg: "#FEF2F2" },
  { id: "purple", label: "Lila", hex: "#8B5CF6", bg: "#F5F3FF" },
  { id: "gray", label: "Grau", hex: "#6B7280", bg: "#F9FAFB" },
];

export const REPEAT_OPTIONS: { value: RepeatRule; label: string }[] = [
  { value: "none", label: "Keine" },
  { value: "daily", label: "T\u00e4glich" },
  { value: "weekly", label: "W\u00f6chentlich" },
  { value: "monthly", label: "Monatlich" },
  { value: "yearly", label: "J\u00e4hrlich" },
];

export const NOTIFICATION_OPTIONS: { value: NotificationMinutes; label: string }[] = [
  { value: 0, label: "Zum Zeitpunkt" },
  { value: 10, label: "10 Min vorher" },
  { value: 30, label: "30 Min vorher" },
  { value: 60, label: "1 Stunde vorher" },
  { value: 1440, label: "1 Tag vorher" },
];

export interface CalendarLabel {
  id: string;
  name: string;
  color: EventColor;
  hex: string;
}

export const DEFAULT_LABELS: CalendarLabel[] = [
  { id: "label-todo", name: "To-Do", color: "blue", hex: "#3B82F6" },
  { id: "label-events", name: "Events", color: "orange", hex: "#F97316" },
  { id: "label-haushalt", name: "Haushalt", color: "green", hex: "#22C55E" },
  { id: "label-tonnen", name: "Tonnen", color: "gray", hex: "#6B7280" },
  { id: "label-geburtstag", name: "Geburtstag", color: "purple", hex: "#8B5CF6" },
  { id: "label-arbeit", name: "Arbeit", color: "red", hex: "#EF4444" },
];

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

export function getColorHex(color: EventColor): string {
  return EVENT_COLORS.find((c) => c.id === color)?.hex || "#F97316";
}

export function getColorBg(color: EventColor): string {
  return EVENT_COLORS.find((c) => c.id === color)?.bg || "#FFF7ED";
}

// ── Household members / Avatars ────────────────────────────────────

export interface HouseholdMember {
  id: string;
  display_name: string;
  avatar_url: string | null; // from Google OAuth user_metadata.avatar_url
  initials_color: string; // fallback bg color for initial circle
}