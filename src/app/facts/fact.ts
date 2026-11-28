export const CUSTOMER_VALUE_NAME = 'Khách hàng';
export const CUSTOMER_VALUE_KEY = 'khachhang';
export const GOODS_VALUE_KEY = 'hanghoa';

export const SELECT_FACT_CUSTOMER_SQL = `(SELECT value.text_value FROM fact_values value WHERE value.fact_id = fact.id AND value.match_key = '${CUSTOMER_VALUE_KEY}')`;

export type FactCompany = { name: string; matchKey: string; organizationIds: string[] | null };

export type FactScope = {
  vehiclePlate: string | null;
  driverUserId: string | null;
  pickup: FactCompany | null;
  dropoff: FactCompany | null;
};

export type FactValueContent = { kind: 'number'; number: number; unit: string } | { kind: 'text'; text: string };

export type FactValue = { name: string; matchKey: string; content: FactValueContent };

export type NewFact = {
  workspaceId: string;
  authorUserId: string;
  statement: string;
  scope: FactScope;
  values: FactValue[];
};
