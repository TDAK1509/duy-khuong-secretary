import type { Database } from './transaction.ts';

const OWNS_TABLES_LINE =
  '[config] database role owns the tables; row-level security is not enforced until DATABASE_URL uses app_runtime.';

type RoleRow = { rolsuper: boolean; rolbypassrls: boolean; owns_tables: boolean };

export async function checkDatabaseRole(database: Database, log: (line: string) => void): Promise<void> {
  const { rows } = await database.query<RoleRow>(
    `SELECT role.rolsuper, role.rolbypassrls,
       EXISTS (
         SELECT 1 FROM pg_class
         WHERE relnamespace = 'public'::regnamespace AND relname IN ('messages', 'records', 'reply_photos')
           AND relowner = role.oid
       ) AS owns_tables
     FROM pg_roles role WHERE role.rolname = current_user`,
  );
  const [role] = rows;
  if (!role) throw new Error('the database role of DATABASE_URL was not found');
  if (role.rolsuper || role.rolbypassrls) {
    throw new Error(
      'the database role is a superuser or has BYPASSRLS, so row-level security would not apply; set DATABASE_URL to the app_runtime role',
    );
  }
  if (role.owns_tables) log(OWNS_TABLES_LINE);
}
