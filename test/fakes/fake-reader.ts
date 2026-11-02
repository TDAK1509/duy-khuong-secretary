import type { ReaderRequest, ReaderResult, ReaderService } from '../../src/services/reading/reader-service.ts';

export class FakeReader implements ReaderService {
  readonly label: string;
  readonly requests: ReaderRequest[] = [];
  private readonly respond: (request: ReaderRequest) => ReaderResult;

  constructor(label: string, respond: (request: ReaderRequest) => ReaderResult) {
    this.label = label;
    this.respond = respond;
  }

  async read(request: ReaderRequest): Promise<ReaderResult> {
    this.requests.push(request);
    return this.respond(request);
  }
}

export function makeReaderReturning(label: string, json: unknown): FakeReader {
  return new FakeReader(label, () => ({ ok: true, json }));
}
