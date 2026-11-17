export type FactCompany = { name: string; matchKey: string };

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
