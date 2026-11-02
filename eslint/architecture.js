import importX from 'eslint-plugin-import-x';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import tseslint from 'typescript-eslint';

/** @returns {import('eslint').Linter.Config[]} */
export function makeArchitectureConfig(rootDir) {
  return [
    makeParserConfig(),
    {
      files: ['src/services/**/*.ts'],
      rules: restrictPaths(rootDir, [{ target: './src/services', from: './src/app' }]),
    },
  ];
}

/** @returns {import('eslint').Linter.Config} */
function makeParserConfig() {
  return {
    files: ['**/*.ts'],
    languageOptions: { parser: tseslint.parser },
    plugins: { 'import-x': importX },
    settings: { 'import-x/resolver-next': [createTypeScriptImportResolver()] },
  };
}

/** @returns {import('eslint').Linter.RulesRecord} */
function restrictPaths(rootDir, zones) {
  return { 'import-x/no-restricted-paths': ['error', { basePath: rootDir, zones }] };
}
