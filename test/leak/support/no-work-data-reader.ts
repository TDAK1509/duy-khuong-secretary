import type { ReaderRequest, ReaderResult } from '../../../src/services/reading/reader-service.ts';
import { RecordingReader } from './recording-reader.ts';

const READING_WITHOUT_WORK_DATA = {
  has_work_data: false,
  needs_explanation: false,
  has_question: false,
  photo_problem: null,
  named_driver: null,
  items: [],
};

export class NoWorkDataReader extends RecordingReader {
  override async read(request: ReaderRequest): Promise<ReaderResult> {
    await super.read(request);
    return { ok: true, json: READING_WITHOUT_WORK_DATA, usage: null };
  }
}
