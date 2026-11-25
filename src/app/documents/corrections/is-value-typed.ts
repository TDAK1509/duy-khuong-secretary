const CODE_SEPARATOR = '[\\s.\\-_/]*';

export function isCodeTyped(typedTexts: string[], code: string): boolean {
  const spelledWithSeparators = [...code].map(escapeCharacter).join(CODE_SEPARATOR);
  const pattern = new RegExp(`(?<![A-Z0-9])${spelledWithSeparators}(?![A-Z0-9])`, 'i');
  return typedTexts.some((text) => pattern.test(text));
}

function escapeCharacter(character: string): string {
  return character.replace(/[\\^$.*+?()[\]{}|/-]/g, '\\$&');
}

export function isDateTyped(typedTexts: string[], isoDate: string): boolean {
  const [, month, day] = isoDate.split('-').map(Number);
  const pattern = new RegExp(`(?<!\\d)0?${day}\\s*(?:[/.\\-]|th[aá]ng)\\s*0?${month}(?!\\d)`, 'i');
  return typedTexts.some((text) => pattern.test(text.normalize('NFC')));
}
