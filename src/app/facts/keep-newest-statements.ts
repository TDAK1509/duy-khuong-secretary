export const MAX_STATEMENT_LENGTH = 2000;
const STATEMENT_SEPARATOR = '\n';

export function joinNewestStatements(newest: string, stored: string): string {
  const kept: string[] = [];
  for (const statement of [newest, ...stored.split(STATEMENT_SEPARATOR)]) {
    if ([...kept, statement].join(STATEMENT_SEPARATOR).length > MAX_STATEMENT_LENGTH) break;
    kept.push(statement);
  }
  return kept.join(STATEMENT_SEPARATOR);
}

export function flattenStatement(raw: string): string {
  return raw.trim().replace(/\s*\n\s*/g, ' ');
}
