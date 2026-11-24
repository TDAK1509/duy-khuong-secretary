import { sharePrintedTime } from '../documents/describe-trip-ticket.ts';
import type { TripPaper } from './list-trip-papers.ts';

export type PaperSide = 'pickup' | 'dropOff';

export type RepeatedPaper = { side: PaperSide; paper: TripPaper; kept: TripPaper };

export type PapersWithoutRepeats = { papers: TripPaper[]; repeats: RepeatedPaper[] };

export function dropRepeatedPapers(papers: TripPaper[], side: PaperSide): PapersWithoutRepeats {
  const repeats = listRepeatGroups(papers).flatMap((group) => listRepeatsOfKeptPaper(group, side));
  const repeatIds = new Set(repeats.map(({ paper }) => paper.id));
  return { papers: papers.filter(({ id }) => !repeatIds.has(id)), repeats };
}

function listRepeatGroups(papers: TripPaper[]): TripPaper[][] {
  const sameLoad = new Map<string, TripPaper[]>();
  for (const paper of papers) {
    const key = readLoadKey(paper);
    if (key !== null) sameLoad.set(key, [...(sameLoad.get(key) ?? []), paper]);
  }
  return [...sameLoad.values()].flatMap(splitByPrintedTimes);
}

function readLoadKey({ vehicle_plate: plate, document_date: date, weight_kg: weightKg }: TripPaper): string | null {
  return plate === null || date === null || weightKg === null ? null : `${plate}|${date}|${Number(weightKg)}`;
}

function splitByPrintedTimes(papers: TripPaper[]): TripPaper[][] {
  const groups: TripPaper[][] = [];
  for (const paper of papers) {
    const group = groups.find((members) => members.every((member) => sharePrintedTime(member.printed_times, paper.printed_times)));
    if (group === undefined) groups.push([paper]);
    else group.push(paper);
  }
  return groups;
}

function listRepeatsOfKeptPaper(group: TripPaper[], side: PaperSide): RepeatedPaper[] {
  const [first] = group as [TripPaper, ...TripPaper[]];
  const kept = group.find((paper) => paper.document_number !== null) ?? first;
  return group.filter((paper) => paper !== kept).map((paper) => ({ side, paper, kept }));
}
