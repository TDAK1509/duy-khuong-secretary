# PRs 11 and 12 of 12 — An edited export sent back becomes paper corrections or company knowledge

Two PRs that depend on each other. They merge in the order written.

Both need PR 2 of 12, "Standing facts become company knowledge entries with fixed outcomes". PR 12 also needs PR 9 of 12, "Before a save, the bot shows conflicting knowledge and asks which is correct".

What they need from those PRs:

- `company_knowledge_entries` holds one row per thing the admin taught the company: conditions in `when_*` columns and outcomes in `then_*` columns.
- `company_knowledge_links` holds one row per entry and paper.
- `save_company_knowledge` and `update_company_knowledge` write entries. From PR 9, they also take `replace_conflicts` and `notes_checked`, and can return `action: "conflict"` or `action: "check_notes"`.
- The paper export is `export_documents_xlsx`. The trip report is `export_trip_report_xlsx`. Both store the file through `store-excel-export.ts`.

---

## PR 11 of 12 — Each export saves the papers and knowledge behind each row and cell

Depends on: PR 2 of 12.

### Done when

- Every paper export and trip report saves one record per data row, with the papers and entries behind that row.
- Each saved cell records its value type, its value and its source. The source is one paper field, one entry outcome, a value computed from both, or a server value, with a small snapshot.
- Each data row carries its row id in a hidden column. A very-hidden sheet `_tro_ly` names the export. The visible columns do not change.
- The row records match the visible rows after the report's own sort.
- A paper or entry deleted later does not erase the saved record.

### Before / After

Before: The admin edits a trip report row and sends the file back. Nobody can tell which paper or which entry made the value in a changed cell.

After: The row with hidden id R maps to the pickup ticket, the drop-off ticket and the entry that gave the wage. Its cell "Lương" records "number, 700000, entry `<id>`, then_wage_vnd".

### Solution

- Schema. New table `company_exports`: one row is one Excel file made by `export_documents_xlsx` or `export_trip_report_xlsx`.
  - `id` uuid, not null, primary key. The id is made before storage and also names the stored file.
  - `workspace_id` uuid, not null, foreign key to `workspaces.id`, delete cascades.
  - `requested_by_user_id` uuid, null, foreign key to `users.id`, delete sets null.
  - `kind` text, not null, check `kind IN ('documents', 'trip_report')`.
  - `sheet_name` text, not null: the visible data sheet.
  - `columns` jsonb, not null, check `jsonb_typeof(columns) = 'array'`. There is one object per visible column, in order: `{ "key", "name", "value_type", "unit"? }`. `value_type` is one of `text`, `number`, `date`, `boolean`. `unit` is set for numbers with a unit, for example `kg` or `đ`.
  - `created_at` timestamptz, not null, default now().
  - Unique index on (`id`, `workspace_id`). Index on (`workspace_id`, `created_at`), not unique.
  - Row-level security: the same `in_scope` policy as `company_knowledge_entries`.
- New table `company_export_rows`: one row is one visible data row of one export.
  - `id` uuid, not null, primary key, default `gen_random_uuid()`. This is the row id written in the hidden column.
  - `workspace_id` uuid, not null.
  - `export_id` uuid, not null. Foreign key (`export_id`, `workspace_id`) to `company_exports` (`id`, `workspace_id`), delete cascades.
  - `row_number` integer, not null, check `row_number >= 2`: the Excel row, after the report's sort.
  - `document_ids` uuid[], not null: every paper behind the row. A paper row has one, a trip row one or two. These are plain ids with no foreign key, so a later delete keeps them.
  - `entry_ids` uuid[], not null: every entry linked to those papers that gave a visible value or took part in pairing. No foreign key.
  - `cells` jsonb, not null, check `jsonb_typeof(cells) = 'object'`. It has one key per column `key`, and each value is `{ "value_type", "value", "source": { "kind", "document_id"?, "entry_id"?, "field", "snapshot" } }`.
    - `value` is a JSON string, number, `YYYY-MM-DD` / `YYYY-MM-DDTHH:mm:ss` string for dates, boolean, or null.
    - `source.kind` is one of `paper`, `entry`, `computed`, `server`.
    - The snapshot of a paper source is kind, number, date and plate. The snapshot of an entry source is statement, conditions and the outcome value.
    - A `computed` source (the freight amount) names both the entry and the paper, with the rate and the weight.
    - A `server` source (row number, "Cách ghép phiếu") has no id.
  - Unique index on (`export_id`, `row_number`). Unique index on (`id`, `workspace_id`).
  - The same row-level security policy.
- Records are kept until the workspace is deleted. There is no cleanup job.
- Build each row as one object that holds its cells and its sources. Pass it through the same sort the workbook uses (`sortReportRows` in `src/app/documents/build-report-workbook.ts`). Then give row numbers, and write the visible row, the hidden row id and the record from that final order.
- Workbook marks:
  - A hidden last column on the data sheet, with the header `_row_id`, holds each row's id.
  - A very-hidden worksheet named `_tro_ly` holds one row under a header row: `format` = `1`, `export_id`, `sheet` = the data sheet name.
  - The ids are not secret. On return, the workspace is still checked.
- Write the export row and its records in one transaction, only after the file upload succeeds. When the upload or the write fails, the tool returns its error, as today, and leaves no record.
- No LLM-facing text changes.

### Tests, in order

1. Backend (integration): A paper export saves one row record with its paper.

   - Setup: One accepted paper linked to an entry with `when_pickup` "Alpha" and `then_wage_vnd` 700000.
   - Input: Export the paper list.
   - Expected: One row record whose `document_ids` holds the paper.

2. Backend (integration): A knowledge cell names its entry.

   - Setup: One accepted paper linked to an entry with `when_pickup` "Alpha" and `then_wage_vnd` 700000.
   - Input: Export the paper list.
   - Expected: The "Lương tài xế" cell has value type `number`, value 700000, and source kind `entry` with that entry's id.

3. Backend (integration): A paired trip row saves both papers.

   - Setup: One trip with a pickup ticket and a drop-off ticket of plate 51C12345.
   - Input: Export the trip report.
   - Expected: One row record whose `document_ids` holds both tickets.

4. Backend (integration): Two cells from two entries name their own entry.

   - Setup: One trip whose pickup ticket links entry 1 (`when_pickup` "Alpha", `then_wage_vnd` 700000) and entry 2 (`when_vehicle_plate` 51C12345, `then_allowance_vnd` 100000).
   - Input: Export the trip report with a wage column and an allowance column.
   - Expected: The wage cell names entry 1, the allowance cell names entry 2, and the row's `entry_ids` holds both.

5. Backend (integration): The freight amount cell names its entry and its paper.

   - Setup: One trip of 27000 kg whose pickup ticket links an entry with `when_pickup` "Alpha" and `then_rate_vnd_per_ton` 150000.
   - Input: Export the trip report with a freight amount column.
   - Expected: The cell has value 4050000 and source kind `computed`, with the entry id, the paper id, rate 150000 and weight 27000.

6. Backend (integration): Row records follow the report's sort.

   - Setup: Three trips with plates 51C11111, 51C22222 and 51C33333, each with its own pickup ticket.
   - Input: Export the trip report sorted by plate, descending.
   - Expected: Excel row 2 holds plate 51C33333 and the hidden row id of the record whose `document_ids` holds the 51C33333 ticket.

7. Backend (unit): The workbook holds the hidden row-id column.

   - Setup: A paper export with two rows.
   - Input: Build the workbook.
   - Expected: The data sheet's last column is hidden, has the header `_row_id`, and holds the two row ids.

8. Backend (unit): The workbook holds a very-hidden `_tro_ly` sheet.

   - Setup: A paper export with two rows.
   - Input: Build the workbook.
   - Expected: The sheet `_tro_ly` is very hidden and holds format `1`, the export id and the data sheet name.

9. Backend (integration): A failed upload leaves no record.

   - Setup: One accepted paper, and file storage that fails on put.
   - Input: Export the paper list.
   - Expected: `company_exports` has no new row.

10. Backend (integration): Deleting an entry keeps the export record.

    - Setup: A paper export whose row record names entry 1 in its wage cell.
    - Input: Delete entry 1.
    - Expected: The row record still holds entry 1's id and snapshot.

### Revert cost

The two tables stay and nothing writes to them. Files keep a hidden column and a hidden sheet that nothing reads.

### Production manual test

> Needs a human test: the agent cannot send a Zalo message as an admin. A person performs step 2.

- Get the workspace with this read-only query through `ssh render_personal`: `SELECT id FROM workspaces;`. Get the admin's id with `SELECT user_id FROM memberships WHERE workspace_id = '<workspace id>' AND role = 'admin';`.
- A person, as the admin, asks for a trip report for last month and forwards the link.
- Run `SELECT id, kind, sheet_name FROM company_exports WHERE workspace_id = '<workspace id>' AND requested_by_user_id = '<admin id>' ORDER BY created_at DESC LIMIT 1;`. Note the export id. Then run `SELECT count(*) FROM company_export_rows WHERE export_id = '<export id>';`. It equals the number of data rows in the file.
- The agent downloads and opens the file. The data sheet's last column is hidden and holds row ids. The sheet `_tro_ly` is very hidden and holds the noted export id.
- Take the row id in Excel row 2 and run `SELECT document_ids, cells FROM company_export_rows WHERE id = '<that row id>';`. The ticket numbers in the record's snapshots match the ticket numbers shown in Excel row 2.

---

## PR 12 of 12 — An edited export sent back becomes confirmed corrections or knowledge

Depends on: PR 11 of 12 in this file, and PR 9 of 12.

### Done when

- When an admin sends back a file the bot exported for the same workspace, the bot does not import its rows as new papers.
- The bot lists each changed cell, with old value, new value, the paper or entry that made the old value, and the actions that can apply.
- Nothing changes until the admin confirms each cause. The confirmed cause alone decides the write: a correction of one paper, or a company knowledge entry.
- A file with broken marks, added or deleted rows, or changed columns is refused as a whole, and nothing is saved. Sorting or filtering the rows is allowed.
- A confirmed knowledge change that hits a conflict or a related note stays pending until the admin answers, then completes.

### Before / After

Before: The admin fixes the wage on 10 rows and sends the file back. The bot reads it as a new spreadsheet and saves 10 new sheet papers.

After: "Tôi tìm thấy 10 ô đã đổi trong file Trợ lý đã xuất. Tôi chưa lưu gì. …" The bot explains that "Lương tài xế 600.000 → 700.000 ở 10 chuyến" came from the entry for `<pickup company>`. It asks whether this is standing knowledge or a mistake on single papers. After "đúng cho mọi chuyến", the entry changes.

### Solution

- Intake (`src/app/intake/run-parse-files-step.ts`): before `parseSheet` runs on an `.xlsx`, check for the export marks with a new returned-export reader.
  - No `_tro_ly` sheet: normal sheet intake, as today.
  - `_tro_ly` names an export of another workspace, or an id that does not exist: normal sheet intake. The bot says nothing about other workspaces.
  - `_tro_ly` names an export of the sender's workspace and the sender is an admin: this is a returned export. Every later check failure is a structural refusal that finishes the file.
- Structural refusal, for a returned export of the same workspace:
  - The data sheet named in `company_exports.sheet_name` is missing.
  - The hidden `_row_id` column is missing, or a row id does not belong to that export.
  - A row id is missing (a row was deleted), or a data row has no row id (a row was added), or a row id appears twice.
  - The header row differs from `company_exports.columns`: renamed, moved, added or removed columns.
  - Rows in another order are not a structural change, because rows are matched by row id.
- Returned-export reader: reads each cell as null, text, number, date or boolean, using the column's `value_type`. It does not use the string-only result of the generic sheet parser. A text cell that looks like a number stays text in a text column. An empty cell is null.
- Comparing: compare each row's cells with `company_export_rows.cells` by row id and column key, by value type. Ignore the total row and `server` cells.
- Schema. New table `company_export_reviews`: one row is one returned export waiting for, or done with, review.
  - `id` uuid, not null, primary key, default `gen_random_uuid()`.
  - `workspace_id` uuid, not null.
  - `export_id` uuid, not null. Foreign key (`export_id`, `workspace_id`) to `company_exports` (`id`, `workspace_id`), delete cascades.
  - `message_file_id` uuid, not null, foreign key to `message_files.id`, delete cascades.
  - `status` text, not null, check `status IN ('pending', 'applied', 'dismissed')`.
  - `created_at` timestamptz, not null, default now(). `applied_at` timestamptz, null.
  - Unique index on (`message_file_id`). Unique index on (`id`, `workspace_id`).
  - The same row-level security policy.
- New table `company_export_review_changes`: one row is one changed cell.
  - `id` uuid, not null, primary key, default `gen_random_uuid()`.
  - `workspace_id` uuid, not null.
  - `review_id` uuid, not null. Foreign key (`review_id`, `workspace_id`) to `company_export_reviews` (`id`, `workspace_id`), delete cascades.
  - `export_row_id` uuid, not null. Foreign key (`export_row_id`, `workspace_id`) to `company_export_rows` (`id`, `workspace_id`), delete cascades.
  - `column_key` text, not null.
  - `value_type` text, not null, check `value_type IN ('text', 'number', 'date', 'boolean')`.
  - `before_value` jsonb, not null. `after_value` jsonb, not null.
  - `suggested_cause` text, not null, check `suggested_cause IN ('paper_reading', 'company_knowledge', 'unclear')`.
  - `candidate_actions` jsonb, not null, check `jsonb_typeof(candidate_actions) = 'array'`. Each item is `{ "cause": "paper_reading" | "company_knowledge", "change": … }`.
  - `status` text, not null, check `status IN ('pending', 'applied', 'dismissed', 'unsupported')`.
  - Unique index on (`review_id`, `export_row_id`, `column_key`).
  - The same row-level security policy.
- Candidate actions of a changed cell. The source kind is only where the old value came from. It does not decide the cause.
  - `paper_reading` is a candidate when the column maps to a field that `correct_document` can change on the row's paper: date, number, plate, weight, goods, printed text, or the pickup, drop-off or customer company. The change names that one paper and field.
  - `company_knowledge` is a candidate when the column maps to an entry outcome: customer, drop-off, shown goods name, wage, rate per ton or allowance. When the old value came from an entry, the change updates that entry. Otherwise it adds a new entry. Its conditions come only from the row's saved sources (the route pickup company, the goods), and never from an invented driver, company, goods or route.
  - A drop-off that came from an entry's `when_dropoff` condition is part of a route, not an outcome. Its only candidate is `paper_reading`: a correction of that paper's drop-off company. A new route is said in chat.
  - A `computed` freight amount gives a `company_knowledge` rate candidate only when the row has one weight above 0 and the reverse calculation gives a whole number of đồng per ton.
  - A change with no candidate is `unsupported`. The bot asks the admin to state the intended value in chat.
  - `suggested_cause` is the source kind's natural cause (`paper` → `paper_reading`, `entry` or `computed` → `company_knowledge`) when that cause is a candidate. It is `unclear` when both causes are candidates and the same new value appears in only some of the rows from one entry.
  - The same new value in many rows from one entry is one change group in the list.
- The intake step stores the review and sends the first reply. It calls no model and changes no paper or entry.
- New admin tools:

  ```text
  list_edited_export_changes
  description: "Liệt kê các ô đã đổi trong file Excel do Trợ lý xuất mà quản lý vừa gửi lại. Mỗi thay đổi có change_id, dòng, cột, giá trị cũ, giá trị mới, giấy tờ và kiến thức đã tạo giá trị cũ, nguyên nhân đề xuất, các việc có thể làm (candidate_actions) và trạng thái. Chỉ liệt kê; chưa sửa hay lưu gì."
  parameters: no properties.

  apply_edited_export_changes
  description: "Áp dụng các thay đổi trong file Excel đã trả lại sau khi quản lý đã xác nhận nguyên nhân của từng thay đổi. Với lỗi chỉ của một giấy tờ, sửa đúng giấy tờ đó. Với thông tin dùng lại cho các chuyến phù hợp, lưu hoặc sửa kiến thức công ty. Mỗi change_id phải đến từ list_edited_export_changes và phải có quyết định rõ của quản lý. Công cụ từ chối thay đổi đã cũ, không hỗ trợ hoặc chưa được xác nhận. Một thay đổi kiến thức gặp action \"conflict\" hoặc \"check_notes\" vẫn chờ; gọi lại với cùng change_id sau khi quản lý trả lời."
  decisions: "Mỗi thay đổi quản lý đã quyết định, đúng một mục cho mỗi change_id cần xử lý."
  decisions[].change_id: "id thay đổi từ list_edited_export_changes."
  decisions[].cause enum: ['paper_reading', 'company_knowledge', 'dismiss']
  decisions[].cause description: "paper_reading: giá trị chỉ sai trên giấy tờ này. company_knowledge: đây là thông tin lâu dài cho mọi giấy tờ hoặc chuyến khớp điều kiện. dismiss: bỏ thay đổi này, không lưu."
  decisions[].replace_conflicts: "Lần đầu luôn là false. Chỉ là true khi gọi lại sau action \"conflict\" cho change_id này và quản lý đã chọn thông tin mới là đúng. Không tự chọn thay quản lý."
  decisions[].notes_checked: "Lần đầu luôn là false. Chỉ là true khi gọi lại sau action \"check_notes\" cho change_id này và bạn đã so related_notes với thông tin sắp lưu, hoặc quản lý đã chọn sau khi bạn hỏi."
  ```

  `replace_conflicts` and `notes_checked` are booleans, and every decision property is required.
- `list_edited_export_changes` reads the newest pending review of the admin's workspace.
- `apply_edited_export_changes`:
  - It refuses a change id it did not list, a cause that is not among the change's candidates, an `unsupported` change, a change already handled, and a change whose paper or entry value is no longer the saved before-value.
  - `paper_reading` goes through the same checks and writes as `correct_document`.
  - `company_knowledge` goes through the same write path as `save_company_knowledge` / `update_company_knowledge`, with the decision's `replace_conflicts` and `notes_checked`. When that path returns `conflict` or `check_notes`, the change stays pending. The tool then returns that result with its `conflicts` or `related_notes` and the `change_id`.
  - `dismiss` marks the change dismissed.
  - The review is `applied` once no change is pending.
- Ability lines (`ability-section.ts`), exactly:

  ```text
  list_edited_export_changes: 'Cho biết các ô quản lý đã sửa trong file Excel do Trợ lý xuất và nguồn của từng ô.'
  apply_edited_export_changes: 'Sau khi quản lý xác nhận, sửa giấy tờ hoặc lưu kiến thức công ty từ các ô đã đổi trong file xuất.'
  ```

- Admin prompt: add this exact section after the `Kiến thức công ty:` section:

  ```text
  File Excel quản lý sửa và gửi lại:
  - Khi tin nhắn trước của Trợ lý nói đã tìm thấy thay đổi trong file xuất, gọi list_edited_export_changes để đọc đầy đủ từng thay đổi. Không dùng công cụ đọc bảng thông thường và không coi các dòng là giấy tờ mới.
  - Với mỗi thay đổi, nêu giá trị cũ, giá trị mới và nguồn tạo giá trị cũ. Nếu chỉ một giấy tờ được đọc sai, nguyên nhân là paper_reading và chỉ sửa giấy tờ đó. Nếu quản lý muốn mọi giấy tờ hoặc chuyến có cùng điều kiện dùng giá trị mới, nguyên nhân là company_knowledge và lưu thành kiến thức công ty.
  - Nếu nguồn chưa đủ để biết đây là lỗi một giấy tờ hay thông tin lâu dài, hỏi đúng một câu và chưa áp dụng thay đổi đó. Không tự biến một ô sửa thành quy tắc cho cả công ty.
  - Chỉ gọi apply_edited_export_changes sau khi quản lý đã xác nhận nguyên nhân. Chép đúng change_id và quyết định. Nếu công cụ trả về xung đột kiến thức công ty, làm theo quy tắc hỏi xung đột và chưa nói đã xong.
  - Khi apply_edited_export_changes trả về action "conflict" hoặc "check_notes" cho một change_id, làm theo các quy tắc hỏi xung đột và hỏi ghi chú ở phần Kiến thức công ty, rồi gọi lại apply_edited_export_changes với cùng change_id và cause, đặt replace_conflicts hoặc notes_checked là true theo câu trả lời của quản lý. Nếu quản lý chọn thông tin cũ, gọi lại với cause là dismiss.
  - Sau khi áp dụng, nói rõ thay đổi nào đã sửa một giấy tờ, thay đổi nào đã lưu thành kiến thức công ty, thay đổi nào bỏ qua và thay đổi nào còn chờ.
  ```

- The first reply uses exactly one of these texts:

  ```text
  No change: "File này không đổi dòng dữ liệu nào so với bản Trợ lý đã xuất. Chưa lưu gì."
  Changes found: "Tôi tìm thấy {count} ô đã đổi trong file Trợ lý đã xuất. Tôi chưa lưu gì. Hãy xác nhận nguyên nhân tôi nêu cho từng thay đổi: sai ở riêng giấy tờ đó, hay là thông tin lâu dài cho mọi chuyến phù hợp."
  Structure changed: "File này đã thêm, xóa hoặc đổi cấu trúc dòng/cột so với bản Trợ lý đã xuất. Tôi chưa lưu gì. Hãy giữ nguyên dòng và cột, chỉ sửa giá trị trong ô rồi gửi lại."
  ```

- Append this exact sentence to the descriptions of `export_documents_xlsx` and `export_trip_report_xlsx`: ` Quản lý có thể sửa giá trị trong ô, giữ nguyên dòng và cột, rồi gửi lại file cho Trợ lý để lưu các sửa đổi sau khi xác nhận.`

### Tests, in order

1. Backend (integration): A returned export with one changed cell stores a review and no paper.

   - Setup: A saved paper export of workspace A with one row. In the file, the wage cell changed from 600000 to 700000. An admin of workspace A sends it.
   - Input: Run the parse step on that file.
   - Expected: One pending review with one change, and no document source points to that file's message.

2. Backend (integration): An unchanged returned export gets the "No change" reply.

   - Setup: A saved paper export of workspace A with one row, sent back unchanged by an admin of workspace A.
   - Input: Run the parse step on that file.
   - Expected: The reply is the "No change" text.

3. Backend (integration): A file with no `_tro_ly` sheet goes through normal sheet intake.

   - Setup: An admin of workspace A sends an `.xlsx` with one data sheet and no `_tro_ly` sheet.
   - Input: Run the parse step on that file.
   - Expected: The file is parsed by normal sheet intake, and no review is stored.

4. Backend (integration): A file that names another workspace's export goes through normal sheet intake.

   - Setup: A file whose `_tro_ly` names an export of workspace B, sent by an admin of workspace A.
   - Input: Run the parse step on that file.
   - Expected: The file is parsed by normal sheet intake, and the reply says nothing about workspace B.

5. Backend (integration): A row id from another export is refused.

   - Setup: A saved paper export of workspace A with two rows. In the file, one hidden row id is replaced by a row id of another export.
   - Input: Run the parse step on that file.
   - Expected: The reply is the "Structure changed" text, and the file is finished.

6. Backend (integration): A deleted row is refused.

   - Setup: A saved paper export of workspace A with two rows. The file has only the first row.
   - Input: Run the parse step on that file.
   - Expected: The reply is the "Structure changed" text.

7. Backend (integration): An added row is refused.

   - Setup: A saved paper export of workspace A with two rows. The file has a third data row with no row id.
   - Input: Run the parse step on that file.
   - Expected: The reply is the "Structure changed" text.

8. Backend (integration): A renamed column is refused.

   - Setup: A saved paper export of workspace A. In the file, the header "Lương tài xế" reads "Lương".
   - Input: Run the parse step on that file.
   - Expected: The reply is the "Structure changed" text.

9. Backend (integration): A moved column is refused.

   - Setup: A saved paper export of workspace A. In the file, the columns "Khách hàng" and "Lương tài xế" are swapped.
   - Input: Run the parse step on that file.
   - Expected: The reply is the "Structure changed" text.

10. Backend (integration): Sorted rows are not a structural change.

    - Setup: A saved paper export of workspace A with three rows. The file has the same three rows in reverse order and no changed cell.
    - Input: Run the parse step on that file.
    - Expected: The reply is the "No change" text.

11. Backend (unit): An unchanged number reads as unchanged.

    - Setup: A saved cell of type `number` with value 27080. The returned cell holds 27080.
    - Input: Compare the cells.
    - Expected: No change.

12. Backend (unit): An unchanged date reads as unchanged.

    - Setup: A saved cell of type `date` with value 2026-11-03. The returned cell holds that date.
    - Input: Compare the cells.
    - Expected: No change.

13. Backend (unit): A text that looks like a number stays text.

    - Setup: A saved cell of type `text` with value "0012". The returned cell holds "0012".
    - Input: Compare the cells.
    - Expected: No change.

14. Backend (unit): A blank cell that now has a number is a change.

    - Setup: A saved cell of type `number` with value null. The returned cell holds 100000.
    - Input: Compare the cells.
    - Expected: One change from null to 100000.

15. Backend (unit): An edited number is a change.

    - Setup: A saved cell of type `number` with value 27080. The returned cell holds 27800.
    - Input: Compare the cells.
    - Expected: One change from 27080 to 27800.

16. Backend (unit): A wage cell from an entry suggests a knowledge change.

    - Setup: A saved row whose "Lương tài xế" cell has source kind `entry` with entry 1 and value 600000. The new value is 700000.
    - Input: Build the change's candidates.
    - Expected: The suggested cause is `company_knowledge`, and the only candidate updates entry 1's wage to 700000.

17. Backend (unit): A customer cell from an entry also allows a one-paper correction.

    - Setup: A saved row of one paper whose "Khách hàng" cell has source kind `entry` with entry 1 and value "Gamma". The new value is "Delta".
    - Input: Build the change's candidates.
    - Expected: The candidates are a `company_knowledge` update of entry 1 and a `paper_reading` correction of that paper's customer company to "Delta".

18. Backend (unit): A goods cell from a paper also allows standing knowledge.

    - Setup: A saved row of one paper that prints "Alpha", whose goods cell has source kind `paper` and value "Than cám". The new value is "Than đá".
    - Input: Build the change's candidates.
    - Expected: The candidates are a `paper_reading` correction of that paper's goods and a `company_knowledge` new entry with `when_goods` "Than cám", `when_pickup` "Alpha" and `then_shown_goods_name` "Than đá".

19. Backend (unit): A weight cell from a paper allows only a paper correction.

    - Setup: A saved row whose pickup-weight cell has source kind `paper` with ticket 1 and value 27080. The new value is 27800.
    - Input: Build the change's candidates.
    - Expected: The only candidate is a `paper_reading` correction of ticket 1's weight to 27800 kg.

20. Backend (unit): A freight amount that does not give a whole rate is unsupported.

    - Setup: A saved `computed` freight cell with rate 150000 and weight 27000. The new value is 4050001.
    - Input: Build the change's candidates.
    - Expected: The change is `unsupported`.

21. Backend (integration): Confirming an entry-sourced customer cell as one paper's mistake corrects only that paper.

    - Setup: A pending change on a "Khách hàng" cell from entry 1 ("Gamma" → "Delta") for paper 1. Paper 2 is also linked to entry 1.
    - Input: Apply it with cause `paper_reading`.
    - Expected: Paper 1's customer is "Delta", and entry 1 still says "Gamma".

22. Backend (integration): Confirming a wage cell as knowledge updates the entry.

    - Setup: A pending change on a "Lương tài xế" cell from entry 1 (600000 → 700000), with no conflicting entry and no note.
    - Input: Apply it with cause `company_knowledge`, `replace_conflicts` false and `notes_checked` false.
    - Expected: Entry 1 has `then_wage_vnd` 700000.

23. Backend (integration): A knowledge decision that hits a conflict stays pending.

    - Setup: A pending change on a "Nơi đổ hàng" cell that would add an entry with `when_goods` "Đá", `when_vehicle_plate` 51C12345 and `then_dropoff` "Gamma". Entry 2 has `when_goods` "Đá" and `then_dropoff` "Beta".
    - Input: Apply it with cause `company_knowledge`, `replace_conflicts` false and `notes_checked` false.
    - Expected: The result has action "conflict" with that change id, the change is still pending, and entry 2 still says "Beta".

24. Backend (integration): A confirmed replacement completes the pending change.

    - Setup: A pending change on a "Nơi đổ hàng" cell that would add an entry with `when_goods` "Đá", `when_vehicle_plate` 51C12345 and `then_dropoff` "Gamma". Entry 2 has `when_goods` "Đá" and `then_dropoff` "Beta".
    - Input: Apply it with cause `company_knowledge`, `replace_conflicts` true and `notes_checked` true.
    - Expected: The change is `applied`.

25. Backend (integration): Choosing the old value dismisses the pending change.

    - Setup: A pending change on a "Nơi đổ hàng" cell that would add an entry with `when_goods` "Đá", `when_vehicle_plate` 51C12345 and `then_dropoff` "Gamma", and entry 2 with `when_goods` "Đá" and `then_dropoff` "Beta".
    - Input: Apply it with cause `dismiss`.
    - Expected: The change is `dismissed`, and entry 2 still says "Beta".

26. Backend (integration): A knowledge decision that hits a related note stays pending.

    - Setup: A pending change on a "Lương tài xế" cell from entry 1 (600000 → 700000). A note-only entry with `then_note` "lương tuyến Alpha tính theo tháng".
    - Input: Apply it with cause `company_knowledge`, `replace_conflicts` false and `notes_checked` false.
    - Expected: The result has action "check_notes" with that note, and the change is still pending.

27. Backend (integration): A checked note completes the pending change.

    - Setup: A pending change on a "Lương tài xế" cell from entry 1 (600000 → 700000). A note-only entry with `then_note` "lương tuyến Alpha tính theo tháng".
    - Input: Apply it with cause `company_knowledge`, `replace_conflicts` false and `notes_checked` true.
    - Expected: Entry 1 has `then_wage_vnd` 700000.

28. Backend (integration): A change whose source value changed since the export is refused.

    - Setup: A pending change on a "Lương tài xế" cell from entry 1 with before-value 600000. Entry 1's wage is now 750000.
    - Input: Apply it with cause `company_knowledge`, `replace_conflicts` false and `notes_checked` false.
    - Expected: The tool refuses it, and entry 1 keeps 750000.

29. Backend (unit): A drop-off cell from an entry's route condition allows only a paper correction.

    - Setup: A saved row of one paper whose "Nơi đổ hàng" cell has source kind `entry`, field `when_dropoff`, entry 1 and value "Beta". The new value is "Gamma".
    - Input: Build the change's candidates.
    - Expected: The only candidate is a `paper_reading` correction of that paper's drop-off company to "Gamma".

### Revert cost

Returned exports go back to normal sheet intake. The review tables stay and nothing reads them.

### Production manual test

> Needs a human test: the agent cannot send a Zalo message or file as an admin. A person performs steps 2, 3, 5 and 7.

- Get the workspace with this read-only query through `ssh render_personal`: `SELECT id FROM workspaces;`. Get the admin's id with `SELECT user_id FROM memberships WHERE workspace_id = '<workspace id>' AND role = 'admin';`.
- A person, as the admin, asks for a paper list for last month and downloads the file. The agent notes its export id with `SELECT id FROM company_exports WHERE workspace_id = '<workspace id>' AND requested_by_user_id = '<admin id>' ORDER BY created_at DESC LIMIT 1;`.
- The person sorts the rows by date, changes one weight cell and one wage cell, keeps every row and column, and sends the file back in the admin chat.
- Find the returned file: `SELECT f.id AS message_file_id, f.message_id FROM message_files f JOIN messages m ON m.id = f.message_id WHERE m.workspace_id = '<workspace id>' AND m.user_id = '<admin id>' ORDER BY m.created_at DESC LIMIT 1;`. Run `SELECT r.id, r.export_id, (SELECT count(*) FROM company_export_review_changes c WHERE c.review_id = r.id) FROM company_export_reviews r WHERE r.message_file_id = '<message_file_id>';`. The export id is the noted one, with 2 changes. Run `SELECT count(*) FROM document_sources WHERE message_id = '<message_id>';`. It is 0.
- The person answers in chat: dismiss the weight change, and save the wage change as standing knowledge.
- Run `SELECT column_key, status FROM company_export_review_changes WHERE review_id = '<review id>';`. The weight change is `dismissed` and the wage change is `applied`. Note the entry id from the wage change's candidate, and check `SELECT then_wage_vnd FROM company_knowledge_entries WHERE id = '<entry id>';` shows the new wage.
- The person restores the old wage in chat: "lương tuyến `<pickup company>` là `<old wage>`". Run the same entry query. It shows the old wage again.
