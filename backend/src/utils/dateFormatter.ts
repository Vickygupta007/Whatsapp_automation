/**
 * Formats a Date or date string to Indian Standard Time (Asia/Kolkata, UTC+5:30)
 */
export function formatDateTimeIST(
  dateVal?: string | Date | null,
  explicitTime?: string | null
): { date: string; time: string; full: string } {
  if (!dateVal) {
    const now = new Date();
    const dateStr = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
      .format(now)
      .replace(/\//g, '-');

    const timeStr =
      explicitTime ||
      new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).format(now);

    return { date: dateStr, time: timeStr, full: `${dateStr} ${timeStr}` };
  }

  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) {
      const raw = String(dateVal);
      return { date: raw.split('T')[0] || raw, time: explicitTime || '', full: raw };
    }

    const dateStr = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
      .format(d)
      .replace(/\//g, '-');

    let timeStr = explicitTime ? explicitTime.trim() : null;
    if (!timeStr) {
      timeStr = new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).format(d);
    }

    return { date: dateStr, time: timeStr, full: `${dateStr} ${timeStr}` };
  } catch {
    const fallback = String(dateVal);
    return { date: fallback, time: explicitTime || '', full: fallback };
  }
}
