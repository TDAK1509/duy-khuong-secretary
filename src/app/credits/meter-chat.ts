import type { ChatService } from '../../services/chat/chat-service.ts';
import type { LlmCallKind } from './llm-call-kind.ts';
import { recordCall, type CallMeter } from './record-call.ts';

export function meterChat(chat: ChatService, meter: CallMeter, kind: LlmCallKind): ChatService {
  return {
    model: chat.model,
    respond: async (request) => {
      const result = await chat.respond(request);
      await recordCall(meter, { kind, model: chat.model, usage: result.ok ? result.usage : null });
      return result;
    },
  };
}
