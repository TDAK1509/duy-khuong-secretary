import OpenAI from 'openai';
import type { ChatService } from '../../services/chat/chat-service.ts';

export class OpenAiCompatibleChat implements ChatService {
  readonly client = OpenAI;
}
