import type { JsonSchema } from '../../services/reading/reader-service.ts';

export const READER_SCHEMA_NAME = 'work_message_reading';

export const READER_SCHEMA: JsonSchema = {"type":"object","additionalProperties":false,
 "properties":{
  "has_work_data":{"type":"boolean"},
  "needs_explanation":{"type":"boolean"},
  "has_question":{"type":"boolean"},
  "photo_problem":{"type":["string","null"],"enum":["blurry","cut_off","not_work",null]},
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
    "document_kind":{"type":"string"},
    "stage":{"type":["string","null"],"enum":["dispatch","receipt",null]},
    "parties":{"type":"array","items":{"type":"object","additionalProperties":false,
      "properties":{"role":{"type":"string","enum":["issuer","supplier","customer","carrier","place"]},"type":{"type":"string","enum":["company","place"]},
        "printed_name":{"type":"string"},"known_name":{"type":["string","null"]}},
      "required":["role","type","printed_name","known_name"]}},
    "details":{"type":"array","items":{"type":"object","additionalProperties":false,
      "properties":{"label":{"type":"string"},"value":{"type":"string"},"number":{"type":["number","null"]},"unit":{"type":["string","null"]},
        "meaning":{"type":["string","null"]},"item":{"type":["string","null"]},"date_time":{"type":["string","null"]}},
      "required":["label","value","number","unit","meaning","item","date_time"]}}},
   "required":["category","document_title","maintenance_item","occurred_on","amount_vnd","identifiers","vehicle_plate","document_number","document_kind","stage","parties","details"]}}},
 "required":["has_work_data","needs_explanation","has_question","photo_problem","items"]};
