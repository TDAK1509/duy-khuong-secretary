export type MigrationBuilder = {
  sql(statement: string): void;
  noTransaction(): void;
};
