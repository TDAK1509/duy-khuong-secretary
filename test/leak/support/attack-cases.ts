import type { AttackCase } from './attack-case.ts';
import { CHANGE_ATTACK_CASES } from './change-attack-cases.ts';
import { READ_ATTACK_CASES } from './read-attack-cases.ts';

export const ATTACK_CASES: AttackCase[] = [...READ_ATTACK_CASES, ...CHANGE_ATTACK_CASES];
