const LOCAL_COMPOSE_DATABASE_URL = 'postgres://app_owner:app_owner@localhost:5432/secretary';

export const testDatabaseUrl = process.env['DATABASE_URL'] ?? LOCAL_COMPOSE_DATABASE_URL;
