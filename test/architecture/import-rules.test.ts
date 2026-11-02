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
});
