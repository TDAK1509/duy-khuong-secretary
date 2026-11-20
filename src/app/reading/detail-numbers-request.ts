import type { JsonSchema, ReaderRequest } from '../../services/reading/reader-service.ts';
import { SHARED_NUMBER_RULE } from './reader-prompt.ts';
import { buildDataRequestParts, RETRIEVED_DATA_RULE } from './retrieved-data.ts';

const DETAIL_NUMBERS_REQUEST = 'Bổ sung số cho các chi tiết trong thẻ dữ liệu ở trên rồi trả về JSON.';

export type StoredDetail = { label: string; value: string; [key: string]: unknown };

export type StoredDocument = { category: string; documentTitle: string | null; details: StoredDetail[] };

export const DETAIL_NUMBERS_SCHEMA_NAME = 'detail_numbers';

export const DETAIL_NUMBERS_PROMPT = `Bạn bổ sung số chuẩn cho các chi tiết đã lưu của một giấy tờ công việc.
Đầu vào là JSON trong thẻ <retrieved-data source="record">, gồm category, document_title và details. category là loại công việc. document_title là tiêu đề in trên giấy tờ, hoặc null. details là mảng gồm index, label và value.
Dùng category và document_title để biết loại giấy tờ.
${RETRIEVED_DATA_RULE}
Trả về đúng cấu trúc JSON được yêu cầu.
Trả về đúng một kết quả cho mỗi index của details.
Không thêm, bỏ, đổi hoặc lặp lại index.
Không trả về label hoặc value.
Không tạo thêm thông tin.

Với mỗi chi tiết: ${SHARED_NUMBER_RULE}`;

export const DETAIL_NUMBERS_SCHEMA: JsonSchema = {"type":"object","additionalProperties":false,"properties":{"details":{"type":"array","items":{"type":"object","additionalProperties":false,"properties":{"index":{"type":"integer"},"number":{"type":["number","null"]},"unit":{"type":["string","null"]}},"required":["index","number","unit"]}}},"required":["details"]};

export function buildDetailNumbersRequest({ category, documentTitle, details }: StoredDocument): ReaderRequest {
  const inputs = details.map(({ label, value }, index) => ({ index, label, value }));
  return {
    system: DETAIL_NUMBERS_PROMPT,
    userParts: buildDataRequestParts('record', JSON.stringify({ category, document_title: documentTitle, details: inputs }), DETAIL_NUMBERS_REQUEST),
    schemaName: DETAIL_NUMBERS_SCHEMA_NAME,
    schema: DETAIL_NUMBERS_SCHEMA,
  };
}
