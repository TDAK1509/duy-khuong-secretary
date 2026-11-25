import { z } from 'zod';
import type { CompanyClaim, NewPaperValues, PaperPointer } from '../../documents/corrections/paper-correction.ts';
import { buildMatchKey } from '../../documents/build-match-key.ts';
import { COMPANY_SLOTS } from '../../facts/pick-fact-companies.ts';
import { normalizeCode } from '../../reading/normalize.ts';
import { isRealIsoDate } from '../../time/is-real-iso-date.ts';
import { refuseInvalidCompany } from './fact-company-argument.ts';
import { ToolRefusal } from './tool-result.ts';
import { readPrintedValue } from './read-printed-value.ts';
import { readPlateArgument } from './vehicle-plate.ts';

const NONZERO_DIGIT = /[1-9]/;

const NO_NEW_VALUE_ERROR = 'Chưa chọn giá trị nào để sửa. Cần ít nhất một trong new_plate, new_number, new_date, new_stage, printed_label cùng printed_value, company_slot cùng company_name. Gửi lại với giá trị quản lý nêu.';
const INCOMPLETE_COMPANY_ERROR = 'Công ty cần cả company_slot (pickup, dropoff hoặc customer) và company_name (tên công ty quản lý nêu). Gửi lại với đủ cả hai theo đúng lời quản lý.';
const NO_POINTER_ERROR = 'Chưa nói giấy tờ nào cần sửa. Cần last_photo true hoặc ít nhất một trong current_plate, current_number, current_date. Gửi lại với điều quản lý nêu.';
const INVALID_NUMBER_ERROR = 'Số giấy tờ mới phải có ít nhất một chữ số khác 0. Sửa số theo đúng tin nhắn của quản lý rồi gọi lại.';
const INVALID_DATE_ERROR = 'Ngày đã gửi không đúng. Ngày phải có dạng YYYY-MM-DD và có thật trong lịch, ví dụ 2026-10-31. Sửa ngày theo đúng dạng rồi gọi lại.';

const argumentsSchema = z.strictObject({
  new_plate: z.string().nullable(),
  new_number: z.string().nullable(),
  new_date: z.string().nullable(),
  new_stage: z.enum(['dispatch', 'receipt']).nullable(),
  printed_label: z.string().nullable(),
  printed_value: z.string().nullable(),
  printed_meaning: z.string().nullable(),
  printed_number: z.number().nonnegative().nullable(),
  printed_unit: z.string().nullable(),
  company_slot: z.enum(COMPANY_SLOTS).nullable(),
  company_name: z.string().nullable(),
  last_photo: z.boolean(),
  current_plate: z.string().nullable(),
  current_number: z.string().nullable(),
  current_date: z.string().nullable(),
  all_matching: z.boolean(),
});

export type CorrectionRequest = {
  values: NewPaperValues;
  company: CompanyClaim | null;
  pointer: Omit<PaperPointer, 'lastPhotoMessageId'>;
  fromLastPhoto: boolean;
  allMatching: boolean;
};

export function parseCorrectionRequest(parsedArguments: unknown): CorrectionRequest {
  const args = argumentsSchema.parse(parsedArguments);
  const values = { plate: readPlateArgument(args.new_plate), documentNumber: readNewNumber(args.new_number), documentDate: readDate(args.new_date), stage: args.new_stage, printed: readPrintedValue(args), company: null };
  const company = readCompanyClaim(args);
  const pointer = { plate: normalizeCode(args.current_plate), documentNumber: normalizeCode(args.current_number), documentDate: readDate(args.current_date) };
  if (company === null && Object.values(values).every((value) => value === null)) throw new ToolRefusal(NO_NEW_VALUE_ERROR);
  if (!args.last_photo && Object.values(pointer).every((value) => value === null)) throw new ToolRefusal(NO_POINTER_ERROR);
  return { values, company, pointer, fromLastPhoto: args.last_photo, allMatching: args.all_matching };
}

function readCompanyClaim({ company_slot: slot, company_name: rawName }: { company_slot: CompanyClaim['slot'] | null; company_name: string | null }): CompanyClaim | null {
  if (slot === null && rawName === null) return null;
  if (slot === null || rawName === null) throw new ToolRefusal(INCOMPLETE_COMPANY_ERROR);
  if (buildMatchKey(rawName) === '') refuseInvalidCompany(rawName);
  return { slot, name: rawName.trim() };
}

function readNewNumber(raw: string | null): string | null {
  const number = normalizeCode(raw);
  if (number !== null && !NONZERO_DIGIT.test(number)) throw new ToolRefusal(INVALID_NUMBER_ERROR);
  return number;
}

function readDate(raw: string | null): string | null {
  if (raw !== null && !isRealIsoDate(raw)) throw new ToolRefusal(INVALID_DATE_ERROR);
  return raw;
}
