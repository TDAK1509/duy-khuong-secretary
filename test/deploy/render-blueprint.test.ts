import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/bootstrap/config.ts';
import { loadChatConfig } from '../../src/bootstrap/chat-config.ts';
import { loadPhotoStorageConfig } from '../../src/bootstrap/photo-storage-config.ts';
import { loadReaderConfig } from '../../src/bootstrap/reader-config.ts';
import { loadZaloConfig, loadZaloWebhookConfig } from '../../src/bootstrap/zalo-config.ts';

type Blueprint = {
  services: Array<Record<string, unknown>>;
  databases: Array<Record<string, unknown>>;
};

type EnvVar = {
  key: string;
  value?: string;
  sync?: boolean;
  generateValue?: boolean;
  fromDatabase?: { name: string; property: string };
};

const blueprint = parse(
  readFileSync(new URL('../../render.yaml', import.meta.url), 'utf8'),
) as Blueprint;

describe('render.yaml web service', () => {
  it('deploys the main branch to Singapore once its checks pass, migrating first', () => {
    expect(blueprint.services).toHaveLength(1);
    expect(blueprint.services[0]).toMatchObject({
      type: 'web',
      runtime: 'docker',
      region: 'singapore',
      branch: 'main',
      autoDeployTrigger: 'checksPass',
      healthCheckPath: '/health',
      preDeployCommand: 'node dist/bootstrap/migrate.js',
    });
  });
});

describe('render.yaml database', () => {
  it('runs Postgres 17 in Singapore and feeds the migration URL from it', () => {
    const [database] = blueprint.databases;
    const [service] = blueprint.services;

    expect(blueprint.databases).toHaveLength(1);
    expect(database).toMatchObject({ region: 'singapore', postgresMajorVersion: '17' });
    expect(listEnvVars(service)).toEqual(
      expect.arrayContaining([
        {
          key: 'MIGRATION_DATABASE_URL',
          fromDatabase: { name: database?.['name'], property: 'connectionString' },
        },
      ]),
    );
  });
});

describe('render.yaml prompts', () => {
  it('asks only for the true secrets', () => {
    const envVars = listEnvVars(blueprint.services[0]);

    expect(envVars.filter((envVar) => envVar.sync === false).map((envVar) => envVar.key)).toEqual([
      'ZALO_APP_ID',
      'ZALO_APP_SECRET',
      'ZALO_OA_SECRET',
      'S3_ENDPOINT',
      'S3_ACCESS_KEY_ID',
      'S3_SECRET_ACCESS_KEY',
      'LLM_API_KEY',
    ]);
    const fixedSecretKeys = envVars
      .filter((envVar) => 'value' in envVar)
      .map((envVar) => envVar.key)
      .filter((key) => /_(KEY|KEY_ID|SECRET|PASSWORD)$/.test(key));
    expect(fixedSecretKeys).toEqual([]);
  });
});

describe('render.yaml generated values', () => {
  it('generates the runtime password and the encryption key and does not declare DATABASE_URL', () => {
    const envVars = listEnvVars(blueprint.services[0]);

    expect(envVars.filter((envVar) => envVar.generateValue === true).map((envVar) => envVar.key)).toEqual([
      'APP_RUNTIME_PASSWORD',
      'CHANNEL_TOKEN_ENCRYPTION_KEY',
    ]);
    expect(envVars.map((envVar) => envVar.key)).not.toContain('DATABASE_URL');
  });
});

describe('render.yaml environment', () => {
  it('turns every feature group on once the prompts are filled', () => {
    const environment = buildBlueprintEnvironment('placeholder');

    const config = loadConfig(environment);
    const chat = loadChatConfig(environment);

    expect(new URL(config.databaseUrl).username).toBe('app_runtime');
    expect(loadZaloConfig(environment).ok).toBe(true);
    expect(loadZaloWebhookConfig(environment).ok).toBe(true);
    expect(loadPhotoStorageConfig(environment).ok).toBe(true);
    expect(loadReaderConfig(environment).ok).toBe(true);
    expect(chat.ok && chat.config).toMatchObject({ model: 'gpt-6-luna', reasoningEffort: 'none' });
  });
});

describe('render.yaml reader', () => {
  it('reads with gpt-6.1-sol at medium effort', () => {
    const readers = loadReaderConfig(buildBlueprintEnvironment('placeholder'));

    expect(readers.ok && readers.config).toMatchObject({ model: 'gpt-6.1-sol', reasoningEffort: 'medium' });
  });
});

describe('render.yaml with every prompt left blank', () => {
  it('still starts, with every feature group off', () => {
    const environment = buildBlueprintEnvironment('');

    expect(() => loadConfig(environment)).not.toThrow();
    expect(loadZaloConfig(environment).ok).toBe(false);
    expect(loadZaloWebhookConfig(environment).ok).toBe(false);
    expect(loadPhotoStorageConfig(environment).ok).toBe(false);
    expect(loadReaderConfig(environment).ok).toBe(false);
    expect(loadChatConfig(environment).ok).toBe(false);
  });
});

describe('render.yaml database access', () => {
  it('allows no external connection', () => {
    expect(blueprint.databases[0]?.['ipAllowList']).toEqual([]);
  });
});

function buildBlueprintEnvironment(promptedText: string): NodeJS.ProcessEnv {
  const entries = listEnvVars(blueprint.services[0]).map((envVar): [string, string] => [
    envVar.key,
    readEnvVarValue(envVar, promptedText),
  ]);
  return {
    ...Object.fromEntries(entries),
    RENDER_EXTERNAL_URL: 'https://duy-khuong-secretary.onrender.com',
  };
}

function readEnvVarValue(envVar: EnvVar, promptedText: string): string {
  if (envVar.value !== undefined) return envVar.value;
  if (envVar.generateValue) return Buffer.alloc(32, 7).toString('base64');
  if (envVar.fromDatabase) return 'postgresql://secretary:ownerpw@dpg-x-a/secretary';
  if (envVar.key === 'S3_ENDPOINT') return promptedText ? 'https://account.r2.test' : '';
  return promptedText;
}

function listEnvVars(service: Record<string, unknown> | undefined): EnvVar[] {
  return (service?.['envVars'] as EnvVar[] | undefined) ?? [];
}
