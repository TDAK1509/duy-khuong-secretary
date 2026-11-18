export const CUSTOMER_VALUE_NAME = 'Khách hàng';
export const CUSTOMER_VALUE_KEY = 'khachhang';

export type FactCompany = { name: string; matchKey: string };

export type FactScope = {
  vehiclePlate: string | null;
  driverUserId: string | null;
  pickup: FactCompany | null;
  dropoff: FactCompany | null;
  customer: FactCompany | null;
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
