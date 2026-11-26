export type AttackCase = {
  name: string;
  kind: 'read' | 'change';
  arguments: object;
  alsoAimedAt?: object[];
};

export function listAttackArguments(attackCase: AttackCase): object[] {
  return [attackCase.arguments, ...(attackCase.alsoAimedAt ?? [])];
}
