import { describe, expect, it } from 'vitest';
import { lintFixture } from './lint-fixture.ts';

describe('import rules', () => {
  it('rejects an import from services to app', async () => {
    const messages = await lintFixture('services-import-app', 'src/services/messaging.ts');

    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toContain('../app/rules.ts');
  });
});
