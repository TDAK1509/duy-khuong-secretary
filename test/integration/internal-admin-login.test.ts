import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/bootstrap/server.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

const NOW = new Date('2026-11-02T10:00:00+07:00');

describe('GET /admin without a session', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  it('shows the login page with its four steps', async () => {
    const response = await buildServer(pool, null, { internalAdmin: { database: pool, clock: new FakeClock(NOW) } }).inject({ method: 'GET', url: '/admin' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Trang quản trị Trợ lý');
    expect(response.body).toContain('Trang này chỉ dành cho người vận hành Trợ lý.');
    expect(response.body).toContain('1. Mở khung chat với Trợ lý trong Zalo.');
    expect(response.body).toContain('2. Nhắn: đăng nhập quản trị');
    expect(response.body).toContain('3. Trợ lý gửi mã trong một tin nhắn riêng. Sao chép mã rồi dán vào ô dưới đây.');
    expect(response.body).toContain('4. Bấm "Đăng nhập".');
    expect(response.headers['content-security-policy']).toContain("form-action 'self'");
    expect(response.headers['cache-control']).toBe('no-store');
  });
});
