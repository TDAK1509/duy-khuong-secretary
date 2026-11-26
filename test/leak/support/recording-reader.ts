import type { ReaderRequest, ReaderResult, ReaderService } from '../../../src/services/reading/reader-service.ts';

export class RecordingReader implements ReaderService {
  readonly requests: ReaderRequest[] = [];

  chooseModel(): string {
    return 'leak-test-reader';
  }

  async read(request: ReaderRequest): Promise<ReaderResult> {
    this.requests.push(request);
    return { ok: false, reason: 'unavailable' };
  }
}
