import { respondWithText, type HttpResponse } from './http-response.ts';

export type McpDependencies = { publicBaseUrl: string };

export function handleMcpRequest({ publicBaseUrl }: McpDependencies): HttpResponse {
  const response = respondWithText(401, 'Unauthorized.');
  const metadataUrl = `${publicBaseUrl}/.well-known/oauth-protected-resource`;
  return { ...response, headers: { ...response.headers, 'www-authenticate': `Bearer resource_metadata="${metadataUrl}"` } };
}
