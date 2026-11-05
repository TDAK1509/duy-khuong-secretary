import { describeAuthorizationServer } from '../chatgpt/describe-authorization-server.ts';
import { respondWithJson, respondWithText, ZALO_OFF_TEXT, type HttpResponse } from './http-response.ts';

export type TokenDependencies = { publicBaseUrl: string };

export function handleAuthorizationServerMetadata(dependencies: TokenDependencies | null): HttpResponse {
  if (dependencies === null) return respondWithText(503, ZALO_OFF_TEXT);
  return respondWithJson(200, describeAuthorizationServer(dependencies.publicBaseUrl));
}
