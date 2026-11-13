export function readCookie(cookieHeader: string | undefined, name: string): string | null {
  const cookies = (cookieHeader ?? '').split(';').map((cookie) => cookie.trim());
  const found = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  return found?.slice(name.length + 1) ?? null;
}
