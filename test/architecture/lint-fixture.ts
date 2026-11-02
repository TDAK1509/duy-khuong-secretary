import { fileURLToPath } from 'node:url';
import { ESLint, type Linter } from 'eslint';
import { makeArchitectureConfig } from '../../eslint/architecture.js';

export async function lintFixture(
  fixtureName: string,
  filePath: string,
): Promise<Linter.LintMessage[]> {
  const fixtureRoot = fileURLToPath(new URL(`./${fixtureName}/`, import.meta.url));
  const eslint = new ESLint({
    cwd: fixtureRoot,
    overrideConfigFile: true,
    overrideConfig: makeArchitectureConfig(fixtureRoot),
  });
  const [result] = await eslint.lintFiles([filePath]);
  return result?.messages ?? [];
}
