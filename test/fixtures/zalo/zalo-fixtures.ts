import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const TEST_APP_ID = 'app-test';
export const TEST_OA_SECRET = 'oa-secret-test';
export const SIGNATURE_HEADER = 'x-zevent-signature';

export type FixtureName = 'text-event' | 'image-event' | 'two-images-event' | 'follow-event';

export type SignedFixture = { body: string; headers: Record<string, string> };

export function loadSignedFixture(name: FixtureName): SignedFixture {
  const body = readFileSync(new URL(`./${name}.json`, import.meta.url), 'utf8');
  const signature = readFileSync(new URL(`./${name}.mac`, import.meta.url), 'utf8');
  return { body, headers: { [SIGNATURE_HEADER]: signature } };
}

export function signBody(body: string, secret: string = TEST_OA_SECRET): SignedFixture {
  const { timestamp } = JSON.parse(body) as { timestamp: string };
  const mac = createHash('sha256').update(`${TEST_APP_ID}${body}${timestamp}${secret}`).digest('hex');
  return { body, headers: { [SIGNATURE_HEADER]: `mac=${mac}` } };
}

export const TEST_CHANNEL_SETTINGS = {
  appId: TEST_APP_ID,
  oaSecret: TEST_OA_SECRET,
  apiBaseUrl: 'http://127.0.0.1:9',
  businessApiBaseUrl: 'http://127.0.0.1:9',
  timeoutMs: 1000,
  mediaHosts: ['zdn.vn'],
};
