const PLACEHOLDER = /\{([a-z_]+)\}/g;

export type PlaceholderValues = Record<string, string>;

export function fillPlaceholders(turn: string, values: PlaceholderValues): string {
  return turn.replace(PLACEHOLDER, (_placeholder, name: string) => readPlaceholderValue(values, name, turn));
}

function readPlaceholderValue(values: PlaceholderValues, name: string, turn: string): string {
  const value = values[name];
  if (value === undefined) throw new Error(`the live turn holds the placeholder {${name}}, which the seed does not fill: ${turn}`);
  return value;
}
