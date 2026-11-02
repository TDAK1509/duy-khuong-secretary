import type { Clock } from '../../../services/clock/clock.ts';
import type { Database } from '../../db/transaction.ts';

export type AdminToolDependencies = { database: Database; clock: Clock };
