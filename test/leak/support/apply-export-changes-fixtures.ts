import type { PostgresPool } from '../../../src/providers/database/postgres.ts';
import type { LeakDatabases } from './leak-databases.ts';
import { editDataSheet, FIRST_DATA_ROW, findColumn, sendReturnedFile } from './returned-export-files.ts';
import { insertEntry, insertPaper, linkEntry } from './paper-fixtures.ts';
import { exportAlphaPapers, WAGE_HEADER } from './returned-export-fixtures.ts';
import { WORKSPACE_A_ID } from './seed-ids.ts';
import { NoCompanyMatchReader } from './no-company-match-reader.ts';
import { createToolHarness } from './tool-harness.ts';

export type Decision = { cause: 'paper_reading' | 'company_knowledge' | 'dismiss'; replace_conflicts?: boolean; notes_checked?: boolean };

export async function returnEditedWage(databases: LeakDatabases, newWage: number): Promise<string> {
  const bytes = await exportAlphaPapers(databases);
  const edited = await editDataSheet(bytes, (sheet) => {
    sheet.getRow(FIRST_DATA_ROW).getCell(findColumn(sheet, WAGE_HEADER)).value = newWage;
  });
  await sendReturnedFile(databases, edited);
  return findNewestChangeId(databases);
}

export async function findNewestChangeId(databases: LeakDatabases): Promise<string> {
  const reply = await createToolHarness(databases.runtime).runTool('chat-gate', 'list_edited_export_changes', {});
  return (JSON.parse(reply) as { changes: { change_id: string }[] }).changes[0]!.change_id;
}

export async function decideChange(databases: LeakDatabases, changeId: string, decision: Decision): Promise<Record<string, unknown>> {
  const args = { decisions: [{ change_id: changeId, replace_conflicts: false, notes_checked: false, ...decision }] };
  const reply = await createToolHarness(databases.runtime, { companyReader: new NoCompanyMatchReader() }).runTool('chat-gate', 'apply_edited_export_changes', args);
  return (JSON.parse(reply) as { results: Record<string, unknown>[] }).results[0]!;
}

export async function readChangeStatus(owner: PostgresPool, changeId: string): Promise<string> {
  const { rows } = await owner.query<{ status: string }>('SELECT status FROM company_export_review_changes WHERE id = $1', [changeId]);
  return rows[0]!.status;
}

export async function readWages(owner: PostgresPool): Promise<number[]> {
  const { rows } = await owner.query<{ then_wage_vnd: number }>('SELECT then_wage_vnd FROM company_knowledge_entries WHERE workspace_id = $1 AND then_wage_vnd IS NOT NULL ORDER BY then_wage_vnd', [WORKSPACE_A_ID]);
  return rows.map((row) => Number(row.then_wage_vnd));
}

export async function removeSeededEntries(owner: PostgresPool): Promise<void> {
  await owner.query('DELETE FROM company_knowledge_entries WHERE workspace_id = $1', [WORKSPACE_A_ID]);
}

export async function listCustomerNames(owner: PostgresPool): Promise<string[]> {
  const { rows } = await owner.query<{ printed_name: string }>(
    `SELECT party.printed_name FROM document_parties party JOIN documents document ON document.id = party.document_id
     WHERE party.workspace_id = $1 AND party.role = 'customer' AND document.vehicle_plate = '51C12345' ORDER BY party.printed_name`,
    [WORKSPACE_A_ID],
  );
  return rows.map((row) => row.printed_name);
}

export async function readCustomers(owner: PostgresPool): Promise<string[]> {
  const { rows } = await owner.query<{ then_customer: string }>("SELECT then_customer FROM company_knowledge_entries WHERE workspace_id = $1 AND statement = 'fixture entry' AND then_customer IS NOT NULL", [WORKSPACE_A_ID]);
  return rows.map((row) => row.then_customer);
}

export async function returnEditedFreight(databases: LeakDatabases, newAmount: number): Promise<string> {
  await insertPaper(databases.owner, { stage: 'dispatch', plate: '51C12345', date: '2026-03-05', weightKg: 27000, parties: [{ role: 'issuer', name: 'Alpha' }] });
  await insertPaper(databases.owner, { stage: 'receipt', plate: '51C12345', date: '2026-03-06', weightKg: 27000, parties: [{ role: 'supplier', name: 'Alpha' }] });
  await linkEntry(databases.runtime, await insertEntry(databases.owner, { pickup: 'Alpha', ratePerTonVnd: 150000 }));
  const harness = createToolHarness(databases.runtime);
  const column = { name: 'Cước', source: 'knowledge_amount', field: null, value_name: 'Cước vận chuyển' };
  await harness.runTool('chat-gate', 'export_trip_report_xlsx', { title: 'Báo cáo', date_from: '2026-03-01', date_to: '2026-03-28', plate: '51C12345', columns: [column], layout: null });
  const edited = await editDataSheet(harness.storage.listStoredFiles()[0]!.bytes, (sheet) => {
    sheet.getRow(FIRST_DATA_ROW).getCell(findColumn(sheet, 'Cước')).value = newAmount;
  });
  await sendReturnedFile(databases, edited);
  return findNewestChangeId(databases);
}

export async function readRates(owner: PostgresPool): Promise<number[]> {
  const { rows } = await owner.query<{ then_rate_vnd_per_ton: number }>('SELECT then_rate_vnd_per_ton FROM company_knowledge_entries WHERE workspace_id = $1 AND then_rate_vnd_per_ton IS NOT NULL', [WORKSPACE_A_ID]);
  return rows.map((row) => Number(row.then_rate_vnd_per_ton));
}
