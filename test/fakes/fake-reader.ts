import type { ReaderRequest, ReaderResult, ReaderService, TokenUsage } from '../../src/services/reading/reader-service.ts';

const NO_WORK_DATA = { has_work_data: false, needs_explanation: false, has_question: false, items: [] };

export class FakeReader implements ReaderService {
  readonly requests: ReaderRequest[] = [];
  private respond: (request: ReaderRequest) => ReaderResult;

  constructor(respond: (request: ReaderRequest) => ReaderResult = () => ({ ok: true, json: NO_WORK_DATA })) {
    this.respond = respond;
  }

  answerWith(json: unknown, usage?: TokenUsage): void {
    this.respond = () => ({ ok: true, json, usage });
  }

  failWith(reason: 'timeout' | 'invalid_output' | 'unavailable'): void {
    this.respond = () => ({ ok: false, reason });
  }

  async read(request: ReaderRequest): Promise<ReaderResult> {
    this.requests.push(request);
    return this.respond(request);
  }
}
