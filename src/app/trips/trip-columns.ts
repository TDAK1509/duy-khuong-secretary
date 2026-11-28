export const TRIP_FIELDS = [
  'date', 'pickup_date', 'dropoff_date', 'plate', 'route', 'pickup_place', 'dropoff_place', 'customer', 'goods',
  'weight_kg', 'pickup_weight_kg', 'dropoff_weight_kg', 'document_number', 'pickup_document_number', 'dropoff_document_number', 'document_kind', 'sender',
] as const;

export type TripField = (typeof TRIP_FIELDS)[number];

export type TripColumn = { name: string } & (
  | { source: 'field'; field: TripField }
  | { source: 'knowledge_value'; matchKey: string }
  | { source: 'knowledge_amount'; matchKey: string }
  | { source: 'none' }
);
