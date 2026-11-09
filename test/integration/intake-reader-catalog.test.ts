import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { STANDARD_MEANING_NAMES } from '../../src/app/reading/document-rules.ts';
import { insertDocumentWithSource, insertMeaning, insertOrganizationWithAlias } from './document-rows.ts';
import { createIntakeHarness, type IntakeHarness } from './intake-harness.ts';
import { insertMember } from './workspace-rows.ts';

describe('giving the reader the kinds, companies and meanings of the workspace', () => {
  let harness: IntakeHarness;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    const { database, workspaceId } = harness;
    const lanUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-lan', displayName: 'Lan' });
    const ticket = { workspaceId, userId: lanUserId, issuerKey: 'chengloong', documentDate: '2026-11-05', vehiclePlate: null };
    await insertDocumentWithSource(database, { ...ticket, documentNumber: '1', kind: 'hóa đơn' });
    await insertDocumentWithSource(database, { ...ticket, documentNumber: '2', kind: 'phiếu cân xe' });
    await insertDocumentWithSource(database, { ...ticket, documentNumber: '3', kind: 'phiếu cân xe' });
    await insertOrganizationWithAlias(database, { workspaceId, name: 'Cheng Loong' });
    await insertMeaning(database, workspaceId, 'Khấu trừ độ ẩm');
  });

  afterEach(async () => {
    await harness.close();
  });

  it('lists the kinds, most used first, when a member sends a text', async () => {
    await harness.receiveText('zu-hung', 'Đổ dầu 1.250.000đ');

    const [request] = harness.reader.requests;
    expect(request?.system).toContain('12b. Các loại giấy tờ nhóm này đã dùng, dùng nhiều nhất trước: ["phiếu cân xe","hóa đơn"]. Danh sách này');
  });

  it('lists the organization names of the workspace', async () => {
    await harness.receiveText('zu-hung', 'Đổ dầu 1.250.000đ');

    const [request] = harness.reader.requests;
    expect(request?.system).toContain('14b. Các công ty và nơi chốn nhóm này đã lưu: ["Cheng Loong"]. Danh sách này');
  });

  it('lists the standard meanings and then the meanings of the workspace', async () => {
    await harness.receiveText('zu-hung', 'Đổ dầu 1.250.000đ');

    const [request] = harness.reader.requests;
    expect(request?.system).toContain(`${JSON.stringify([...STANDARD_MEANING_NAMES, 'Khấu trừ độ ẩm'])}. Danh sách này`);
  });
});
