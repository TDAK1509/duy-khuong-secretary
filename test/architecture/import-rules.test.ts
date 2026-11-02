import { describe, expect, it } from 'vitest';
import { lintFixture } from './lint-fixture.ts';

describe('import rules', () => {
  it('rejects an import from services to app', async () => {
    const messages = await lintFixture('services-import-app', 'src/services/messaging.ts');

    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toContain('../app/rules.ts');
  });

  it('rejects an import from services to providers', async () => {
    const messages = await lintFixture('services-import-provider', 'src/services/chat-service.ts');

    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toContain('../providers/chat/openai-compatible-chat.ts');
  });

  it('rejects an import from services to a vendor package', async () => {
    const messages = await lintFixture('services-import-vendor', 'src/services/database-service.ts');

    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toContain("'pg'");
  });

  it('rejects an import from app to providers', async () => {
    const messages = await lintFixture('app-import-provider', 'src/app/admin-chat/run-chat.ts');

    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toContain('../../providers/chat/openai-compatible-chat.ts');
  });

  it('rejects an import from app to a vendor package', async () => {
    const messages = await lintFixture('app-import-vendor', 'src/app/ask-model.ts');

    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toContain("'openai'");
  });

  it('rejects an import from providers to app', async () => {
    const messages = await lintFixture('providers-import-app', 'src/providers/storage/s3-photo-storage.ts');

    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toContain("../../app/save-record.ts");
  });

  it('rejects an import from one provider to another', async () => {
    const messages = await lintFixture('provider-import-provider', 'src/providers/chat/x.ts');

    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toContain("../storage/y.ts");
  });

  it('allows app/db to import only the Postgres provider file', async () => {
    const messages = await lintFixture('db-import-other-provider', 'src/app/db/open-connection.ts');

    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toContain("../../providers/storage/s3-photo-storage.ts");
  });

  it('rejects an import of the migration tool outside the migration entry', async () => {
    const messages = await lintFixture('bootstrap-import-migration-tool', 'src/bootstrap/main.ts');

    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toContain("../providers/database/migration-tool.ts");
  });

  it('allows app/db to import the Postgres provider file', async () => {
    const messages = await lintFixture('db-import-postgres', 'src/app/db/open-pool.ts');

    expect(messages).toEqual([]);
  });

  it('allows the migration entry to import the migration tool', async () => {
    const messages = await lintFixture('migrate-import-migration-tool', 'src/bootstrap/migrate.ts');

    expect(messages).toEqual([]);
  });

  it('allows a provider to import its vendor package and a service', async () => {
    const messages = await lintFixture('provider-import-vendor-and-service', 'src/providers/chat/openai-compatible-chat.ts');

    expect(messages).toEqual([]);
  });
});
