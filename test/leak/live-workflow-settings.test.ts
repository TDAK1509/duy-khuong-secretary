import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const ADMIN_CHAT_SETTING_NAMES = ['CHAT_PROVIDER', 'LLM_BASE_URL', 'LLM_MODEL', 'ADMIN_CHAT_MODEL', 'ADMIN_CHAT_REASONING_EFFORT'];

test('the live workflow uses the production admin chat settings', async () => {
  const renderYaml = await readRepositoryFile('render.yaml');
  const workflow = await readRepositoryFile('.github/workflows/leak-live.yml');
  const production = readSettings(ADMIN_CHAT_SETTING_NAMES, (name) => readRenderValue(renderYaml, name));
  const live = readSettings(ADMIN_CHAT_SETTING_NAMES, (name) => readWorkflowValue(workflow, name));
  assert.deepEqual(live, production);
});

function readRepositoryFile(path: string): Promise<string> {
  return readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
}

function readSettings(names: string[], readValue: (name: string) => string): Record<string, string> {
  return Object.fromEntries(names.map((name) => [name, readValue(name)]));
}

function readRenderValue(renderYaml: string, name: string): string {
  return readMatchedValue(renderYaml.match(new RegExp(`- key: ${name}\\n\\s+value: (\\S+)`)), `render.yaml setting ${name}`);
}

function readWorkflowValue(workflow: string, name: string): string {
  return readMatchedValue(workflow.match(new RegExp(`^\\s+${name}: (\\S+)\\s*$`, 'm')), `leak-live.yml setting ${name}`);
}

function readMatchedValue(match: RegExpMatchArray | null, label: string): string {
  const value = match?.[1];
  if (value === undefined) throw new Error(`${label} was not found`);
  return value.replace(/^["']|["']$/g, '');
}
