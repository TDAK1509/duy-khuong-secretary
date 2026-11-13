import type { ReaderRequest, ReaderResult, ReaderService } from '../../services/reading/reader-service.ts';
import type { TokenUsage } from '../../services/usage/token-usage.ts';
import type { LlmCallKind } from './llm-call-kind.ts';
import { recordCall, type CallMeter } from './record-call.ts';

export function meterReader(reader: ReaderService, meter: CallMeter, chooseKind: (request: ReaderRequest) => LlmCallKind): ReaderService {
  return {
    model: reader.model,
    read: async (request) => {
      const result = await reader.read(request);
      await recordCall(meter, { kind: chooseKind(request), model: reader.model, usage: findUsage(result) });
      return result;
    },
  };
}

function findUsage(result: ReaderResult): TokenUsage | null {
  return 'usage' in result ? result.usage : null;
}
