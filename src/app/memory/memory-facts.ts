import { ToolRefusal } from '../admin-chat/tools/tool-result.ts';

const FACT_PREFIX = '- ';
const MAX_FACT_LENGTH = 200;
const MAX_MARKDOWN_LENGTH = 2000;
const LINE_BREAK_OR_CONTROL = /[\p{Cc}\p{Zl}\p{Zp}]/u;

export function listFacts(markdown: string): string[] {
  return markdown === '' ? [] : markdown.split('\n').map((line) => line.slice(FACT_PREFIX.length));
}

export function writeFacts(facts: string[]): string {
  return facts.map((fact) => `${FACT_PREFIX}${fact}`).join('\n');
}

export function isValidFact(fact: string): boolean {
  const length = [...fact].length;
  return length >= 1 && length <= MAX_FACT_LENGTH && !LINE_BREAK_OR_CONTROL.test(fact);
}

export function addFact(markdown: string, fact: string, fullError: string): string {
  const facts = listFacts(markdown);
  if (facts.includes(fact)) return markdown;
  const extended = writeFacts([...facts, fact]);
  if ([...extended].length > MAX_MARKDOWN_LENGTH) throw new ToolRefusal(fullError);
  return extended;
}

export function removeFact(markdown: string, fact: string, notFoundError: string): string {
  const facts = listFacts(markdown);
  if (!facts.includes(fact)) throw new ToolRefusal(notFoundError);
  return writeFacts(facts.filter((saved) => saved !== fact));
}
