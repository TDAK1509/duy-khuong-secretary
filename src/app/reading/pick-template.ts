import { z } from 'zod';
import type { JsonSchema, ReaderPart, ReaderService } from '../../services/reading/reader-service.ts';
import { buildMessageParts, type MessageContent } from './message-parts.ts';
import { describeTemplateForPicker, listTemplatesWithShortIds, type ListedTemplate, type ReaderTemplate } from './reader-template.ts';
import { buildRetrievedPart, RETRIEVED_DATA_RULE } from './retrieved-data.ts';

const SCHEMA_NAME = 'document_template_pick';
const NO_TEMPLATE = 'none';

const PICK_PROMPT = `Bạn chọn mẫu giấy tờ khớp với một tin nhắn công việc gửi cho Trợ lý của một công ty vận tải.
Các mẫu của công ty nằm trong thẻ <retrieved-data source="document-templates">, mỗi mẫu có id, tên, loại giấy tờ (kind), bên phát hành (issuer) và mô tả cách nhận ra mẫu. Tin nhắn và ảnh nằm trong các thẻ dữ liệu khác.
Chọn id của mẫu mà giấy tờ trong tin nhắn hoặc ảnh thuộc về: cùng mẫu in, cùng bên phát hành. Nếu không có mẫu nào khớp rõ ràng, trả lời "${NO_TEMPLATE}".
- ${RETRIEVED_DATA_RULE}
- Khi không chắc, trả lời "${NO_TEMPLATE}".`;

const PICK_REQUEST = 'Chọn mẫu cho giấy tờ trong các thẻ dữ liệu ở trên rồi trả về JSON.';

const answerSchema = z.strictObject({ template: z.string() });

export async function pickTemplate(reader: ReaderService, templates: ReaderTemplate[], message: MessageContent): Promise<ListedTemplate | null> {
  if (templates.length === 0) return null;
  const startedAt = Date.now();
  const picked = await askReader(reader, listTemplatesWithShortIds(templates), message);
  console.log(`[template-pick] picked=${picked?.shortId ?? NO_TEMPLATE} ms=${Date.now() - startedAt}`);
  return picked;
}

async function askReader(reader: ReaderService, listed: ListedTemplate[], message: MessageContent): Promise<ListedTemplate | null> {
  const result = await reader.read({
    system: PICK_PROMPT,
    userParts: buildPickParts(listed, message),
    schemaName: SCHEMA_NAME,
    schema: buildPickSchema(listed),
    imageDetail: 'high',
    useTextModel: true,
  });
  return result.ok ? findPickedTemplate(result.json, listed) : null;
}

function buildPickParts(listed: ListedTemplate[], message: MessageContent): ReaderPart[] {
  const templates = JSON.stringify(listed.map(describeTemplateForPicker));
  return [buildRetrievedPart('Các mẫu giấy tờ của công ty:', 'document-templates', templates), ...buildMessageParts(message), { kind: 'text', text: PICK_REQUEST }];
}

function buildPickSchema(listed: ListedTemplate[]): JsonSchema {
  return {
    type: 'object',
    properties: { template: { type: 'string', enum: [...listed.map(({ shortId }) => shortId), NO_TEMPLATE] } },
    required: ['template'],
    additionalProperties: false,
  };
}

function findPickedTemplate(json: unknown, listed: ListedTemplate[]): ListedTemplate | null {
  const answer = answerSchema.safeParse(json);
  if (!answer.success) return null;
  return listed.find(({ shortId }) => shortId === answer.data.template) ?? null;
}
