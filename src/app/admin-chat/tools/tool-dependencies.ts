import type { Clock } from '../../../services/clock/clock.ts';
import type { Database } from '../../db/transaction.ts';
import type { PhotoAttachments } from '../photo-attachments.ts';

export type AdminToolDependencies = { database: Database; clock: Clock; attachments: PhotoAttachments };
