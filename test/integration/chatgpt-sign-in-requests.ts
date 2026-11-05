export const PUBLIC_BASE_URL = 'https://generator-24.com';
export const MAX_TEXT_LENGTH = 2000;

export const CHATGPT_CLIENT_ID = 'https://chatgpt.com/oauth/client.json';
export const CHATGPT_REDIRECT_URI = 'https://chatgpt.com/connector_platform_oauth_redirect';

export type SignInQuery = Record<string, string>;

export function makeSignInQuery(overrides: SignInQuery = {}): SignInQuery {
  return {
    response_type: 'code',
    client_id: CHATGPT_CLIENT_ID,
    redirect_uri: CHATGPT_REDIRECT_URI,
    code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    code_challenge_method: 'S256',
    state: 'test1',
    resource: `${PUBLIC_BASE_URL}/mcp`,
    ...overrides,
  };
}
