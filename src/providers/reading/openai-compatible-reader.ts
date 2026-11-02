import OpenAI from 'openai';
import type { Photo } from '../../services/storage/photo-storage.ts';
import type { ReaderRequest, ReaderResult, ReaderService } from '../../services/reading/reader-service.ts';

export type OpenAiCompatibleReaderSettings = {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  reasoningEffort?: string;
};

export class OpenAiCompatibleReader implements ReaderService {
  readonly label: string;
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly reasoningEffort: OpenAI.ReasoningEffort | undefined;

  constructor(settings: OpenAiCompatibleReaderSettings) {
    this.label = settings.model;
    this.model = settings.model;
    this.reasoningEffort = settings.reasoningEffort as OpenAI.ReasoningEffort | undefined;
    this.client = new OpenAI({
      baseURL: settings.baseUrl,
      apiKey: settings.apiKey,
      timeout: settings.timeoutMs,
      maxRetries: 0,
    });
  }

  async read(request: ReaderRequest): Promise<ReaderResult> {
    try {
      const completion = await this.client.chat.completions.create(this.buildParameters(request));
      return { ok: true, json: JSON.parse(completion.choices[0]?.message.content ?? '') };
    } catch (error) {
      if (error instanceof OpenAI.APIConnectionTimeoutError) return { ok: false, reason: 'timeout' };
      throw error;
    }
  }

  private buildParameters(request: ReaderRequest): OpenAI.Chat.ChatCompletionCreateParamsNonStreaming {
    return {
      model: this.model,
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: buildUserContent(request) },
      ],
      reasoning_effort: this.reasoningEffort,
      response_format: {
        type: 'json_schema',
        json_schema: { name: request.schemaName, schema: request.schema, strict: true },
      },
    };
  }
}

function buildUserContent(request: ReaderRequest): OpenAI.Chat.ChatCompletionContentPart[] {
  const parts: OpenAI.Chat.ChatCompletionContentPart[] = [];
  if (request.text !== null) parts.push({ type: 'text', text: request.text });
  if (request.image !== null) parts.push({ type: 'image_url', image_url: { url: toDataUrl(request.image) } });
  return parts;
}

function toDataUrl(photo: Photo): string {
  return `data:${photo.contentType};base64,${Buffer.from(photo.bytes).toString('base64')}`;
}
