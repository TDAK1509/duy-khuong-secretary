import pg from 'pg';

export type SetRolePasswordRequest = {
  databaseUrl: string;
  role: string;
  password: string;
};

export async function setRolePassword(request: SetRolePasswordRequest): Promise<void> {
  const client = new pg.Client({ connectionString: request.databaseUrl });
  await client.connect();
  try {
    await client.query(
      `ALTER ROLE ${pg.escapeIdentifier(request.role)} WITH LOGIN PASSWORD ${pg.escapeLiteral(request.password)}`,
    );
  } finally {
    await client.end();
  }
}
