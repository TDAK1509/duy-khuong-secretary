import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { UPLOAD_ONLY_TEXT } from '../../src/app/intake/intake-texts.ts';
import { hasImagePart } from '../../src/services/reading/reader-service.ts';
import { ATTACK_TEXT } from './support/attack-text.ts';
import { runDriverStep } from './support/driver-inbound-step.ts';
import { openLeakDatabases } from './support/leak-databases.ts';
import { resetDatabase } from './support/reset-database.ts';

const databases = openLeakDatabases();

beforeEach(() => resetDatabase(databases.owner));

after(() => databases.close());

test('a driver text with the attack text makes no chat-model request', async () => {
  const { chat, reader, replyTexts } = await runDriverStep({ owner: databases.owner, step: databases.runtime }, { kind: 'text', text: ATTACK_TEXT });
  assert.ok(reader.requests.length > 0, 'the reader must see the driver text, or the step proves nothing');
  assert.equal(chat.requests.length, 0);
  assert.deepEqual(replyTexts, [UPLOAD_ONLY_TEXT]);
});

test('a driver photo with the attack caption makes no chat-model request', async () => {
  const { chat, reader } = await runDriverStep({ owner: databases.owner, step: databases.runtime }, { kind: 'photo', caption: ATTACK_TEXT });
  assert.ok(reader.requests.some(hasImagePart), 'the reader must see the driver photo, or the step proves nothing');
  assert.equal(chat.requests.length, 0);
});
