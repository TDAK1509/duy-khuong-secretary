import type { MigrationBuilder } from '../migration-builder.ts';

const MEMORY_BELONGS_TO_AUTHOR = `workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid
  AND author_user_id = nullif(current_setting('app.owner_user_id', true), '')::uuid`;
const SPLIT_INTO_NUMBERED_LINES = `regexp_split_to_table(memory.markdown, E'\\n') WITH ORDINALITY AS line(text, position)`;
const LINE_WITHOUT_ITS_DASH = `substr(line.text, 3)`;
const LINE_ORDER_AFTER_THE_LAST_UPDATE = `memory.updated_at + line.position * interval '1 microsecond'`;

export function up(pgm: MigrationBuilder): void {
  createPrivateMemories(pgm);
  createMemberFacts(pgm);
}

function createPrivateMemories(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE private_memories (
      id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      author_user_id uuid NOT NULL,
      readers text NOT NULL DEFAULT 'author' CHECK (readers = 'author'),
      fact text NOT NULL CHECK (btrim(fact) <> ''),
      created_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (workspace_id, author_user_id) REFERENCES memberships (workspace_id, user_id) ON DELETE CASCADE
    )
  `);
  pgm.sql('CREATE INDEX private_memories_workspace_id_author_user_id_created_at_idx ON private_memories (workspace_id, author_user_id, created_at)');
  pgm.sql('ALTER TABLE private_memories ENABLE ROW LEVEL SECURITY');
  pgm.sql(`CREATE POLICY in_scope ON private_memories USING (${MEMORY_BELONGS_TO_AUTHOR}) WITH CHECK (${MEMORY_BELONGS_TO_AUTHOR})`);
  pgm.sql(`
    INSERT INTO private_memories (workspace_id, author_user_id, fact, created_at)
    SELECT memory.workspace_id, memory.user_id, ${LINE_WITHOUT_ITS_DASH}, ${LINE_ORDER_AFTER_THE_LAST_UPDATE}
    FROM user_memories memory CROSS JOIN LATERAL ${SPLIT_INTO_NUMBERED_LINES}
  `);
}

function createMemberFacts(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE member_facts (
      id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      member_user_id uuid NOT NULL,
      author_user_id uuid REFERENCES users (id),
      readers text NOT NULL CHECK (readers IN ('author', 'admins', 'admins_and_member')),
      fact text NOT NULL CHECK (btrim(fact) <> ''),
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (readers <> 'author' OR author_user_id IS NOT NULL),
      FOREIGN KEY (workspace_id, member_user_id) REFERENCES memberships (workspace_id, user_id) ON DELETE CASCADE
    )
  `);
  pgm.sql('CREATE INDEX member_facts_workspace_id_member_user_id_created_at_idx ON member_facts (workspace_id, member_user_id, created_at)');
  pgm.sql(`
    INSERT INTO member_facts (workspace_id, member_user_id, author_user_id, readers, fact, created_at)
    SELECT memory.workspace_id, memory.user_id, NULL, 'admins_and_member', ${LINE_WITHOUT_ITS_DASH}, ${LINE_ORDER_AFTER_THE_LAST_UPDATE}
    FROM member_memories memory CROSS JOIN LATERAL ${SPLIT_INTO_NUMBERED_LINES}
  `);
}
