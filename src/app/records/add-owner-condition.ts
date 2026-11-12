import type { AccessScope } from '../access/access-scope.ts';
import type { WhereClause } from './where-clause.ts';

export function addOwnerCondition(where: WhereClause, scope: AccessScope): void {
  if (scope.role === 'member') where.require(`record.user_id = ${where.bind(scope.userId)}`);
}
