const REQUIRED_NAMES = [
  'READER_PROVIDER',
  ...['READER_CHEAP_1', 'READER_CHEAP_2', 'READER_STRONG_1', 'READER_STRONG_2'].flatMap((slot) => [
    `${slot}_BASE_URL`,
    `${slot}_API_KEY`,
    `${slot}_MODEL`,
  ]),
];

export type ReaderConfigResult = { ok: false; missing: string[] };

export function loadReaderConfig(environment: NodeJS.ProcessEnv): ReaderConfigResult {
  const missing = REQUIRED_NAMES.filter((name) => !environment[name]);
  return { ok: false, missing };
}
