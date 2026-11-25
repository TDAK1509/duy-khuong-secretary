import type { AccessScope } from '../../access/access-scope.ts';
import type { AdminToolDependencies } from '../tools/tool-dependencies.ts';

export type RiskyCheck = {
  targets: string[] | null;
  writeQuestion: () => string | Promise<string>;
};

export type RiskyChecker = (dependencies: AdminToolDependencies, scope: AccessScope, parsedArguments: unknown) => Promise<RiskyCheck>;
