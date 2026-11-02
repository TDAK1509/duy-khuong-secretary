import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import importX from 'eslint-plugin-import-x';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import tseslint from 'typescript-eslint';

const SOURCE_FOLDERS = ['app', 'services', 'providers', 'bootstrap'];
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
    ...makeProviderConfigs(rootDir),
  ];
}

/** @returns {import('eslint').Linter.Config[]} */
function makeProviderConfigs(rootDir) {
  return listProviderRoles(rootDir).map((role) =>
    makeFolderConfig(rootDir, `providers/${role}`, {
      folders: ['services'],
      files: [`providers/${role}`],
      mayImportVendors: true,
    }),
  );
}

function listProviderRoles(rootDir) {
  const providersDir = join(rootDir, 'src/providers');
  if (!existsSync(providersDir)) return [];
  return readdirSync(providersDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
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
      ...restrictPaths(rootDir, forbidFolders(folder, importable)),
      ...(importable.mayImportVendors ? {} : restrictVendorPackages()),
    },
  };
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
