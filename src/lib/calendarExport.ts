// Utilities for exporting trip/package events to Google Calendar (URL) and .ics files.

export interface CalendarEvent {
  title: string;
  description?: string;
  location?: string;
  /** ISO date string (YYYY-MM-DD) or full ISO datetime */
  startDate: string;
  /** Optional end date; defaults to startDate */
  endDate?: string;
  /** All-day event (default true if only date given) */
  allDay?: boolean;
}

function toICSDate(input: string, allDay: boolean): string {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  if (allDay) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}${m}${day}`;
  }
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeICS(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/** Build an .ics (iCalendar) file body for one event. */
export function buildICS(event: CalendarEvent): string {
  const allDay = event.allDay ?? !event.startDate.includes("T");
  const dtStart = toICSDate(event.startDate, allDay);
  const dtEnd = toICSDate(event.endDate ?? event.startDate, allDay);
  const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}@ightour.app`;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//IGH Tour//Travel Manager//ID",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    allDay ? `DTSTART;VALUE=DATE:${dtStart}` : `DTSTART:${dtStart}`,
    allDay ? `DTEND;VALUE=DATE:${dtEnd}` : `DTEND:${dtEnd}`,
    `SUMMARY:${escapeICS(event.title)}`,
    event.description ? `DESCRIPTION:${escapeICS(event.description)}` : "",
    event.location ? `LOCATION:${escapeICS(event.location)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);

  return lines.join("\r\n");
}

/** Trigger browser download of an .ics file. */
export function downloadICS(event: CalendarEvent, filename = "event.ics") {
  const ics = buildICS(event);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Build a Google Calendar "create event" URL — opens in any browser, no OAuth needed. */
export function buildGoogleCalendarUrl(event: CalendarEvent): string {
  const allDay = event.allDay ?? !event.startDate.includes("T");
  const start = toICSDate(event.startDate, allDay);
  const end = toICSDate(event.endDate ?? event.startDate, allDay);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${start}/${end}`,
  });
  if (event.description) params.set("details", event.description);
  if (event.location) params.set("location", event.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
