# PR 9 of 12 — Before a save, the bot shows conflicting knowledge and asks which is correct

Depends on: PR 2 of 12, "Standing facts become company knowledge entries with fixed outcomes", and PR 4 of 12, "Company rules become notes in company knowledge", because the note check reads note-only entries.

What this PR needs from them:

- An entry in `company_knowledge_entries` has conditions (`when_goods`, `when_pickup_*`, `when_dropoff_*`, `when_vehicle_plate`, `when_driver_user_id`) and outcomes (`then_customer`, `then_dropoff`, `then_wage_vnd`, `then_rate_vnd_per_ton`, `then_allowance_vnd`, `then_note`, and, when PRs 3 and 5 have merged, `then_shown_goods_name` and `then_equal_weights`).
- A note-only entry has no condition.
- A save with the same conditions as an existing entry updates that entry (action `"updated"`).
- The admin prompt has the section `Kiến thức công ty:` written by PR 2.

## Done when

- A save does not write when another entry has overlapping conditions and a different value for the same outcome. The bot names both values and asks which is correct.
- When the admin picks the new value, the bot saves it and removes the differing outcome from the other entry. When the admin picks the old value, nothing changes.
- A save does not write while a note with overlapping conditions exists and has not been compared yet. When the note says something else, the bot asks the admin which is correct.
- When nothing conflicts and no note overlaps, the first call saves, as today.

## Before / After

Before: One entry says drop-off `<drop-off company A>`. A company note says the same goods from the same pickup go to `<drop-off company B>`. The admin saves a new route entry, and both stay. Reports mix them.

After: Saving the second drop-off replies "Đã có kiến thức nơi đổ hàng là `<A>` cho cùng hàng và nơi lấy hàng (12 giấy tờ chung). Thông tin nào đúng: `<A>` hay `<B>`?" Nothing is saved until the admin answers. A note that says otherwise is shown and asked about the same way.

## Solution

- Overlapping conditions, used for both checks:
  - Goods, plate and driver are compatible when they are equal, after accent-free and case-free normalization, or when one side has no condition.
  - Pickup conditions are compatible when they name the same company (by match key, alias or company pick) or when one side has none. Drop-off conditions follow the same rule. Two routes from one pickup to different drop-offs are not compatible, so their different values never conflict.
  - The entry being updated is never compared with itself.
- New: structured conflict. Before writing, `save_company_knowledge` and `update_company_knowledge` find the entries with overlapping conditions that set the same outcome to a different value.
  - Text values are compared after normalization, numbers by exact value.
  - Compared outcomes: customer, outcome drop-off, shown goods name, wage, rate per ton, allowance.
  - `then_equal_weights` false means "not stated" and never conflicts. Notes are not compared by code.
  - When one is found, return `action: "conflict"` and write nothing. `conflicts` lists, for each one: the other entry id, its conditions, the outcome name, the saved value, the new value, and `shared_documents`, the number of papers both entries apply to.
- New property `replace_conflicts` on both tools (type `boolean`, required), with the exact description: `Lần đầu luôn là false. Chỉ là true khi gọi lại sau action "conflict" và quản lý đã chọn thông tin mới là đúng; khi đó công cụ bỏ các kết quả khác ở các mục trong conflicts rồi lưu. Không tự chọn thay quản lý.`
  - With `true`, the server finds the conflicts again in the same transaction. On each conflicting entry, it sets the differing outcome to null, and deletes the entry when no outcome is left. Then it saves. It never touches an entry the check would not name.
- New: note check. When the write would succeed and `notes_checked` is false, find the entries with `then_note` whose conditions overlap. A note-only entry with no condition overlaps everything.
  - When there are any, return `action: "check_notes"` with `related_notes` (entry id, conditions, note, author), and write nothing.
  - When there are none, the first call saves.
  - A save with `notes_checked` true returns `same_route_entries`. These are the other entries that have the same pickup condition and compatible goods, plate and driver, but a different drop-off condition, each with its entry id, conditions and outcomes. When the admin picked the note's drop-off, this is the old route entry that says otherwise.
- New property `notes_checked` on both tools (type `boolean`, required), with the exact description: `Lần đầu luôn là false. Chỉ là true khi gọi lại sau action "check_notes" và bạn đã so related_notes với thông tin sắp lưu, hoặc quản lý đã chọn sau khi bạn hỏi.`
- Order of checks: the structured conflict first, then the notes.
- Append this exact sentence to both tool descriptions: ` Trước khi lưu, công cụ tìm mục có điều kiện chồng lấp nhưng kết quả khác (action "conflict") và các ghi chú có điều kiện chồng lấp (action "check_notes"); khi đó chưa đổi gì.`
- Admin prompt, section `Kiến thức công ty:`. Add these two exact bullets after the bullet that starts `- Trả lời theo action của save_company_knowledge:`:

  ```text
  - Nếu save_company_knowledge hoặc update_company_knowledge trả về action "conflict", chưa có gì thay đổi. Nêu từng mục trong conflicts bằng lời thường: kết quả đã lưu, kết quả mới, điều kiện của mục đã lưu và số giấy tờ chung (shared_documents), rồi hỏi đúng một câu: thông tin cũ hay thông tin mới đúng. Không tự chọn. Nếu quản lý nói cả hai đều đúng, hỏi điều kiện nào phân biệt hai trường hợp. Nếu quản lý chọn thông tin cũ, nói ngắn đã giữ thông tin cũ và không gọi công cụ thay đổi. Nếu quản lý chọn thông tin mới, gọi lại đúng công cụ với cùng tham số và replace_conflicts là true.
  - Nếu công cụ trả về action "check_notes", chưa lưu gì. Đọc từng ghi chú trong related_notes. Nếu một ghi chú nói khác với thông tin sắp lưu (ví dụ nơi đổ hàng khác), nêu ghi chú đó và thông tin mới rồi hỏi quản lý cái nào đúng. Nếu quản lý chọn thông tin mới, gọi lại với notes_checked là true, rồi đề nghị xóa ghi chú cũ và đề nghị xóa mục cũ nói khác, là từng mục trong same_route_entries của kết quả; chỉ xóa bằng delete_company_knowledge sau khi quản lý đồng ý. Nếu không có ghi chú nào nói khác, gọi lại ngay với notes_checked là true và không hỏi.
  ```

### Tests, in order

1. Backend (integration): A different drop-off for an overlapping route returns a conflict.

   - Setup: Entry 1 with `when_goods` "Đá" and `then_dropoff` "Beta", linked to two tickets with goods "Đá" that print "Alpha".
   - Input: Save an entry with `when_pickup` "Alpha", `when_goods` "Đá" and `then_dropoff` "Gamma", with `replace_conflicts` false and `notes_checked` false.
   - Expected: Action "conflict" names entry 1, the outcome drop-off, "Beta", "Gamma" and 2 shared papers.

2. Backend (integration): A conflict saves nothing.

   - Setup: Entry 1 with `when_goods` "Đá" and `then_dropoff` "Beta".
   - Input: Save an entry with `when_pickup` "Alpha", `when_goods` "Đá" and `then_dropoff` "Gamma", with `replace_conflicts` false and `notes_checked` false.
   - Expected: The workspace still has one entry.

3. Backend (integration): A conflict is found when no paper matches yet.

   - Setup: Entry 1 with `when_pickup` "Alpha" and `then_wage_vnd` 600000. No paper prints "Alpha".
   - Input: Save an entry with `when_pickup` "Alpha", `when_goods` "Cát" and `then_wage_vnd` 750000, with `replace_conflicts` false and `notes_checked` false.
   - Expected: Action "conflict" with 0 shared papers.

4. Backend (integration): Different plates do not conflict.

   - Setup: Entry 1 with `when_vehicle_plate` 51C12345 and `then_wage_vnd` 600000.
   - Input: Save an entry with `when_vehicle_plate` 51C67890 and `then_wage_vnd` 750000, with `replace_conflicts` false and `notes_checked` false.
   - Expected: Action "added".

5. Backend (integration): Replacing a conflict clears the old outcome and keeps the rest of the old entry.

   - Setup: Entry 1 with `when_goods` "Đá", `then_dropoff` "Beta" and `then_wage_vnd` 700000.
   - Input: Save an entry with `when_pickup` "Alpha", `when_goods` "Đá" and `then_dropoff` "Gamma", with `replace_conflicts` true and `notes_checked` true.
   - Expected: Entry 1 has no drop-off and keeps wage 700000.

6. Backend (integration): Replacing a conflict saves the new entry.

   - Setup: Entry 1 with `when_goods` "Đá", `then_dropoff` "Beta" and `then_wage_vnd` 700000.
   - Input: Save an entry with `when_pickup` "Alpha", `when_goods` "Đá" and `then_dropoff` "Gamma", with `replace_conflicts` true and `notes_checked` true.
   - Expected: An entry with `when_goods` "Đá" and `then_dropoff` "Gamma" exists.

7. Backend (integration): Replacing the only outcome deletes the old entry.

   - Setup: Entry 1 with `when_goods` "Đá" and only `then_dropoff` "Beta".
   - Input: Save an entry with `when_pickup` "Alpha", `when_goods` "Đá" and `then_dropoff` "Gamma", with `replace_conflicts` true and `notes_checked` true.
   - Expected: Entry 1 no longer exists.

8. Backend (integration): A company-wide note stops the first save.

   - Setup: A note-only entry with no condition and `then_note` "hàng Đá ở Alpha chỉ đổ ở Gamma".
   - Input: Save an entry with `when_pickup` "Alpha", `when_dropoff` "Beta" and `then_wage_vnd` 700000, with `replace_conflicts` false and `notes_checked` false.
   - Expected: Action "check_notes" with that note in `related_notes`.

9. Backend (integration): A note check saves nothing.

   - Setup: A note-only entry with no condition and `then_note` "hàng Đá ở Alpha chỉ đổ ở Gamma".
   - Input: Save an entry with `when_pickup` "Alpha", `when_dropoff` "Beta" and `then_wage_vnd` 700000, with `replace_conflicts` false and `notes_checked` false.
   - Expected: The workspace still has one entry.

10. Backend (integration): The same save with `notes_checked` true writes.

   - Setup: A note-only entry with no condition and `then_note` "hàng Đá ở Alpha chỉ đổ ở Gamma".
   - Input: Save an entry with `when_pickup` "Alpha", `when_dropoff` "Beta" and `then_wage_vnd` 700000, with `replace_conflicts` false and `notes_checked` true.
   - Expected: Action "added".

11. Backend (integration): A note on another plate does not stop the save.

    - Setup: A note entry with `when_vehicle_plate` 51C12345 and `then_note` "xe này chỉ chở cát".
    - Input: Save an entry with `when_vehicle_plate` 51C67890 and `then_wage_vnd` 750000, with `replace_conflicts` false and `notes_checked` false.
    - Expected: Action "added".

12. Backend (integration): Two routes from one pickup to different drop-offs do not conflict.

    - Setup: Entry 1 with `when_pickup` "Alpha", `when_dropoff` "Beta" and `then_wage_vnd` 600000.
    - Input: Save an entry with `when_pickup` "Alpha", `when_dropoff` "Gamma" and `then_wage_vnd` 750000, with `replace_conflicts` false and `notes_checked` false.
    - Expected: Action "added".

13. Backend (integration): After the admin picks the note's drop-off, the bot is offered the old route entry to delete.

    - Setup: Entry 1 with `when_pickup` "Alpha", `when_goods` "Đá", `when_dropoff` "Beta" and `then_wage_vnd` 700000. A note-only entry with no condition and `then_note` "hàng Đá ở Alpha chỉ đổ ở Gamma".
    - Input: Save an entry with `when_pickup` "Alpha", `when_goods` "Đá", `when_dropoff` "Gamma" and `then_wage_vnd` 700000, with `replace_conflicts` false and `notes_checked` true.
    - Expected: The result's `same_route_entries` holds entry 1.

## Revert cost

Nothing breaks. Saves go back to writing at once.

## Production manual test

> Needs a human test: the agent cannot send a Zalo message as an admin. A person performs steps 2 and 4.

- Get the workspace with this read-only query through `ssh render_personal`: `SELECT id FROM workspaces;`. Find the note and the route entry that disagree on the drop-off: `SELECT id, when_goods, when_pickup_name, when_dropoff_name, then_dropoff, then_note FROM company_knowledge_entries WHERE workspace_id = '<workspace id>' AND (when_dropoff_name IS NOT NULL OR then_dropoff IS NOT NULL OR then_note IS NOT NULL) ORDER BY created_at;`. Note the route entry id, the note entry id, and the total number of entries from `SELECT count(*) FROM company_knowledge_entries WHERE workspace_id = '<workspace id>';`.
- A person, as the admin, restates that route with the drop-off company named in the note.
- Get the admin's id with `SELECT user_id FROM memberships WHERE workspace_id = '<workspace id>' AND role = 'admin';`. Get that message's time with `SELECT created_at FROM messages WHERE workspace_id = '<workspace id>' AND user_id = '<admin id>' AND author = 'user' ORDER BY created_at DESC LIMIT 1;`. Read the reply with `SELECT text FROM messages WHERE workspace_id = '<workspace id>' AND user_id = '<admin id>' AND author = 'bot' AND created_at > '<that created_at>' ORDER BY created_at LIMIT 1;`. It names both drop-off companies and asks which one is correct. The total number of entries is unchanged.
- The person answers with one company.
- Run `SELECT id, when_pickup_name, when_dropoff_name FROM company_knowledge_entries WHERE workspace_id = '<workspace id>' AND author_user_id = '<admin id>' AND updated_at >= '<that created_at>';`. When the admin chose the note's company, a new route entry with that drop-off exists and the next bot reply offers to delete the note entry. When the admin chose the old company, no new entry exists.
