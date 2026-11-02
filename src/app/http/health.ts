import { respondWithJson, type HttpResponse } from './http-response.ts';

export async function handleHealth(
  pingDatabase: () => Promise<void>,
  commit: string | null,
): Promise<HttpResponse> {
  try {
    await pingDatabase();
    return respondWithJson(200, { ok: true, commit });
  } catch {
    return respondWithJson(503, { ok: false, commit });
  }
}
