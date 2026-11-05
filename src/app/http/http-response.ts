export type HttpResponse = {
  status: number;
  headers: Record<string, string>;
  body: string;
};

export const ZALO_OFF_TEXT = 'Zalo is not configured.';

export function respondWithJson(status: number, body: unknown): HttpResponse {
  return {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  };
}

export function respondWithText(status: number, body: string): HttpResponse {
  return { status, headers: { 'content-type': 'text/plain; charset=utf-8' }, body };
}

export function respondWithHtml(body: string, status = 200): HttpResponse {
  return { status, headers: { 'content-type': 'text/html; charset=utf-8' }, body };
}
