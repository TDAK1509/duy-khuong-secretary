import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

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

describe('render.yaml database access', () => {
  it('allows no external connection', () => {
    expect(blueprint.databases[0]?.['ipAllowList']).toEqual([]);
  });
});

function listEnvVars(service: Record<string, unknown> | undefined): EnvVar[] {
  return (service?.['envVars'] as EnvVar[] | undefined) ?? [];
}
