import type { LiveAttackCase } from './live-attack-case.ts';
import { LIVE_ATTACK_CASES } from './live-attack-cases.ts';

const DEFAULT_RUNS = 1;
const DEFAULT_MAX_USD = 5;
const ALL_CASES = 'ALL';

export type LiveSettings = { cases: LiveAttackCase[]; runs: number; maxUsd: number };

export function readLiveSettings(environment: NodeJS.ProcessEnv): LiveSettings {
  return {
    cases: selectCases(environment['LEAK_LIVE_CASES'], LIVE_ATTACK_CASES),
    runs: readWholeNumber(environment, 'LEAK_LIVE_RUNS', DEFAULT_RUNS),
    maxUsd: readPositiveNumber(environment, 'LEAK_LIVE_MAX_USD', DEFAULT_MAX_USD),
  };
}

function selectCases(value: string | undefined, available: LiveAttackCase[]): LiveAttackCase[] {
  const ids = (value ?? '').split(',').map((id) => id.trim().toUpperCase()).filter((id) => id !== '');
  if (ids.length === 0 || ids.includes(ALL_CASES)) return available;
  const unknown = ids.filter((id) => !available.some((attackCase) => attackCase.id === id));
  if (unknown.length > 0) throw new Error(`LEAK_LIVE_CASES names no attack case: ${unknown.join(', ')}`);
  return available.filter((attackCase) => ids.includes(attackCase.id));
}

function readWholeNumber(environment: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const value = readPositiveNumber(environment, name, fallback);
  if (!Number.isInteger(value)) throw new Error(`${name} must be a whole number, got "${value}"`);
  return value;
}

function readPositiveNumber(environment: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const text = environment[name]?.trim();
  if (text === undefined || text === '') return fallback;
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number, got "${text}"`);
  return value;
}
