export function splitText(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];
  return [text.slice(0, maxLength), text.slice(maxLength)];
}
