import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE_DIRECTORY = new URL('../../src', import.meta.url).pathname;
const QUOTED_UPDATE_DIRECTORY = new URL('./credit-balance-quoted-update/src', import.meta.url).pathname;
const INSERT_DIRECTORY = new URL('./credit-balance-insert/src', import.meta.url).pathname;
const BALANCE_MODULE = 'app/credits/credit-balance.ts';
const MIGRATIONS_DIRECTORY = 'app/db/migrations/';
const ASSIGNS_BALANCE = /\bcredit_balance\s*=(?!=)/;
const INSERTS_BALANCE = /\bINSERT\s+INTO\s+"?workspaces"?\s*\([^)]*\bcredit_balance\b/i;

describe('the writers of the credit balance', () => {
  it('are only the balance module and the migrations', () => {
    const writers = listBalanceWriters(SOURCE_DIRECTORY);

    expect(writers.filter((file) => !file.startsWith(MIGRATIONS_DIRECTORY))).toEqual([BALANCE_MODULE]);
  });

  it('are found even when the table name is quoted', () => {
    expect(listBalanceWriters(QUOTED_UPDATE_DIRECTORY)).toEqual(['app/reset-balance.ts']);
  });

  it('are found when a workspace is inserted with a balance', () => {
    expect(listBalanceWriters(INSERT_DIRECTORY)).toEqual(['app/seed-workspace.ts']);
  });
});

function listBalanceWriters(sourceDirectory: string): string[] {
  return readdirSync(sourceDirectory, { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith('.ts'))
    .filter((file) => writesBalance(readFileSync(join(sourceDirectory, file), 'utf8')));
}

function writesBalance(source: string): boolean {
  return ASSIGNS_BALANCE.test(source) || INSERTS_BALANCE.test(source);
}
