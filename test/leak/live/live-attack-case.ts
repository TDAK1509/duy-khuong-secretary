import type { PostgresPool } from '../../../src/providers/database/postgres.ts';

export type LiveAttackCase = {
  id: string;
  turns: string[];
  answerMarker: string | null;
  prepare?: (owner: PostgresPool) => Promise<void>;
};
