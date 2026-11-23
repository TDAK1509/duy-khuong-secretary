const VIETNAM_DATE_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export function formatVietnamCompactDate(instant: Date): string {
  const parts = Object.fromEntries(VIETNAM_DATE_PARTS.formatToParts(instant).map(({ type, value }) => [type, value]));
  return `${parts.year}${parts.month}${parts.day}`;
}
