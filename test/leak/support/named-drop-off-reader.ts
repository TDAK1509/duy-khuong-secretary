import type { ReaderRequest, ReaderResult } from '../../../src/services/reading/reader-service.ts';
import { RecordingReader } from './recording-reader.ts';

type OfferedNames = { drop_offs: { id: string; name: string }[]; receivers: { id: string; name: string }[] };

export class NamedDropOffReader extends RecordingReader {
  override async read(request: ReaderRequest): Promise<ReaderResult> {
    await super.read(request);
    if (request.schemaName !== 'trip_drop_off_meanings') return { ok: false, reason: 'unavailable' };
    return { ok: true, json: { meanings: listMeanings(readOfferedNames(request)) }, usage: null };
  }
}

function readOfferedNames({ userParts }: ReaderRequest): OfferedNames {
  const [first] = userParts;
  const json = first?.kind === 'text' ? (first.text.split('\n')[1] ?? '{}') : '{}';
  return JSON.parse(json) as OfferedNames;
}

function listMeanings({ drop_offs: dropOffs, receivers }: OfferedNames): { drop_off: string; receivers: string[] }[] {
  return dropOffs.map((dropOff) => ({ drop_off: dropOff.id, receivers: receivers.filter((receiver) => receiver.name === dropOff.name).map((receiver) => receiver.id) }));
}
