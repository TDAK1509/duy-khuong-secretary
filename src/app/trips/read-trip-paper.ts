import type { TripPaper } from './list-trip-papers.ts';

export function readPickupPlace(paper: TripPaper): string | null {
  return paper.route_pickup ?? readPickupIssuer(paper);
}

export function readPickupIssuer(paper: TripPaper): string | null {
  return paper.stage === 'receipt' ? null : paper.issuer_name;
}

export function groupPossibleDuplicates(papers: TripPaper[]): TripPaper[][] {
  const groups = new Map<string, TripPaper[]>();
  for (const paper of papers) {
    const pickupKey = readPickupKey(paper);
    if (paper.vehicle_plate === null || paper.document_date === null || pickupKey === null) continue;
    const key = `${paper.vehicle_plate}|${paper.document_date}|${pickupKey}`;
    groups.set(key, [...(groups.get(key) ?? []), paper]);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

function readPickupKey(paper: TripPaper): string | null {
  if (paper.route_pickup_key !== null) return `name:${paper.route_pickup_key}`;
  if (paper.route_dropoff !== null || paper.stage === 'receipt') return null;
  return paper.issuer_company_id === null ? null : `company:${paper.issuer_company_id}`;
}

export function readWeightKg(paper: TripPaper | null): number | null {
  return paper === null || paper.weight_kg === null ? null : Number(paper.weight_kg);
}
