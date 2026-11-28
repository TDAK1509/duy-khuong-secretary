# PR 10 of 12 — Templates keep example images, and the reader learns from them

Depends on: nothing. This PR does not touch company knowledge.

## Done when

- Each document template keeps 1 to 3 example papers: each paper's photo key and its accepted reading.
- `save_document_template` takes the example papers. `propose_document_templates` suggests them, and `list_document_templates` shows them.
- When the reader picks a template, it gets each example photo with its accepted reading before the photo to read. Template rereads do the same.
- A missing example photo is skipped and does not fail the read.

## Before / After

Before: The reader gets the template's name, kind, stage and fields as text only.

After: The reader also sees one to three real photos of the same template. Each one is followed by the reading the company accepted for it, and is marked as an example.

## Solution

- Schema. New table `document_template_examples`: one row is one ordered example of one template.
  - `id` uuid, not null, primary key, default `gen_random_uuid()`.
  - `workspace_id` uuid, not null.
  - `template_id` uuid, not null. Foreign key (`template_id`, `workspace_id`) to `document_templates` (`id`, `workspace_id`), delete cascades.
  - `position` smallint, not null, check `position BETWEEN 1 AND 3`.
  - `source_document_id` uuid, null. Foreign key (`source_document_id`, `workspace_id`) to `documents` (`id`, `workspace_id`), delete sets `source_document_id` null.
  - `image_key` text, not null, check `btrim(image_key) <> ''`. It is the existing photo key that `find-document-photos.ts` returns (`message.image_key`). The photo is not copied.
  - `expected_reading` jsonb, not null, check `jsonb_typeof(expected_reading) = 'object'`.
  - `created_at` timestamptz, not null, default now().
  - Unique index on (`template_id`, `position`). Unique index on (`template_id`, `image_key`).
  - Row-level security: the same `in_scope` policy as `document_templates`.
- A valid example paper is accepted, is in the same workspace, and has a source photo that is not deleted.
- `expected_reading` is a snapshot of the saved paper. It has exactly the keys of one item of the template-enabled reader schema (`itemSchema` in `src/app/reading/reading.ts`). Every key is present, and a value with no data stays `null` or an empty array:
  - `category`, `maintenance_item`, `occurred_on`, `amount_vnd`, `identifiers`: from the paper's source record in `records`.
  - `document_title`: from `documents.title`.
  - `vehicle_plate`, `document_number`, `stage`: from `documents`.
  - `document_kind`: from `documents.kind`.
  - `parties`: one object per `document_parties` row, as `{ role, type, printed_name, known_name }`. `known_name` is the saved company name when the party is linked to one, else `null`.
  - `details`: one object per `document_lines` row, in line order, as `{ label, value, number, unit, meaning, item, date_time }`. `meaning` is the meaning name. `date_time` is the line's `at` written as `YYYY-MM-DDTHH:mm:ss`, or `YYYY-MM-DD` for a date.
  - `template`: the template's short id as the reader sees it (`t1`, `t2`, …), filled in when the request is built.
- No model call reads the example again.
- `save_document_template` replaces the template's examples with the given papers, in the given order.
- A proposal made from one paper returns that paper as its example. A proposal made from all papers returns up to three of the newest papers it counted for that template.
- Reader (`reading.ts`, `document-rules.ts`):
  - The template picker does not change.
  - Once a template is picked, load its examples. For each one, in position order, add a text part, then the photo, then the expected-reading part. Then add the photo to read and the existing read request.
  - When a photo cannot be loaded, log it, skip that example and keep reading. With no example left, the read is the same as today.
  - Log one line per read with a picked template: `[reader] template_examples=<number of examples sent>`.
- Template backfills use the same read request, so they get the examples too.
- Add the tag `template-example-reading` to `src/app/reading/retrieved-data.ts`.
- Exact text appended to `TEMPLATE_RULE`, after its last sentence, separated by one space:

  ```text
  Thẻ <retrieved-data source="template-example-reading"> và ảnh ngay trước nó là ví dụ do quản lý chọn cho mẫu này. Ví dụ cho biết bố cục và kết quả đúng của một giấy tờ cũ; không chép số, ngày, biển số, công ty hay giá trị từ ví dụ sang giấy tờ đang đọc. Chỉ dùng ví dụ để nhận ra vị trí và ý nghĩa trường. Ảnh cuối trong thẻ photo mới là giấy tờ cần đọc.
  ```

- For each example, use exactly this text part before its photo:

  ```text
  Ví dụ {position} của mẫu đã chọn; ảnh ví dụ nằm ngay sau dòng này.
  ```

  Then, after the photo, this exact part:

  ```text
  <retrieved-data source="template-example-reading">{expected reading JSON}</retrieved-data>
  ```

- `save_document_template` spec:
  - Append this exact text to the description: ` Mỗi mẫu phải có từ 1 đến 3 giấy tờ ví dụ đã lưu còn ảnh. Công cụ lưu ảnh và kết quả đã chấp nhận của các giấy tờ đó làm ví dụ cho lần đọc sau.`
  - New property `example_paper_ids` (array of strings, 1 to 3 items, required), with the exact description: `Từ 1 đến 3 id giấy tờ đã lưu còn ảnh, theo thứ tự ví dụ tốt nhất trước. Lấy id từ propose_document_templates, list_documents hoặc search_records.`
- `propose_document_templates` spec: append this exact sentence to the description: ` Mỗi đề xuất trả về example_paper_ids là tối đa ba giấy tờ đại diện còn ảnh để dùng khi lưu mẫu.`
- `list_document_templates` spec: replace the description with exactly: `Liệt kê các mẫu giấy tờ đã lưu của nhóm: tên, loại giấy tờ, công ty phát hành, lấy hàng hay đổ hàng, mô tả, các trường, các giấy tờ ví dụ, số lần sửa và số giấy tờ đã khớp mẫu.`
- Admin prompt `DOCUMENT_TEMPLATE_SECTION`: add this exact bullet after the bullet that starts `- Gọi save_document_template khi bản nháp đã đủ`:

  ```text
  - Mỗi mẫu cần 1–3 ảnh ví dụ. Dùng example_paper_ids do propose_document_templates trả về, trừ khi quản lý chọn giấy tờ khác. Nêu các giấy tờ ví dụ trong bản nháp trước khi gọi save_document_template. Ví dụ chỉ dạy bố cục; hệ thống không chép giá trị của ví dụ sang giấy tờ mới.
  ```

- The save confirmation (`check-template-save.ts`) lists the example papers in the draft it shows the admin.

### Tests, in order

1. Backend (integration): Saving a template stores an example whose reading fits the reader item schema.

   - Setup: An accepted weigh ticket with one source photo that is not deleted.
   - Input: Save a template with that ticket as its only example.
   - Expected: The stored `expected_reading` passes the template-enabled reader item schema.

2. Backend (integration): The snapshot keeps parties, number and date details, and null fields.

   - Setup: An accepted weigh ticket with one source photo. It has an issuer party, a line "Trọng lượng hàng" with 27080 kg, a line "Thời điểm cân lần 1" with a date and time, no document title and no amount.
   - Input: Save a template with that ticket as its only example.
   - Expected: The snapshot has the issuer in `parties`, the weight line with number 27080 and unit "kg", the time line with `date_time`, and `document_title` and `amount_vnd` as null.

3. Backend (integration): A paper whose photo is deleted cannot be an example.

   - Setup: An accepted paper whose source photo is deleted.
   - Input: Save a template with that paper as its only example.
   - Expected: The save is refused, and no template row is written.

4. Backend (unit): A picked template puts its example before the photo to read.

   - Setup: A picked template with one example photo and its reading.
   - Input: Build the reader request for a new photo.
   - Expected: The parts are, in order: the example text part, the example photo, the expected-reading part, the new photo.

5. Backend (unit): A missing example photo is skipped.

   - Setup: A picked template with two examples. Photo storage has no object for the first one.
   - Input: Build the reader request for a new photo.
   - Expected: The request holds only the second example.

6. Backend (integration): Saving the template again replaces its examples.

   - Setup: A template with examples from paper 1 and paper 2, and a third accepted paper with a photo.
   - Input: Save the same template with only paper 3.
   - Expected: The template has one example, from paper 3.

## Revert cost

The table stays and nothing reads it. Templates and papers do not change.

## Production manual test

> Needs a human test: the agent cannot send a Zalo message as an admin or a driver. A person performs steps 2 and 4.

- Get the workspace with this read-only query through `ssh render_personal`: `SELECT id FROM workspaces;`. Get an admin and a driver: `SELECT user_id, role FROM memberships WHERE workspace_id = '<workspace id>';`.
- A person, as the admin, asks the admin chat to set up a template from a saved weigh ticket, checks the example papers in the draft, and answers Có.
- Run `SELECT t.id, x.position, x.image_key IS NOT NULL, jsonb_typeof(x.expected_reading) FROM document_templates t JOIN document_template_examples x ON x.template_id = t.id WHERE t.workspace_id = '<workspace id>' ORDER BY t.created_at DESC LIMIT 3;`. At least one row, with `true` and `object`. Note the template id.
- A person, as the driver, sends a photo of the same kind of ticket.
- Find that photo's paper: `SELECT id FROM messages WHERE workspace_id = '<workspace id>' AND user_id = '<driver id>' AND author = 'user' AND image_key IS NOT NULL ORDER BY created_at DESC LIMIT 1;`, then `SELECT d.id, d.template_id FROM documents d JOIN document_sources s ON s.document_id = d.id WHERE s.message_id = '<message id>';`. The `template_id` is the noted template id.
- Read the Render log around that message's time. It shows `[reader] template_examples=` with a number above 0, and no error.
