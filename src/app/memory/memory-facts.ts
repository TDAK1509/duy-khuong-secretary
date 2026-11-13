const FACT_PREFIX = '- ';
const MAX_FACT_LENGTH = 200;
const MAX_MARKDOWN_LENGTH = 2000;
const LINE_BREAK_OR_CONTROL = /[\p{Cc}\p{Zl}\p{Zp}]/u;

export function writeFacts(facts: string[]): string {
  return facts.map((fact) => `${FACT_PREFIX}${fact}`).join('\n');
}

export function exceedsMemoryLimit(facts: string[]): boolean {
  return [...writeFacts(facts)].length > MAX_MARKDOWN_LENGTH;
}

export function isValidFact(fact: string): boolean {
  const length = [...fact].length;
  return length >= 1 && length <= MAX_FACT_LENGTH && !LINE_BREAK_OR_CONTROL.test(fact);
}
