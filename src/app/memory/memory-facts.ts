const FACT_PREFIX = '- ';

export function listFacts(markdown: string): string[] {
  return markdown === '' ? [] : markdown.split('\n').map((line) => line.slice(FACT_PREFIX.length));
}

export function writeFacts(facts: string[]): string {
  return facts.map((fact) => `${FACT_PREFIX}${fact}`).join('\n');
}
