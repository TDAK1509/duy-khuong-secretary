import type { ReaderRequest, ReaderResult } from '../../../src/services/reading/reader-service.ts';
import { RecordingReader } from './recording-reader.ts';

const NO_STORED_COMPANY_MATCHES = { pickup: [], dropoff: [], customer: [] };

export class NoCompanyMatchReader extends RecordingReader {
  override async read(request: ReaderRequest): Promise<ReaderResult> {
    await super.read(request);
    return { ok: true, json: NO_STORED_COMPANY_MATCHES, usage: null };
  }
}
