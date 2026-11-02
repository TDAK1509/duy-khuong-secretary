const VIETNAM_TIME_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function formatVietnamTime(instant: Date): string {
  return VIETNAM_TIME_FORMAT.format(instant);
}
