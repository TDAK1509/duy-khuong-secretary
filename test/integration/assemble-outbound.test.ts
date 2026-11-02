import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assembleService, type Service } from '../../src/bootstrap/assemble-service.ts';
import { storeConnection } from '../../src/app/channel-auth/store-connection.ts';
import { makeTokenPair } from '../fakes/fake-channel-auth.ts';
import { insertInboundEvent } from './inbound-event-rows.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import { insertOutboundMessage } from './outbound-message-rows.ts';
import { replyWithJson, startStubHttpServer, type StubHttpServer } from './stub-http-server.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

const ZALO_ENVIRONMENT: NodeJS.ProcessEnv = {
  MESSAGING_PROVIDER: 'zalo-oa',
  ZALO_APP_ID: 'app-1',
  ZALO_APP_SECRET: 'sec-1',
  CHANNEL_TOKEN_ENCRYPTION_KEY: 'a'.repeat(64),
  PUBLIC_BASE_URL: 'https://x.test',
};

describe('the assembled service sends outbound messages', () => {
  let database: TemporaryDatabase;
  let service: Service;
  let zaloApi: StubHttpServer | null = null;

  beforeEach(async () => {
    database = await createMigratedDatabase();
  });

  afterEach(async () => {
    await zaloApi?.close();
    await service.server.close();
    await service.pool.end();
    await database.drop();
  });

  it('sends nothing while the zalo group is off', async () => {
    service = assembleService({ DATABASE_URL: database.url }, () => {});
    const id = await insertOutboundMessage(database, {});

    const outcome = await service.runOutboundStep();

    expect(outcome).toBe('idle');
    expect(await database.query(`SELECT status FROM outbound_messages WHERE id = '${id}'`)).toEqual([
      { status: 'queued' },
    ]);
  });

  it('answers a stored message through the Zalo API with the stored access key', async () => {
    zaloApi = await startStubHttpServer(replyWithJson({ error: 0 }));
    const environment = { ...ZALO_ENVIRONMENT, ZALO_API_BASE_URL: zaloApi.baseUrl, DATABASE_URL: database.url };
    service = assembleService(environment, () => {});
    const tokens = makeTokenPair({ accessToken: 'a1' });
    await storeConnection(service.pool, { channel: 'zalo-oa', accountId: 'oa-1', tokens, storedAt: new Date() }, 'a'.repeat(64));
    await insertInboundEvent(database, { externalUserId: 'zu-hung' });

    await service.runInboundStep();
    await service.runOutboundStep();

    const [request] = zaloApi.requests;
    expect(request?.headers['access_token']).toBe('a1');
    expect(JSON.parse(request?.body ?? '{}')).toMatchObject({ recipient: { user_id: 'zu-hung' } });
    expect(await database.query('SELECT status, kind, attempts FROM outbound_messages')).toEqual([
      { status: 'sent', kind: 'text', attempts: 1 },
    ]);
  });
});
