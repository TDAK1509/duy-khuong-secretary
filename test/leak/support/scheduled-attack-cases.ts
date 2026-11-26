import { SCHEDULED_RUN_TOOLS } from '../../../src/app/schedules/runs/scheduled-tools.ts';
import { ATTACK_CASES } from './attack-cases.ts';

export const SCHEDULED_ATTACK_CASES = ATTACK_CASES.filter((attackCase) => SCHEDULED_RUN_TOOLS.some((tool) => tool.name === attackCase.name));
