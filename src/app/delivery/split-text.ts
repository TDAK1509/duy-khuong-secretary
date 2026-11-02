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
  for (const separator of ['\n', ' ']) {
    const index = text.lastIndexOf(separator, maxLength);
    if (index > 0) return { endOfPart: index, startOfRest: index + 1 };
  }
  return { endOfPart: maxLength, startOfRest: maxLength };
}
