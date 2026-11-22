import OpenAI from 'openai';
import type { Photo } from '../../services/storage/photo-storage.ts';
import type { ReaderPart, ReaderRequest, ReaderResult, ReaderService } from '../../services/reading/reader-service.ts';
import { readTokenUsage } from '../../services/usage/read-token-usage.ts';

export type OpenAiCompatibleReaderSettings = {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  reasoningEffort?: string;
};

export class OpenAiCompatibleReader implements ReaderService {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly reasoningEffort: OpenAI.ReasoningEffort | undefined;

  constructor(settings: OpenAiCompatibleReaderSettings) {
    this.model = settings.model;
    this.reasoningEffort = settings.reasoningEffort as OpenAI.ReasoningEffort | undefined;
    this.client = new OpenAI({
      baseURL: settings.baseUrl,
      apiKey: settings.apiKey,
      timeout: settings.timeoutMs,
      maxRetries: 0,
    });
  }

  chooseModel(): string {
    return this.model;
  }

  async read(request: ReaderRequest): Promise<ReaderResult> {
    try {
      const completion = await this.client.chat.completions.create(this.buildParameters(request));
      return parseReply(completion);
    } catch (error) {
      if (error instanceof OpenAI.APIConnectionTimeoutError) return { ok: false, reason: 'timeout' };
      logApiFailure(error);
      return { ok: false, reason: 'unavailable' };
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

function parseReply(completion: OpenAI.Chat.ChatCompletion): ReaderResult {
  const usage = readTokenUsage(completion.usage);
  try {
    return { ok: true, json: JSON.parse(completion.choices[0]?.message.content ?? ''), usage };
  } catch {
    return { ok: false, reason: 'invalid_output', usage };
  }
}

function buildUserContent(request: ReaderRequest): OpenAI.Chat.ChatCompletionContentPart[] {
  return request.userParts.map((part) => toContentPart(part, request.imageDetail));
}

function toContentPart(part: ReaderPart, imageDetail: ReaderRequest['imageDetail']): OpenAI.Chat.ChatCompletionContentPart {
  if (part.kind === 'text') return { type: 'text', text: part.text };
  return { type: 'image_url', image_url: { url: toDataUrl(part.photo), detail: imageDetail } };
}

function toDataUrl(photo: Photo): string {
  return `data:${photo.contentType};base64,${Buffer.from(photo.bytes).toString('base64')}`;
}

function logApiFailure(error: unknown): void {
  if (error instanceof OpenAI.APIError) console.error(`[reader] api failed status=${error.status ?? 'none'} code=${error.code ?? 'none'} type=${error.type ?? 'none'} message=${JSON.stringify(redactKeys(error.message).slice(0, 300))}`);
  else console.error(`[reader] api failed error=${error instanceof Error ? error.name : 'unknown'}`);
}

function redactKeys(text: string): string {
  return text.replace(/sk-[A-Za-z0-9*_-]+/g, 'sk-[redacted]');
}
