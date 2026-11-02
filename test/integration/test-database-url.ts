const LOCAL_COMPOSE_DATABASE_URL = 'postgres://app_owner:app_owner@localhost:5432/secretary';

export const testDatabaseUrl = process.env['DATABASE_URL'] ?? LOCAL_COMPOSE_DATABASE_URL;

export const superuserDatabaseUrl = process.env['SUPERUSER_DATABASE_URL'] ?? deriveLocalSuperuserUrl();

function deriveLocalSuperuserUrl(): string {
  const url = new URL(testDatabaseUrl);
  url.username = 'postgres';
  url.password = 'postgres';
  return url.toString();
}
