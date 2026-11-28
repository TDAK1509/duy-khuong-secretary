# PR 5 of 12 — "Pickup weight = drop-off weight" pairs trips across a one-character plate misread

Depends on: PR 2 of 12, "Standing facts become company knowledge entries with fixed outcomes".

What this PR needs from PR 2:

- `company_knowledge_entries` holds one row per thing the admin taught the company: conditions in `when_*` columns and outcomes in `then_*` columns. A check requires at least one outcome.
- `company_knowledge_links` holds one row per entry and paper it applies to.
- `save_company_knowledge` and `update_company_knowledge` write it.
- The admin prompt has the section `Kiến thức công ty:` written by PR 2.

## Done when

- An entry can say that the pickup weight equals the drop-off weight.
- In the trip report, a pickup paper linked to such an entry pairs with a drop-off paper whose plate differs by exactly one character, when both weights are present and exactly equal and the day window fits.
- With no such entry, with any weight difference, or with two different characters, the papers stay apart, as today.
- The pair is marked "Khớp trọng lượng", and the trip note in the "Ghi chú" sheet names both plates.

## Before / After

Before: The pickup ticket reads plate `51C12345` and the drop-off ticket reads `51C12346`. Both say 27080 kg. The trip report shows two half trips, "Không ghép được đơn" twice.

After: The admin says "hàng `<goods>` ở `<pickup company>`: khối lượng lấy bằng khối lượng đổ". The report then shows one trip with both tickets, marked "Khớp trọng lượng". The "Ghi chú" sheet says the plates differ by one character.

## Solution

- Schema, table `company_knowledge_entries`:
  - New column `then_equal_weights` boolean, not null, default false.
  - Add `then_equal_weights` to the "at least one outcome" check.
- Rule pairing (`src/app/trips/pair-drop-offs-by-rule.ts`, `pair-trips.ts`):
  - Before: a pickup and a drop-off can pair only with the same plate and a weight gap of at most 3%.
  - After: the same rule, plus one more case. When the pickup paper links an entry with `then_equal_weights` true, a drop-off candidate also counts when:
    - its plate has the same length and differs in exactly one character;
    - its weight equals the pickup weight exactly, in kg, and is above 0.
  - The day window and the mutual-closest rule do not change. When two such candidates tie, the pickup stays unpaired.
  - A pair from this case is kept even when the pairing model answered for that pickup. The model only sees same-plate papers, so it never saw this candidate.
  - The pairing method stays "Khớp trọng lượng".
- Trip notes (`describe-trip-notes.ts`): a trip paired by this case adds this exact line to the "Ghi chú" sheet: `Biển số hai phiếu khác một ký tự (<pickup plate> / <drop-off plate>); ghép theo kiến thức công ty: khối lượng lấy bằng khối lượng đổ.`
- Paper export: new fixed column "Khối lượng lấy = khối lượng đổ". Its value is "Có" when the winning linked entry has `then_equal_weights` true. It shows only when at least one row has "Có".
- `save_company_knowledge` and `update_company_knowledge` specs:
  - New property `then_equal_weights` (type `boolean`, required), with the exact description: `true chỉ khi quản lý nói khối lượng lấy hàng bằng khối lượng đổ hàng. false nếu không nêu.`
  - On `"updated"` from a save, `true` sets the flag and `false` keeps the old value. `update_company_knowledge` replaces it.
  - In the `save_company_knowledge` description, replace `chi phí bồi dưỡng và ghi chú` with `chi phí bồi dưỡng, khối lượng lấy hàng bằng khối lượng đổ hàng và ghi chú`.
- `export_trip_report_xlsx` spec:
  - Append this exact sentence to the description: ` Khi một kiến thức công ty nói khối lượng lấy bằng khối lượng đổ, máy chủ còn ghép phiếu lấy và phiếu đổ có cùng khối lượng, đúng khoảng ngày, mà biển số chỉ khác một ký tự; cặp đó vẫn là "Khớp trọng lượng" và sheet Ghi chú ghi rõ hai biển số.`
  - In the `value_name` description, replace `Chi phí bồi dưỡng, Ghi chú` with `Chi phí bồi dưỡng, Khối lượng lấy = khối lượng đổ, Ghi chú`.
- Admin prompt, section `Kiến thức công ty:`, exact edits:
  - In the first bullet, replace `chi phí bồi dưỡng, ghi chú.` with `chi phí bồi dưỡng, khối lượng lấy hàng bằng khối lượng đổ hàng, ghi chú.`
  - In the bullet that starts `- Không lưu vào then_note điều đã có trường kết quả riêng.`, replace `bồi dưỡng dùng then_allowance_vnd.` with `bồi dưỡng dùng then_allowance_vnd; khối lượng lấy bằng khối lượng đổ dùng then_equal_weights.`
  - Add this bullet after that bullet:

    ```text
    - Khi quản lý nói khối lượng lấy hàng bằng khối lượng đổ hàng cho một hàng hóa hoặc tuyến, gọi save_company_knowledge với then_equal_weights là true và các điều kiện quản lý nêu. Báo cáo chuyến dùng điều này để ghép phiếu lấy và phiếu đổ cùng khối lượng khi biển số đọc sai một ký tự. Không lưu điều này vào then_note.
    ```

### Tests, in order

1. Backend (unit): A one-character plate difference pairs when the pickup has the equal-weight outcome.

   - Setup: A pickup with plate 51C12345 and 27080 kg, whose linked entry has the equal-weight outcome. A drop-off with plate 51C12346 and 27080 kg on the next day.
   - Input: Pair by rule.
   - Expected: The two papers pair.

2. Backend (unit): Without the equal-weight outcome, the same papers stay apart.

   - Setup: A pickup with plate 51C12345 and 27080 kg that links no equal-weight entry. A drop-off with plate 51C12346 and 27080 kg on the next day.
   - Input: Pair by rule.
   - Expected: No pair.

3. Backend (unit): A one-character plate difference with a 20 kg difference stays apart.

   - Setup: A pickup with plate 51C12345 and 27080 kg, with the equal-weight outcome. A drop-off with plate 51C12346 and 27100 kg on the next day.
   - Input: Pair by rule.
   - Expected: No pair.

4. Backend (unit): A two-character plate difference stays apart.

   - Setup: A pickup with plate 51C12345 and 27080 kg, with the equal-weight outcome. A drop-off with plate 51C12399 and 27080 kg on the next day.
   - Input: Pair by rule.
   - Expected: No pair.

5. Backend (unit): Two equal candidates leave the pickup unpaired.

   - Setup: A pickup with plate 51C12345 and 27080 kg, with the equal-weight outcome. Drop-offs with plates 51C12346 and 51C12347, both 27080 kg, on the next day.
   - Input: Pair by rule.
   - Expected: No pair.

6. Backend (integration): The report keeps the cross-plate pair after the model step.

   - Setup: A pickup ticket with plate 51C12345 and 27080 kg, linked to an entry with the equal-weight outcome. A drop-off ticket with plate 51C12346 and 27080 kg on the next day. A fake pairing model that answers "none" for that pickup.
   - Input: Build the trip report.
   - Expected: One row holds both tickets, with "Cách ghép phiếu" = "Khớp trọng lượng".

7. Backend (integration): The report's "Ghi chú" sheet names both plates of a cross-plate pair.

   - Setup: A pickup ticket with plate 51C12345 and 27080 kg, linked to an entry with the equal-weight outcome. A drop-off ticket with plate 51C12346 and 27080 kg on the next day. A fake pairing model that answers "none".
   - Input: Build the trip report.
   - Expected: The "Ghi chú" sheet has the line `Biển số hai phiếu khác một ký tự (51C12345 / 51C12346); ghép theo kiến thức công ty: khối lượng lấy bằng khối lượng đổ.`

## Revert cost

Nothing breaks. The column stays and nothing reads it.

## Production manual test

> Needs a human test: the agent cannot send a Zalo message as an admin. A person performs steps 2 and 4.

- Find a real pair to test with. Get the workspace with this read-only query through `ssh render_personal`: `SELECT id FROM workspaces;`. Then run:

  ```sql
  WITH w AS (
    SELECT l.document_id, l.number AS kg FROM document_lines l JOIN meanings m ON m.id = l.meaning_id
    WHERE l.workspace_id = '<workspace id>' AND m.name = 'Trọng lượng hàng' AND l.unit = 'kg' AND l.number > 0
  )
  SELECT a.id AS pickup_id, a.vehicle_plate, b.id AS dropoff_id, b.vehicle_plate, a.document_date, wa.kg,
    (SELECT p.printed_name FROM document_parties p WHERE p.document_id = a.id AND p.role = 'issuer' LIMIT 1) AS pickup_issuer,
    (SELECT string_agg(coalesce(l.item, l.value), '; ') FROM document_lines l WHERE l.document_id = a.id
       AND (l.item IS NOT NULL OR regexp_replace(lower(unaccent(l.label)), '[^a-z0-9]', '', 'g') = 'hanghoa')) AS goods
  FROM documents a JOIN w wa ON wa.document_id = a.id
  JOIN documents b ON b.workspace_id = a.workspace_id AND b.id <> a.id AND b.status = 'accepted'
    AND length(b.vehicle_plate) = length(a.vehicle_plate) AND b.vehicle_plate <> a.vehicle_plate
    AND b.document_date BETWEEN a.document_date AND a.document_date + 1
    AND (SELECT count(*) FROM generate_series(1, length(a.vehicle_plate)) i WHERE substr(a.vehicle_plate, i, 1) <> substr(b.vehicle_plate, i, 1)) = 1
  JOIN w wb ON wb.document_id = b.id AND wb.kg = wa.kg
  WHERE a.workspace_id = '<workspace id>' AND a.status = 'accepted'
  LIMIT 5;
  ```

  Note one row: both ids, both plates, the month, the issuer and the goods.
- A person, as the admin, restates the old rule in chat with that row's goods and issuer: "hàng `<goods>` ở `<pickup issuer>`: khối lượng lấy bằng khối lượng đổ".
- Get the admin's id with `SELECT user_id FROM memberships WHERE workspace_id = '<workspace id>' AND role = 'admin';`. Get that message's time with `SELECT created_at FROM messages WHERE workspace_id = '<workspace id>' AND user_id = '<admin id>' AND author = 'user' ORDER BY created_at DESC LIMIT 1;`. Run `SELECT id FROM company_knowledge_entries WHERE workspace_id = '<workspace id>' AND author_user_id = '<admin id>' AND then_equal_weights AND updated_at >= '<that created_at>';`, which returns one entry, and `SELECT 1 FROM company_knowledge_links WHERE entry_id = '<that entry id>' AND document_id = '<pickup_id>';`, which returns one row.
- A person asks for the trip report of that month and forwards the link.
- The agent downloads the file. One row holds both ticket numbers of the noted pair, with "Khớp trọng lượng". The "Ghi chú" sheet has the line with both plates.
