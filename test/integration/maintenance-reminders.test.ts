import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FakeReader } from '../fakes/fake-reader.ts';
import { replyWithText, replyWithToolCalls } from '../fakes/fake-chat-service.ts';
import { makeReading } from '../unit/reading/make-reading.ts';
import { createIntakeHarness, type IntakeHarness } from './intake-harness.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember } from './workspace-rows.ts';

type MaintenanceRule = { maintenance_item: string; age_days: number };

const DAILY_AT_SEVEN = {
  title: 'Nhắc bảo dưỡng',
  instruction: 'Nhắc tôi về các hồ sơ bảo dưỡng đến hạn.',
  repeat: 'daily',
  run_once_at: null,
  time_of_day: '07:00',
  weekday: null,
  day_of_month: null,
};

describe('an admin proposes maintenance reminders by chat', () => {
  let harness: IntakeHarness;
  let database: TemporaryDatabase;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    ({ database } = harness);
    await insertMember(database, { workspaceId: harness.workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    harness.clock.setTo(new Date('2026-10-31T10:00:00+07:00'));
    answerQuestionOnly();
  });

  afterEach(async () => {
    await harness.close();
  });

  function answerQuestionOnly(): void {
    const reading = makeReading([], { has_work_data: false, has_question: true });
    const pair: readonly [FakeReader, FakeReader] = harness.readers.cheap;
    pair.forEach((reader) => reader.answerWith(reading));
  }

  function proposeWithRules(rules: MaintenanceRule[]): void {
    const call = {
      id: 'call_1',
      name: 'propose_scheduled_task',
      argumentsJson: JSON.stringify({ ...DAILY_AT_SEVEN, maintenance_rules: rules }),
    };
    harness.chat.follow((_request, callNumber) => (callNumber === 1 ? replyWithToolCalls(call) : replyWithText('Bạn kiểm tra lại rồi trả lời 1 để lưu lịch nhé.')));
  }

  it('stores the rules of a proposal', async () => {
    proposeWithRules([{ maintenance_item: 'Dầu máy', age_days: 30 }]);

    await harness.receiveText('zu-duy', 'Nhắc tôi thay dầu máy sau 30 ngày');

    expect(await database.query('SELECT maintenance_rules FROM scheduled_tasks')).toEqual([
      { maintenance_rules: [{ maintenance_item: 'dầu máy', age_days: 30 }] },
    ]);
  });
});
