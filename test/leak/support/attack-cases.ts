import type { AttackCase } from './attack-case.ts';
import { CHANGE_ATTACK_CASES } from './change-attack-cases.ts';
import { READ_ATTACK_CASES } from './read-attack-cases.ts';

export const ATTACK_CASES: AttackCase[] = [...READ_ATTACK_CASES, ...CHANGE_ATTACK_CASES];

export function findAttackCase(name: string): AttackCase {
  const attackCase = ATTACK_CASES.find((candidate) => candidate.name === name);
  if (attackCase === undefined) throw new Error(`no attack case is named ${name}`);
  return attackCase;
}
