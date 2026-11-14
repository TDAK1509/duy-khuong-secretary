const VIETNAMESE_PLATE_PATTERN = /\d{2}[A-Z]-?\d{3,4}\.?\d{2}/;

export function extractPlateFromFacts(facts: string[]): string | null {
  for (let i = facts.length - 1; i >= 0; i--) {
    const match = facts[i]?.match(VIETNAMESE_PLATE_PATTERN);
    if (match) return match[0];
  }
  return null;
}
