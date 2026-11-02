import { respondWithJson, type HttpResponse } from './http-response.ts';

export async function handleHealth(pingDatabase: () => Promise<void>): Promise<HttpResponse> {
  try {
    await pingDatabase();
    return respondWithJson(200, { ok: true });
  } catch {
    return respondWithJson(503, { ok: false });
  }
}
