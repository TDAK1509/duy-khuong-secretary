import type { Clock } from '../../../services/clock/clock.ts';
import type { Database } from '../../db/transaction.ts';
import type { AdminTextGuard } from './admin-text-guard.ts';
import type { CreatedTasks } from '../created-tasks.ts';
import type { PhotoAttachments } from '../photo-attachments.ts';

export type AdminToolDependencies = { database: Database; clock: Clock; attachments: PhotoAttachments; created: CreatedTasks; guard: AdminTextGuard };
