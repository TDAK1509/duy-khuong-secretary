import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { openLeakDatabases } from './support/leak-databases.ts';

const databases = openLeakDatabases();

after(() => databases.close());

test('the runtime role cannot bypass row-level security', async () => {
  const { rows } = await databases.runtime.query(
    `SELECT role.rolname, role.rolsuper, role.rolbypassrls,
       EXISTS (
         SELECT 1 FROM pg_class
         WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r', 'p') AND relowner = role.oid
       ) AS owns_tables
     FROM pg_roles role WHERE role.rolname = current_user`,
  );
  assert.deepEqual(rows, [{ rolname: 'app_runtime', rolsuper: false, rolbypassrls: false, owns_tables: false }]);
});
