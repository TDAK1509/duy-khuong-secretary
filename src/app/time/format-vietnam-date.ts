const VIETNAM_DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export function formatVietnamDate(instant: Date): string {
  return VIETNAM_DATE_FORMAT.format(instant);
}
