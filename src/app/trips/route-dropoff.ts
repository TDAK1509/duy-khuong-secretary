import { buildAccentFreeKey } from '../facts/link-facts.ts';

const THEN_DROPOFF_KEY = `nullif(${buildAccentFreeKey('entry.then_dropoff')}, '')`;

export const ROUTE_DROPOFF_KEY_SQL = `coalesce(entry.when_dropoff_match_key, ${THEN_DROPOFF_KEY})`;

export const ROUTE_DROPOFF_NAME_SQL = `(CASE WHEN entry.when_dropoff_name IS NOT NULL THEN entry.when_dropoff_name WHEN ${THEN_DROPOFF_KEY} IS NOT NULL THEN entry.then_dropoff END)`;

export const IS_ROUTE_ENTRY_SQL = `(entry.when_pickup_match_key IS NOT NULL OR ${ROUTE_DROPOFF_KEY_SQL} IS NOT NULL)`;
