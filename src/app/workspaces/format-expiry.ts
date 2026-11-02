const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const PARTS_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: VIETNAM_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatVietnamDateTime(moment: Date): string {
  const parts = Object.fromEntries(
    PARTS_FORMAT.formatToParts(moment).map(({ type, value }) => [type, value]),
  );
  return `${parts['hour']}:${parts['minute']} ${parts['day']}/${parts['month']}/${parts['year']}`;
}
