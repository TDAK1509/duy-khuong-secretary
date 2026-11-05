import { z } from 'zod';
import type { SignInRequest } from './start-sign-in.ts';

export const CHATGPT_REDIRECT_URI = 'https://chatgpt.com/connector_platform_oauth_redirect';
export const CHATGPT_CLIENT_ID = 'https://chatgpt.com/oauth/client.json';

const signInQuerySchema = z.object({
  client_id: z.literal(CHATGPT_CLIENT_ID),
  redirect_uri: z.literal(CHATGPT_REDIRECT_URI),
  code_challenge: z.string(),
  code_challenge_method: z.literal('S256'),
  state: z.string().optional(),
});

export function readSignInRequest(query: unknown): SignInRequest | null {
  const parsed = signInQuerySchema.safeParse(query);
  if (!parsed.success) return null;
  const { client_id: clientId, redirect_uri: redirectUri, code_challenge: codeChallenge, state } = parsed.data;
  return { clientId, redirectUri, codeChallenge, state: state ?? null };
}
