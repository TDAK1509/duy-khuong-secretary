export type HttpResponse = {
  status: number;
  headers: Record<string, string>;
  body: string;
};

export function respondWithJson(status: number, body: unknown): HttpResponse {
  return {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  };
}
