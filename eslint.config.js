import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
import { makeArchitectureConfig } from './eslint/architecture.js';

export default defineConfig(
  globalIgnores(['dist/', 'coverage/', 'reports/', '.stryker-tmp/', 'test/architecture/*/']),
  js.configs.recommended,
  tseslint.configs.recommended,
  makeArchitectureConfig(import.meta.dirname),
);
