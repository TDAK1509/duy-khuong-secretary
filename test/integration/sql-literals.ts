export function literal(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function timestamp(value: Date | null): string {
  return value ? `'${value.toISOString()}'::timestamptz` : 'NULL';
}
