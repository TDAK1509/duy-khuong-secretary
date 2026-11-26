export type AttackCase = {
  name: string;
  kind: 'read' | 'change';
  arguments: object;
};
