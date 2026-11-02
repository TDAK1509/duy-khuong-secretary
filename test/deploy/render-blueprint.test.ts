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
