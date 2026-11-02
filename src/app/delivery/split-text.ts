type Cut = { endOfPart: number; startOfRest: number };

export function splitText(text: string, maxLength: number): string[] {
  const parts: string[] = [];
  let rest = text;
  while (rest.length > maxLength) {
    const cut = findCut(rest, maxLength);
    parts.push(rest.slice(0, cut.endOfPart));
    rest = rest.slice(cut.startOfRest);
  }
  parts.push(rest);
  return parts;
}

function findCut(text: string, maxLength: number): Cut {
  const lineBreak = text.lastIndexOf('\n', maxLength);
  if (lineBreak > 0) return { endOfPart: lineBreak, startOfRest: lineBreak + 1 };
  return { endOfPart: maxLength, startOfRest: maxLength };
}
