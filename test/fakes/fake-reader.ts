import type { ReaderRequest, ReaderResult, ReaderService } from '../../src/services/reading/reader-service.ts';
import type { TokenUsage } from '../../src/services/usage/token-usage.ts';

const NO_WORK_DATA = { has_work_data: false, needs_explanation: false, has_question: false, items: [] };

export class FakeReader implements ReaderService {
  readonly model = 'gpt-6.1-sol';
  readonly requests: ReaderRequest[] = [];
  private respond: (request: ReaderRequest) => ReaderResult;

  constructor(respond: (request: ReaderRequest) => ReaderResult = () => ({ ok: true, json: NO_WORK_DATA, usage: null })) {
    this.respond = respond;
  }

  answerWith(json: unknown, usage: TokenUsage | null = null): void {
    this.respond = () => ({ ok: true, json, usage });
  }

  failWith(reason: 'timeout' | 'invalid_output' | 'unavailable'): void {
    this.respond = () => (reason === 'invalid_output' ? { ok: false, reason, usage: null } : { ok: false, reason });
  }

  async read(request: ReaderRequest): Promise<ReaderResult> {
    this.requests.push(request);
    return this.respond(request);
  }
}
