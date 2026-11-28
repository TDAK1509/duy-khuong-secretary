# PR 3 of 12 — A shown goods name is part of company knowledge

Depends on: PR 2 of 12, "Standing facts become company knowledge entries with fixed outcomes".

What this PR needs from PR 2:

- `company_knowledge_entries` holds one row per thing the admin taught the company. Its conditions are `when_goods`, `when_pickup_*`, `when_dropoff_*`, `when_vehicle_plate` and `when_driver_user_id`. Its outcomes are `then_*` columns, and a check requires at least one outcome.
- `company_knowledge_links` holds one row per entry and paper it applies to.
- A goods condition matches when every condition token is found in the same goods text. A token under 4 characters must be equal. A token of 4 or more characters can also match as a prefix.
- The admin prompt has the section `Kiến thức công ty:` written by PR 2.

## Done when

- An entry can carry a shown goods name. The trip report and the paper export show it for every paper the entry applies to.
- "Hàng có chữ `<goods>` ở `<pickup company>` hiển thị là `<shown name>`" saves as one entry with a goods condition, a pickup condition and a shown goods name.
- After deploy, the old goods-name rows are entries. The `goods_names` table and its three tools are gone.

## Before / After

Before: "Than Da, Than đều là Than đá" goes to a separate goods-name list, which only the trip report reads. "Hàng có chữ `<goods>` ở `<pickup company>` hiển thị là `<shown name>`" has no place to go. It ends as a free rule that no report applies.

After: Both are entries. The trip report and the paper export show "`<shown name>`" for every paper that prints `<pickup company>` and `<goods>`.

## Solution

- Schema, table `company_knowledge_entries`:
  - New column `then_shown_goods_name` text, null, check `then_shown_goods_name IS NULL OR char_length(btrim(then_shown_goods_name)) BETWEEN 1 AND 80`.
  - Add `then_shown_goods_name IS NOT NULL` to the "at least one outcome" check.
- Migration:
  - Each `goods_names` row becomes one entry: `statement` = `<written_name> → <shown_name>`, `when_goods` = `written_name`, `then_shown_goods_name` = `shown_name`, with the same author and `created_at`.
  - Link the new entries to matching papers.
  - Drop the table `goods_names`.
  - Log one line: `[migration] goods_names_moved=<n> entries_inserted=<n> papers_linked=<n>`.
- Trip report and pairing (`export-trip-report-xlsx-tool.ts`, `pair-trips.ts`, `build-trip-report.ts`):
  - Before: `loadShownGoodsNames` / `showGoodsName` map a printed goods name to the shown name.
  - After: the shown goods name of a trip is the winning `then_shown_goods_name` of the entries linked to the trip's pickup paper, or to its drop-off paper when there is no pickup. The newest `updated_at` wins. With no such entry, the trip shows the printed goods name, as today. The pairing input uses the same name.
- Paper export (`build-documents-workbook.ts`): new fixed column "Tên hàng hiển thị", from the winning linked entry. It shows only when at least one row has a value.
- `list_documents` `company_knowledge` gains the name "Tên hàng hiển thị".
- Remove `join_goods_names`, `list_goods_names`, `remove_goods_name`, `goods-name-specs.ts`, `goods-name-tools.ts`, the folder `src/app/goods-names/`, their ability lines and `GOODS_NAMES_SECTION`.
- `save_company_knowledge` and `update_company_knowledge` specs:
  - New property `then_shown_goods` (`['string','null']`, required) with the exact description: `Tên hàng hiển thị trong báo cáo cho mọi giấy tờ khớp điều kiện, như quản lý viết, ví dụ "Than đá" trong "Than Da, Than đều là Than đá". Tối đa 80 ký tự. null nếu không nêu.`
  - In the `save_company_knowledge` description, replace `Kết quả có thể gồm khách hàng, nơi đổ hàng, lương tài xế` with `Kết quả có thể gồm khách hàng, nơi đổ hàng, tên hàng hiển thị, lương tài xế`.
- `export_trip_report_xlsx` spec, `value_name` description: replace `một trong Khách hàng, Nơi đổ hàng, Lương tài xế` with `một trong Khách hàng, Nơi đổ hàng, Tên hàng hiển thị, Lương tài xế`.
- Admin prompt, section `Kiến thức công ty:`, exact edits:
  - In the first bullet, replace `kết quả then: khách hàng, nơi đổ hàng, lương tài xế` with `kết quả then: khách hàng, nơi đổ hàng, tên hàng hiển thị, lương tài xế`.
  - In the bullet that starts `- Không lưu vào then_note điều đã có trường kết quả riêng.`, replace `nơi đổ hàng là kết quả dùng then_dropoff;` with `nơi đổ hàng là kết quả dùng then_dropoff; tên hàng cần hiển thị dùng then_shown_goods;`.
  - Add this bullet right after the bullet that starts `- Tên hoặc mã hàng luôn ghi vào when_goods`:

    ```text
    - Khi quản lý nói nhiều cách viết tên hàng là cùng một hàng, ví dụ "Than Da, Than đều là Than đá", gọi save_company_knowledge một lần cho mỗi cách viết, với when_goods là cách viết đó và then_shown_goods là tên hiển thị. Khi quản lý nói hàng ở một nơi hiển thị bằng một tên, ví dụ "hàng có chữ Than ở <A> hiển thị là Than đá", gọi save_company_knowledge một lần với when_goods, when_pickup_company và then_shown_goods. Chỉ dùng cách viết quản lý nêu, không tự đoán thêm. Giấy tờ đã lưu vẫn giữ tên in trên giấy; báo cáo chuyến và file Excel dùng tên hiển thị.
    ```

### Tests, in order

1. Backend (integration): The trip report shows the shown goods name of the linked entry.

   - Setup: A paired trip whose pickup ticket prints goods "Than cám loại 2" and links an entry with `when_goods` "Than" and `then_shown_goods_name` "Than đá".
   - Input: Build the trip report with a goods column.
   - Expected: The goods cell is "Than đá".

2. Backend (integration): A trip with no shown-name entry keeps the printed goods name.

   - Setup: A paired trip whose pickup ticket prints goods "Cát" and links no entry.
   - Input: Build the trip report with a goods column.
   - Expected: The goods cell is "Cát".

3. Backend (integration): The paper export shows the shown goods name.

   - Setup: An accepted paper with goods "Than" linked to an entry with `when_goods` "Than" and `then_shown_goods_name` "Than đá".
   - Input: Build the paper workbook.
   - Expected: The column "Tên hàng hiển thị" is "Than đá" for that row.

4. Backend (integration): A goods name with a pickup condition applies only at that pickup.

   - Setup: An entry with `when_goods` "Than", `when_pickup` "Alpha" and `then_shown_goods_name` "Than đá". Two accepted tickets with goods "Than": one prints "Alpha", one prints only "Beta".
   - Input: Link the entry to matching papers.
   - Expected: Only the ticket that prints "Alpha" is linked.

5. Backend (integration): The migration turns a goods-name row into an entry.

   - Setup: Before the migration, a goods-name row "Than Da" → "Than đá".
   - Input: Run the migration.
   - Expected: One entry with `when_goods` "Than Da" and `then_shown_goods_name` "Than đá".

6. Backend (integration): The migration removes the old goods-name table.

   - Setup: Before the migration, a goods-name row "Than Da" → "Than đá".
   - Input: Run the migration.
   - Expected: The table `goods_names` no longer exists.

7. Backend (integration): A migrated two-word goods name does not link goods that hold only its long word.

   - Setup: Before the migration, a goods-name row "Than đá" → "Than đá loại A". An accepted ticket with goods "Than cám".
   - Input: Run the migration.
   - Expected: The new entry is not linked to the ticket.

## Revert cost

`goods_names` is dropped. A revert recreates it empty. The shown names stay on the entries.

## Production manual test

> Needs a human test: the agent cannot send a Zalo message as an admin. A person performs steps 3 and 5.

- Read the Render deploy log. It has the line `[migration] goods_names_moved=… entries_inserted=… papers_linked=…`, and `goods_names_moved` equals `entries_inserted`.
- Find the workspace with this read-only query through `ssh render_personal`: `SELECT id FROM workspaces;`. Run `SELECT count(*) FROM company_knowledge_entries WHERE workspace_id = '<workspace id>' AND then_shown_goods_name IS NOT NULL;`, which is at least `entries_inserted`, and `SELECT to_regclass('goods_names');`, which returns null.
- A person, as the admin, restates the old rule in chat: "hàng có chữ `<goods>` ở `<pickup company>` hiển thị là `<shown name>`".
- Get the admin's id with `SELECT user_id FROM memberships WHERE workspace_id = '<workspace id>' AND role = 'admin';`. Get that message's time with `SELECT created_at FROM messages WHERE workspace_id = '<workspace id>' AND user_id = '<admin id>' AND author = 'user' ORDER BY created_at DESC LIMIT 1;`. Then run `SELECT e.id, e.when_goods, e.when_pickup_name, e.then_shown_goods_name, (SELECT count(*) FROM company_knowledge_links l WHERE l.entry_id = e.id) FROM company_knowledge_entries e WHERE e.workspace_id = '<workspace id>' AND e.author_user_id = '<admin id>' AND e.updated_at >= '<that created_at>';`. It shows the three values and a paper count above 0.
- A person asks for a trip report for last month with a goods column, and forwards the link.
- The agent downloads the file. The trips whose pickup paper is linked to that entry show "`<shown name>`". To list those papers, run `SELECT document_id FROM company_knowledge_links WHERE entry_id = '<entry id>';`.
