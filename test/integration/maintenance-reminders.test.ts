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

describe('an admin creates maintenance reminders by chat', () => {
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

  function createWithRules(rules: MaintenanceRule[]): void {
    const call = {
      id: 'call_1',
      name: 'create_scheduled_task',
      argumentsJson: JSON.stringify({ ...DAILY_AT_SEVEN, maintenance_rules: rules }),
    };
    harness.chat.follow((_request, callNumber) => (callNumber === 1 ? replyWithToolCalls(call) : replyWithText('Đã đặt lịch.')));
  }

  it('stores the rules of a new task', async () => {
    createWithRules([{ maintenance_item: 'Dầu máy', age_days: 30 }]);

    await harness.receiveText('zu-duy', 'Nhắc tôi thay dầu máy sau 30 ngày');

    expect(await database.query('SELECT maintenance_rules FROM scheduled_tasks')).toEqual([
      { maintenance_rules: [{ maintenance_item: 'dầu máy', age_days: 30 }] },
    ]);
  });

  function findToolResult(): string {
    const result = harness.chat.requests[1]?.turns.find((turn) => turn.role === 'tool_result');
    if (result?.role !== 'tool_result') throw new Error('the model received no tool result');
    return result.output;
  }

  it.each([
    ['zero days', { maintenance_item: 'dầu máy', age_days: 0 }],
    ['a part of spaces', { maintenance_item: '   ', age_days: 30 }],
    ['a fraction of a day', { maintenance_item: 'dầu máy', age_days: 1.5 }],
  ])('refuses a rule with %s', async (_description, rule) => {
    createWithRules([rule]);

    await harness.receiveText('zu-duy', 'Nhắc tôi thay dầu máy');

    expect(await database.query('SELECT 1 FROM scheduled_tasks')).toEqual([]);
    expect(findToolResult()).toBe('{"ok":false,"error":"Dữ liệu không hợp lệ: maintenance_rules"}');
  });

  it('puts the maintenance check template in the system prompt', async () => {
    await harness.receiveText('zu-duy', 'Nhắc tôi thay dầu');

    expect(harness.chat.requests[0]?.system).toContain('Mẫu "instruction" cho kiểm tra bảo dưỡng hằng ngày:');
  });
});
