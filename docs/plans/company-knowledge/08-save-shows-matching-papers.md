# PR 8 of 12 — After a save, the bot shows how many papers match and gives examples

Depends on: PR 2 of 12, "Standing facts become company knowledge entries with fixed outcomes".

What this PR needs from PR 2:

- The tools `save_company_knowledge` and `update_company_knowledge` exist. Both return `linked_documents`, the number of papers the entry applies to after the write.
- `company_knowledge_links` holds one row per entry and paper.
- The admin prompt has the section `Kiến thức công ty:` written by PR 2.

## Done when

- After a save or an update, the tool result holds `linked_documents` and up to 3 example papers, newest paper date first.
- The bot names each example by kind or title, number, date and plate.
- When an entry with conditions matches 0 papers, the bot says so, names the company and goods it used, and asks the admin which condition to change.
- A note with no condition gets no "change the condition" question.

## Before / After

Before: "Đã lưu kiến thức mới, áp dụng cho 0 giấy tờ." The admin cannot tell why.

After: "Đã lưu, áp dụng cho 14 giấy tờ, ví dụ: phiếu cân số `<number>` ngày `<date>` xe `<plate>`, …". With 0: "Mục này chưa khớp giấy tờ nào (lấy hàng ở `<pickup company>`, hàng `<goods>`). Anh/chị muốn đổi tên công ty hay hàng hóa?"

## Solution

- Save and update results: add `example_documents`, with up to 3 papers linked to the entry, newest paper date first, then newest saved. Each one has kind or title, document number, paper date and plate. Null fields are left out. Ids are not shown.
- Append this exact sentence to the descriptions of `save_company_knowledge` and `update_company_knowledge`: ` Kết quả có example_documents: tối đa 3 giấy tờ khớp, mới nhất trước.`
- Admin prompt, section `Kiến thức công ty:`. Make these exact replacements:
  - Replace the bullet `- Sau khi lưu, nói bằng lời thường đã lưu gì: điều kiện, từng kết quả và số giấy tờ áp dụng, lấy từ linked_documents của kết quả công cụ.` with:

    ```text
    - Sau khi lưu hoặc sửa, nói bằng lời thường đã lưu gì: điều kiện và từng kết quả. Luôn nói số giấy tờ trong linked_documents và nêu từng giấy tờ trong example_documents bằng loại hoặc tiêu đề, số, ngày và biển số nếu có, để quản lý kiểm tra.
    ```

  - Replace the bullet `- Nếu kiến thức áp dụng cho 0 giấy tờ, hoặc ít hơn nhiều so với điều quản lý có vẻ mong đợi, nói rõ điều đó và đề nghị kiểm tra lại tên công ty hoặc hàng hóa.` with:

    ```text
    - Nếu linked_documents là 0, nói mục này chưa khớp giấy tờ nào, nêu đúng tên công ty và hàng hóa đã dùng để khớp, và hỏi quản lý muốn đổi điều kiện nào. Không nói mục đang được áp dụng khi số là 0. Nếu ít hơn nhiều so với điều quản lý có vẻ mong đợi, nói rõ điều đó và nhờ quản lý kiểm tra các giấy tờ ví dụ. Mục chỉ có ghi chú và không có điều kiện không áp dụng cho giấy tờ nào; không hỏi đổi điều kiện cho mục đó.
    ```

### Tests, in order

1. Backend (integration): A save that matches five papers returns three examples, newest first.

   - Setup: Five accepted weigh tickets that print "Alpha", with five different paper dates.
   - Input: Save an entry with `when_pickup` "Alpha" and `then_wage_vnd` 700000.
   - Expected: `example_documents` holds the three tickets with the latest dates, newest first.

2. Backend (integration): A save that matches two papers returns two examples.

   - Setup: Two accepted weigh tickets that print "Alpha".
   - Input: Save an entry with `when_pickup` "Alpha" and `then_wage_vnd` 700000.
   - Expected: `example_documents` holds both tickets.

3. Backend (integration): A save that matches nothing returns no examples.

   - Setup: No paper prints "Alpha".
   - Input: Save an entry with `when_pickup` "Alpha" and `then_wage_vnd` 700000.
   - Expected: `linked_documents` is 0 and `example_documents` is empty.

4. Backend (integration): An example without a plate leaves the plate out.

   - Setup: One accepted handover record that prints "Alpha" and has no plate.
   - Input: Save an entry with `when_pickup` "Alpha" and `then_wage_vnd` 700000.
   - Expected: The one example has kind, number and date, and no plate field.

5. Backend (integration): An update also returns examples.

   - Setup: An entry with `when_pickup` "Alpha" and `then_wage_vnd` 600000, linked to two accepted tickets that print "Alpha".
   - Input: Update the entry with `when_pickup` "Alpha" and `then_wage_vnd` 750000.
   - Expected: `example_documents` holds both tickets.

## Revert cost

Nothing breaks. Replies go back to the count only.

## Production manual test

> Needs a human test: the agent cannot send a Zalo message as an admin. A person performs steps 2, 4 and 6.

- Get the workspace with this read-only query through `ssh render_personal`: `SELECT id FROM workspaces;`. Get the admin's id with `SELECT user_id FROM memberships WHERE workspace_id = '<workspace id>' AND role = 'admin';`.
- A person, as the admin, saves an entry for a known route, for example "lương tuyến lấy hàng ở `<pickup company>` là `<wage>`".
- Get that message's time with `SELECT created_at FROM messages WHERE workspace_id = '<workspace id>' AND user_id = '<admin id>' AND author = 'user' ORDER BY created_at DESC LIMIT 1;`. Read the reply with `SELECT text FROM messages WHERE workspace_id = '<workspace id>' AND user_id = '<admin id>' AND author = 'bot' AND created_at > '<that created_at>' ORDER BY created_at LIMIT 1;`. Find the entry with `SELECT id FROM company_knowledge_entries WHERE workspace_id = '<workspace id>' AND author_user_id = '<admin id>' AND updated_at >= '<that created_at>';`. Run `SELECT d.document_number, d.document_date, d.vehicle_plate FROM company_knowledge_links l JOIN documents d ON d.id = l.document_id WHERE l.entry_id = '<entry id>' ORDER BY d.document_date DESC LIMIT 3;`. The three papers in the reply match these rows.
- A person, as the admin, saves "lương tuyến lấy hàng ở công ty Thử Nghiệm Không Tồn Tại là 1k". No paper prints that name.
- Read the reply the same way. It says 0 and asks which condition to change. Find the test entry with `SELECT id FROM company_knowledge_entries WHERE workspace_id = '<workspace id>' AND when_pickup_name ILIKE '%Thử Nghiệm Không Tồn Tại%';`. Note its id.
- The person tells the admin chat "xóa kiến thức lương tuyến lấy hàng ở Thử Nghiệm Không Tồn Tại".
- Run `SELECT count(*) FROM company_knowledge_entries WHERE id = '<test entry id>';`. It returns 0.
