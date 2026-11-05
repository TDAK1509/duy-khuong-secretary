import { describeProtectedResource } from '../chatgpt/describe-protected-resource.ts';
import { respondWithJson, respondWithText, ZALO_OFF_TEXT, type HttpResponse } from './http-response.ts';

export type McpDependencies = { publicBaseUrl: string };

export function handleProtectedResourceMetadata(dependencies: McpDependencies | null): HttpResponse {
  if (dependencies === null) return respondWithText(503, ZALO_OFF_TEXT);
  return respondWithJson(200, describeProtectedResource(dependencies.publicBaseUrl));
}

export function handleMcpRequest(dependencies: McpDependencies | null): HttpResponse {
  if (dependencies === null) return respondWithText(503, ZALO_OFF_TEXT);
  return respondWithSignInChallenge(dependencies.publicBaseUrl);
}

function respondWithSignInChallenge(publicBaseUrl: string): HttpResponse {
  const response = respondWithText(401, 'Unauthorized.');
  const metadataUrl = `${publicBaseUrl}/.well-known/oauth-protected-resource`;
  return { ...response, headers: { ...response.headers, 'www-authenticate': `Bearer resource_metadata="${metadataUrl}"` } };
}
