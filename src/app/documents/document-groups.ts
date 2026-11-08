export const DOCUMENT_GROUPS = ['none', 'day'] as const;

export type DocumentGroup = (typeof DOCUMENT_GROUPS)[number];

export function buildGroupSql(group: DocumentGroup, documentDateSql: string): string {
  return group === 'day' ? `to_char(${documentDateSql}, 'YYYY-MM-DD')` : 'NULL::text';
}
