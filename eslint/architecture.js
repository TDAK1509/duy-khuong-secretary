import importX from 'eslint-plugin-import-x';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import tseslint from 'typescript-eslint';

const SOURCE_FOLDERS = ['app', 'services', 'providers', 'bootstrap'];
const MIGRATION_TOOL_PATH = './src/providers/database/migration-tool.ts';
const VENDOR_PACKAGES = ['openai', '@aws-sdk/*', 'pg', 'node-pg-migrate', 'fastify'];

/** @returns {import('eslint').Linter.Config[]} */
export function makeArchitectureConfig(rootDir) {
  return [
    makeParserConfig(),
    makeFolderConfig(rootDir, 'services', { folders: ['services'] }),
    makeFolderConfig(rootDir, 'app', { folders: ['app', 'services'] }),
    makeFolderConfig(rootDir, 'app/db', {
      folders: ['app', 'services'],
      files: ['providers/database/postgres.ts'],
    }),
    makeFolderConfig(rootDir, 'providers', { folders: ['services'], mayImportVendors: true }),
    makeFolderConfig(rootDir, 'bootstrap', {
      folders: SOURCE_FOLDERS,
      mayImportVendors: true,
      isMigrationToolForbidden: true,
    }),
    makeMigrationEntryConfig(),
    makeTestConfig(rootDir),
  ];
}

/** @returns {import('eslint').Linter.Config} */
function makeMigrationEntryConfig() {
  return { files: ['src/bootstrap/migrate.ts'], rules: { 'import-x/no-restricted-paths': 'off' } };
}

/** @returns {import('eslint').Linter.Config} */
function makeTestConfig(rootDir) {
  return {
    files: ['test/**/*.ts'],
    rules: restrictPaths(rootDir, [{ target: './test', from: MIGRATION_TOOL_PATH }]),
  };
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

/** @returns {import('eslint').Linter.Config} */
function makeFolderConfig(rootDir, folder, importable) {
  return {
    files: [`src/${folder}/**/*.ts`],
    rules: {
      ...restrictPaths(rootDir, listZones(folder, importable)),
      ...(importable.mayImportVendors ? {} : restrictVendorPackages()),
    },
  };
}

function listZones(folder, importable) {
  const zones = forbidFolders(folder, importable);
  if (importable.isMigrationToolForbidden) {
    zones.push({ target: `./src/${folder}`, from: MIGRATION_TOOL_PATH });
  }
  return zones;
}

function forbidFolders(folder, { folders, files = [] }) {
  return SOURCE_FOLDERS.filter((other) => !folders.includes(other)).map((other) => ({
    target: `./src/${folder}`,
    from: `./src/${other}`,
    except: listExceptions(other, files),
  }));
}

function listExceptions(forbiddenFolder, allowedFiles) {
  return allowedFiles
    .filter((file) => file.startsWith(`${forbiddenFolder}/`))
    .map((file) => `./${file.slice(forbiddenFolder.length + 1)}`);
}

/** @returns {import('eslint').Linter.RulesRecord} */
function restrictPaths(rootDir, zones) {
  return { 'import-x/no-restricted-paths': ['error', { basePath: rootDir, zones }] };
}

/** @returns {import('eslint').Linter.RulesRecord} */
function restrictVendorPackages() {
  return {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: VENDOR_PACKAGES,
            message: 'Vendor packages are imported only in src/providers and src/bootstrap.',
          },
        ],
      },
    ],
  };
}
