import type { Clock } from '../../../src/services/clock/clock.ts';
import { FIXED_NOW } from './seed-ids.ts';

export const FIXED_CLOCK: Clock = { now: () => FIXED_NOW };
