export const ADDER_SQL = `CASE WHEN added_by IS NULL THEN NULL ELSE coalesce(
  (SELECT display_name FROM memberships WHERE user_id = added_by ORDER BY created_at, id LIMIT 1), added_by::text) END`;
