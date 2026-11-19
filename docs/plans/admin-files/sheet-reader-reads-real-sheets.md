# The sheet reader reads real-world sheets

These PRs merge in the order written. Each one leaves production working when
it ships alone. The owner resends the GPS sheet only after PR 2 is live.

Facts every PR in this file relies on:

- Admin sheets go through parse (`run-parse-files-step.ts`) and process
  (`run-process-files-step.ts`). Parsing is `parseSheet`
  (`src/app/intake/parse-sheet.ts`): `.xlsx` through the exceljs provider
  (`src/providers/sheets/exceljs-sheet-parser.ts`, every cell read as
  `cell.text`), `.csv` through `parse-csv.ts`. Both take the first non-empty
  row as the header and drop empty rows. Mapping is `map-sheet-rows.ts`. It
  needs exactly one date column and exactly one title column, and turns
  "detail" columns into record details with `number: null`. No numeric
  document line is created from a sheet.
- The sheet reader call (`sheet-reader-schema.ts`, `sheet-reader-prompt.ts`)
  goes through `openai-compatible-reader.ts` with `strict: true`. Its
  `column_mapping` is an object with a schema-valued `additionalProperties`,
  which strict mode does not allow. On 19/11 the first real call was rejected
  before any token was used. The reader reports every non-timeout API error as
  `unavailable`, so the API's message was not seen.
- The 19/11 GPS export: four merged title and filter lines (the title, "Từ
  ngày … đến ngày …", "Nhóm: …", "Biển kiểm soát: …"), the header on row 5
  (STT, Loại phương tiện, Số xe, Ngày tháng, Giờ đi, Giờ đến, three hh:mm
  durations, Km (GPS), Km cơ, counts, speeds, violations), then about 450
  rows, one per truck per day.
- Sheet rows are inserted as new documents directly
  (`src/app/sheet-files/run-file-step.ts`), not through the duplicate check
  that photos use. The database's uniqueness needs an issuer and a document
  number, which GPS rows do not have.
- Plates are normalized for queries with `normalizeCode`
  (`src/app/reading/normalize.ts`). Sheet plates are only trimmed and upper-
  cased.
- This repository adds no tests unless the owner asks for them. Every PR below
  lists none, and its outcome steps are the check. The repo is public: no
  production names or ids in committed files.

---

## PR 1: A real export sheet is parsed and mapped correctly

### The mindset of this PR

- Goal: A real export sheet, with title lines above its header, native Excel
  dates and no title column, is parsed, accepted by the reader API and mapped
  column by column, and its rows are saved as documents.
- What matters most: 1. The API accepts the reader request, and any wrong
  mapping is rejected by our checks before anything is saved. 2. The header,
  dates and plates are read exactly. 3. Nothing outside the table (title
  lines, repeated headers, total rows) becomes a document.
- Out of scope: Numeric lines and duplicate handling (PR 2). Several tables or
  sheets in one file (only the first sheet is read, as today).

### Outcome

Brief: The reader schema is valid for strict mode, and API errors are logged.
Both parsers return raw rows with their original row numbers. A shared
splitter finds the header, the lines above it and the data rows. Cells are
normalized: dates to ISO, numbers to plain decimals, durations to hh:mm. The
mapping uses column indexes, the title column is optional, and plates are
normalized.

Before: The GPS export's headers reply lists the report title, the reader call
is rejected, and no row is saved.
After: The headers reply lists the real columns and says the header is on row
5. The result reply says how many rows were saved and lists skipped rows by
their real row numbers.

Steps, for the owner (after deploy; PR 2 is not needed for these):

- Send a small test sheet with two title lines above its header, a real Excel
  date column and a plate column. The headers reply lists the real header and
  "dòng tiêu đề: 3". The result reply says each data row was saved.
- Send a simple sheet with its header on row 1. It is read as before.
- Send a sheet whose last row is a total ("Tổng cộng"). The total row is listed
  as skipped, with its real row number.

Steps, for the developer (before merging):

- With the real API (a billable call with a real key, locally or over SSH on
  the server, nothing written to the database), send the new reader request
  built from the GPS sheet's first rows. The API answers. If it fails, the
  logged status and message say why. The answer passes `validateSheetReading`.

### Solution

- Reader schema (`sheet-reader-schema.ts`)
  - Before: `column_mapping` is an object keyed by header name (the confirmed
    strict-mode violation).
  - After: `column_mapping` is an array of `{ column_index: integer, field:
    <enum> }`, both required, `additionalProperties: false`. `maxLength` is
    removed as a precaution. `date_format` is required and is one of the
    formats only (no `other`, not nullable).
  - `validateSheetReading` rejects:
    - an index outside the header, or a column listed twice;
    - not exactly one `document_date`;
    - more than one of any single-valued field (title, plate, document
      number, issuer, summary). Only `detail` and `ignore` may repeat.
    - A rejection is a reader failure (one reply, as today).
  - `document_kind` longer than 60 characters is cut to 60 by our code, not
    rejected.
- Reader errors (`openai-compatible-reader.ts`): a failed call logs the API
  status and message (no key, no content), then returns `unavailable` as
  today.
- Parsing (`parse-sheet.ts`, `parse-csv.ts`, the exceljs provider)
  - Both parsers return every raw row with its original row number, keeping
    empty rows out but keeping their numbers.
  - Cell values, from the cell's value and number format, not `cell.text`:
    - native dates: `YYYY-MM-DD`;
    - times and durations (a day fraction with a time format): `hh:mm`;
    - other numbers: a plain decimal string with no thousands separator;
    - text: trimmed.
- Header split (new, shared by both steps)
  - Look at the first 10 rows, trimmed. Score each row: distinct non-empty
    cells, minus rows whose cells are all one repeated value. Add a bonus when
    the next three rows have values in the same columns.
  - The header is the best-scoring row with at least 2 distinct non-empty
    cells. When nothing scores, row 1 is used, as today.
  - The rows above the header become context lines. The rows after it are data
    rows, each with its original row number.
- Data rows skipped before mapping, each listed with its original number in
  the result reply:
  - a row equal to the header;
  - a row whose first non-empty cell starts with "Tổng" or "Cộng";
  - a row with no value in the date column.
  - When a plate column is mapped, a row with an empty normalized plate.
- Reader input (`sheet-reader-prompt.ts`): the context lines (untrusted data,
  like the caption), the headers as a numbered list, and the first 10 data
  rows. The model answers with indexes.
- Mapping (`map-sheet-rows.ts`): by column index. Plates go through
  `normalizeCode` before storage. `title` is optional: without a title column,
  the title is "<document kind> <plate> <date>", leaving out empty parts.
- Size: more than 5,000 data rows → the sheet is refused with a reply asking to
  split it. This stays under the `smallint` row index of `document_sources`.
- The headers reply lists the detected header and "dòng tiêu đề: <n>" when it
  is not row 1.
- README, the file section: header detection, skipped rows, the optional title
  and the size limit.

Tests: none (see the shared facts above).

### Revert cost

Sheets go back to row 1 as the header, and reader calls are rejected again.
Documents saved in the meantime stay.

---

## PR 2: Sheet numbers become searchable lines, and a resent sheet replaces its rows

Depends on: PR 1.

### The mindset of this PR

- Goal: Number columns of a sheet (for example Km) are saved as numeric
  document lines that totals and reports can add up. Sending the same sheet
  again replaces its rows instead of doubling them.
- What matters most: 1. Totals are right: no truck-day counted twice, and
  numbers carry the right unit. 2. Rows from photos and other sources are
  never touched.
- Out of scope: Using GPS km in the trip report's "Km chuyến" column (a later
  plan).

### Outcome

Brief: For each `detail` column, numeric cells become document lines with a
meaning (the header name) and a unit taken from the header or the values. Each
sheet row has an identity (kind, plate, date, and document number when there
is one). A row whose identity was already saved from a sheet replaces that
document's lines instead of adding a new document.

Before: Sheet rows have no numeric lines, so "how many km" cannot be added up,
and resending a sheet would double every row.
After: The GPS sheet's Km column is a numeric line in km for each truck-day.
Resending the sheet reports "N dòng đã cập nhật" and keeps one document per
truck-day.

Steps, for the owner:

- Send the GPS sheet with a caption, for example "Bảng GPS các xe tháng 10,
  biển số ở cột C". The result reply says how many rows were saved.
- Ask "Tháng 10 xe <biển số> chạy bao nhiêu km theo GPS?". The bot answers
  with a total that matches the sheet's Km (GPS) column for that truck.
- Send the same sheet again. The result reply says the rows were updated, not
  added. Ask the same question: the total is unchanged.

### Solution

- Numeric lines (`map-sheet-rows.ts`, the draft that creates `document_lines`)
  - Before: detail columns become record details with `number: null`, and the
    document has no lines.
  - After: each detail cell becomes a document line with the header as its
    label and its meaning (`find-or-insert-meaning.ts`):
    - a plain decimal: a number, with its unit from the header (the text in
      parentheses, or a known word: km, kg, tấn, lít, đ, VND, phút, giờ), else
      none;
    - `hh:mm`: a number of minutes, unit `phút`;
    - anything else: a text line.
  - Totals (`total-document-numbers.ts`) then work on these meanings.
- Row identity and replacement (`src/app/sheet-files/run-file-step.ts`)
  - The identity of a sheet row: workspace, document kind (match key), plate,
    date, and document number when a document number column is mapped.
  - Within one upload, a second row with the same identity is skipped and
    listed as a duplicate.
  - Against saved documents: when a document with the same identity exists and
    all its sources are sheet uploads, its lines and summary are replaced, and
    the new upload is added as a source. The reply counts it as updated. A
    document with any non-sheet source is never changed: the row is saved as
    a new document and counted as such.
  - All of this runs in the process step's single fenced transaction, under
    the workspace lock.
- The result reply: "N dòng mới, M dòng cập nhật, K dòng bỏ qua (…)".
- README, the file section: numeric lines and replacement on resend.

Tests: none (see the shared facts above).

### Revert cost

Sheet numbers stop becoming lines, and resent sheets add documents again.
Documents saved in the meantime stay.
