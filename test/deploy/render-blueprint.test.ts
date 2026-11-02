import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

type Blueprint = {
  services: Array<Record<string, unknown>>;
  databases: Array<Record<string, unknown>>;
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
  it('runs Postgres 17 in Singapore and feeds both database URLs from it', () => {
    const [database] = blueprint.databases;
    const [service] = blueprint.services;

    expect(blueprint.databases).toHaveLength(1);
    expect(database).toMatchObject({ region: 'singapore', postgresMajorVersion: '17' });
    expect(listEnvVars(service)).toEqual(
      expect.arrayContaining([
        {
          key: 'DATABASE_URL',
          fromDatabase: { name: database?.['name'], property: 'connectionString' },
        },
        {
          key: 'MIGRATION_DATABASE_URL',
          fromDatabase: { name: database?.['name'], property: 'connectionString' },
        },
      ]),
    );
  });
});

describe('render.yaml other env vars', () => {
  it('leaves every value that is not a database URL to be entered by hand', () => {
    const others = listEnvVars(blueprint.services[0]).filter(
      (envVar) => !(envVar as Record<string, unknown>)['fromDatabase'],
    );

    expect(others.every((envVar) => (envVar as Record<string, unknown>)['sync'] === false)).toBe(
      true,
    );
  });
});

function listEnvVars(service: Record<string, unknown> | undefined): unknown[] {
  return (service?.['envVars'] as unknown[] | undefined) ?? [];
}
