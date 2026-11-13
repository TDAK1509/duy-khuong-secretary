import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE_DIRECTORY = new URL('../../src', import.meta.url).pathname;
const BALANCE_MODULE = 'app/credits/credit-balance.ts';
const MIGRATIONS_DIRECTORY = 'app/db/migrations/';
const SQL_TEXT = '[^`;]*';
const UPDATES_BALANCE = new RegExp(`\\bUPDATE\\s+workspaces\\b${SQL_TEXT}\\bSET\\b${SQL_TEXT}\\bcredit_balance\\b`, 'is');
const INSERTS_BALANCE = new RegExp(`\\bINSERT\\s+INTO\\s+workspaces\\b${SQL_TEXT}\\bcredit_balance\\b`, 'is');

describe('the writers of the credit balance', () => {
  it('are only the balance module and the migrations', () => {
    const writers = listSourceFiles().filter((file) => writesBalance(readFileSync(join(SOURCE_DIRECTORY, file), 'utf8')));

    expect(writers.filter((file) => !file.startsWith(MIGRATIONS_DIRECTORY))).toEqual([BALANCE_MODULE]);
  });
});

function listSourceFiles(): string[] {
  return readdirSync(SOURCE_DIRECTORY, { recursive: true, encoding: 'utf8' }).filter((path) => path.endsWith('.ts'));
}

function writesBalance(source: string): boolean {
  return UPDATES_BALANCE.test(source) || INSERTS_BALANCE.test(source);
}
