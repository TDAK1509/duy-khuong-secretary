import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export type ProjectFixture = {
  directory: string;
  remove(): void;
};

export function createProjectFixture(files: string[]): ProjectFixture {
  const directory = mkdtempSync(join(tmpdir(), 'project-fixture-'));
  files.forEach((file) => {
    mkdirSync(dirname(join(directory, file)), { recursive: true });
    writeFileSync(join(directory, file), 'export const x = 1;\n');
  });
  return { directory, remove: () => rmSync(directory, { recursive: true, force: true }) };
}
