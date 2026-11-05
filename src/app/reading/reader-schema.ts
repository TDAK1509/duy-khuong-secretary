import type { JsonSchema } from '../../services/reading/reader-service.ts';

export const READER_SCHEMA_NAME = 'work_message_reading';

export const READER_SCHEMA: JsonSchema = {"type":"object","additionalProperties":false,
 "properties":{
  "has_work_data":{"type":"boolean"},
  "has_question":{"type":"boolean"},
  "items":{"type":"array","items":{"type":"object","additionalProperties":false,
   "properties":{
    "category":{"type":"string"},
    "document_title":{"type":["string","null"]},
    "maintenance_item":{"type":["string","null"]},
    "occurred_on":{"type":["string","null"]},
    "amount_vnd":{"type":["integer","null"]},
    "identifiers":{"type":"array","items":{"type":"string"}},
    "vehicle_plate":{"type":["string","null"]},
    "document_number":{"type":["string","null"]},
    "details":{"type":"array","items":{"type":"object","additionalProperties":false,
      "properties":{"label":{"type":"string"},"value":{"type":"string"}},"required":["label","value"]}}},
   "required":["category","document_title","maintenance_item","occurred_on","amount_vnd","identifiers","vehicle_plate","document_number","details"]}}},
 "required":["has_work_data","has_question","items"]};
