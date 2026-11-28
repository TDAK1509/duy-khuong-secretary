# PR 1 of 12 — A route fact matches every paper that prints its company

Depends on: nothing. This PR changes the existing `facts` tables.

## Done when

- A route fact with a pickup company links every accepted paper that prints that company, whatever role the reader gave it, including handover papers with item lines.
- A route fact that names a pickup and a drop-off links a paper that prints either company.
- A customer that the admin names is saved only as the value "Khách hàng". It never limits which papers link.
- A goods condition links a paper only when every word of the condition is found in the same goods text on the paper.
- `total_fact_values` counts each trip once, by the same trip building as the trip report.
- After deploy, every existing route fact links to at least one paper.

## Before / After

Before: The admin saves "goods `<goods>` from `<pickup company>` to `<drop-off company>`, customer `<customer company>`, wage 700k". The bot says it applies to 0 papers. The pickup weigh ticket was read with stage `receipt`, which allows no pickup role. The customer company is printed only as supplier. The handover record has item lines and is skipped.

After: The same fact links the pickup weigh ticket and the handover records that print `<pickup company>` and `<goods>`. Each linked paper shows "Khách hàng: `<customer company>`". "tổng lương tháng này" counts the wage once per trip.

## Bug

An admin teaches a route with goods, a pickup company, a drop-off company, a customer and prices. The bot replies that it applies to 0 papers, while the pickup and handover papers print those companies.

Reproduce: save a route fact whose pickup company is printed as issuer on a receipt-stage weigh ticket, and whose customer company is printed only as supplier. Then call `list_facts`. It says "áp dụng cho 0 giấy tờ".

## Root cause

All in `src/app/facts/link-facts.ts`:

- Each company slot is tied to fixed party roles. `PICKUP_ROLES` is empty for stage `receipt`, and `CUSTOMER_ROLES` is only `customer`.
- The customer slot is a required condition (`fact.customer_match_key IS NULL OR …`).
- Route facts link only papers that pass `IS_TRIP_TICKET`, which rejects papers with item lines.
- The goods match reads only no-item lines labelled "Hàng hóa".
- When a fact names a pickup, its drop-off is ignored for matching (`fact.pickup_match_key IS NOT NULL OR …`). A drop-off receipt that prints the drop-off company and the goods, but not the pickup company, never links.
- The goods match keeps only the "distinctive" condition tokens (4+ characters or a digit) and drops the others. A two-word condition can then match goods that hold only the long word.

## Solution

- Company match:
  - Before: the pickup slot matches party roles chosen by stage, the drop-off slot matches its own role list, and the customer matches only role `customer`.
  - After: the pickup slot matches any party on the paper, in any role, by match key, alias or company pick. The drop-off slot matches the same way.
  - Pickup and drop-off are both conditions. When a fact names both, a paper matches when it prints the pickup company or the drop-off company; one is enough.
  - The trip report keeps choosing between the facts of one pickup paper by the trip's drop-off receiver (`matchDropOffNames` in `match-trip-facts.ts`), using the fact's drop-off name.
  - Trip level: when a trip has a pickup paper, a fact with a pickup condition that this pickup paper does not print is left out of the whole trip, for both of its papers. The trip report, its values and the totals ignore that fact for this trip, even when the fact links the trip's drop-off paper. The code is `listUnprintedPickupFacts` in `list-pickup-facts.ts`, used by `match-trip-facts.ts`. A trip with only a receipt keeps the drop-off choice and the newest fact.
  - Customer is not a condition.
- Which papers a route fact can link:
  - Before: only papers that pass `IS_TRIP_TICKET`.
  - After: any accepted paper whose kind is not "tin nhắn" and whose `sheet_signature` is null. Plate, driver and goods conditions still narrow the match.
  - `IS_TRIP_TICKET` stays as it is for the trip report and `find-accepted-documents.ts`.
- Goods match:
  - Before: the goods value matches only a no-item "Hàng hóa" line, using the distinctive-token shortcut.
  - After: it matches a no-item "Hàng hóa" line or the `item` text of any line. Normalize both sides: no accents, lower case, split on anything that is not a letter or digit.
  - Every condition token must be found in the same goods text.
  - A condition token of 4 or more characters matches a goods token that is equal to it, or when one of the two starts with the other and the shorter one has 4 or more characters.
  - A condition token under 4 characters matches only an equal token.
  - Remove the distinctive-token shortcut.
- Customer as a condition:
  - Before: `facts.customer_name`, `facts.customer_match_key`, `facts.customer_resolved`, `fact_companies` rows with slot `customer`, and the route identity in `route-fact-identity.ts` all include the customer.
  - After: the customer is only the text value "Khách hàng" in `fact_values`. The route identity is plate + driver + pickup + drop-off + goods.
  - The trip report reads `route_customer` (`list-trip-papers.ts`, `list-pickup-facts.ts`, `match-trip-facts.ts`) from the "Khách hàng" value of the route fact.
- Totals (`src/app/facts/total-fact-values.ts`):
  - Before: every linked paper adds the fact's money once.
  - After: totals build trips with the same paper loading, pairing and `buildTrips` pipeline as the trip report (`export-trip-report-xlsx-tool.ts`, `pair-trips.ts`, `build-trips.ts`). Each built trip counts once.
  - The value or rate of a trip comes from the fact the trip report chooses for that trip: among the facts linked to its pickup paper (or its drop-off paper when it has no pickup), the one that `matchTripFacts` keeps for the trip's drop-off receiver, then the newest. A fact left out of the trip by the trip-level rule above never gives the trip a value.
  - A per-ton rate uses the built trip's weight once.
  - This applies to every money value, including facts with no company condition.
  - A trip passes the filters when at least one of its papers passes them. Group by month, plate or company uses the trip's date, plate and papers.
  - When no date range is given, the range runs from the earliest to the latest paper date that passes the filters.
  - Do not dedupe by plate and day.
- Migration (schema):
  - For every fact that has `customer_name` and no "Khách hàng" value, insert a text value: name "Khách hàng", match key `khachhang`, text `customer_name`, at the next free position.
  - Delete the `fact_companies` rows with slot `customer`. Change the check to `slot IN ('pickup', 'dropoff')`.
  - Drop the columns `facts.customer_name`, `facts.customer_match_key` and `facts.customer_resolved`.
  - Where two facts now have the same route identity, keep the newest. Copy the values that only the older one has, then delete the older one.
  - Delete all `document_facts` rows. Relink every fact, following `src/bootstrap/relink-facts.ts`.
  - Log one line: `[migration] customer_values_added=<n> facts_merged=<n> facts_relinked=<n>`.
- `save_fact` tool spec (`save-fact-spec.ts`):
  - Remove `customer_company` from `properties` and `required`.
  - Replace `description` with exactly:

    ```text
    Lưu một thông tin cố định do quản lý nêu về một xe, một tài xế hoặc một tuyến (nơi lấy hàng, nơi đổ hàng), ví dụ lương tài xế, cước vận chuyển, chi phí bồi dưỡng, khách hàng, hàng hóa. Thông tin áp dụng cho mọi giấy tờ đã lưu khớp phạm vi. Tên công ty trong điều kiện nơi lấy hàng hoặc nơi đổ hàng khớp khi giấy tờ đã chấp nhận in tên đó ở bất kỳ vai trò nào; giấy tờ có nhiều dòng hàng vẫn được xét. Khi có cả nơi lấy hàng và nơi đổ hàng, giấy tờ in một trong hai tên là đủ. Khách hàng là một giá trị (name "Khách hàng", text là tên khách hàng), không phải phạm vi. Gọi một lần với mọi giá trị. Khi có nơi lấy hàng hoặc nơi đổ hàng, hệ thống tự tìm thông tin đã lưu cùng tuyến, cùng xe và cùng tài xế: nếu có thì cập nhật giá trị của thông tin đó (action "updated"), nếu không thì lưu thông tin mới (action "added"), nếu có nhiều thông tin khớp thì không đổi gì (action "ambiguous"). Cần ít nhất một trong vehicle_plate, driver_member_id, pickup_company, dropoff_company.
    ```

- `total_fact_values` tool spec (`total-fact-values-spec.ts`): replace the sentence `Mỗi giấy tờ tính một lần, theo thông tin cập nhật gần nhất.` with exactly:

  ```text
  Mỗi chuyến tính một lần theo cùng cách ghép phiếu của báo cáo chuyến; nhiều chuyến cùng xe trong cùng ngày vẫn tính riêng, và phiếu lấy cùng phiếu đổ của một chuyến không cộng thêm.
  ```

- Admin prompt `TRIP_FACTS_SECTION` (`src/app/admin-chat/admin-prompt.ts`). Make these exact replacements:
  - Replace `Hệ thống tự quyết: cùng tuyến, cùng xe, cùng tài xế và cùng khách hàng thì cập nhật thông tin cũ; tuyến khác thì lưu thông tin mới và giữ nguyên thông tin cũ.` with:

    ```text
    Hệ thống tự quyết: cùng tuyến, cùng xe và cùng tài xế thì cập nhật thông tin cũ; tuyến khác thì lưu thông tin mới và giữ nguyên thông tin cũ.
    ```

  - Replace the whole bullet that starts `- Phạm vi là biển số xe, tài xế (id lấy từ list_members), nơi lấy hàng, nơi đổ hàng và khách hàng.` with:

    ```text
    - Phạm vi là biển số xe, tài xế (id lấy từ list_members), nơi lấy hàng và nơi đổ hàng. Chỉ điền phần quản lý nêu, phần khác để null. Khách hàng quản lý nêu ("khách hàng là …") là một giá trị: thêm vào values một mục name "Khách hàng", text là tên khách hàng, bỏ chữ "công ty" hoặc "cty" đứng trước tên. Khách hàng không bao giờ là phạm vi.
    ```

  - Replace the whole bullet that starts `- Khi có nơi lấy hàng, thông tin áp dụng cho phiếu mà nơi lấy hàng là đầu lấy hàng` with:

    ```text
    - Khi có nơi lấy hàng hoặc nơi đổ hàng, thông tin áp dụng cho mọi giấy tờ đã chấp nhận in tên nơi lấy hàng hoặc tên nơi đổ hàng, ở bất kỳ vị trí nào trên giấy; khi có cả hai, giấy tờ in một trong hai tên là đủ. Khi có giá trị "Hàng hóa", thông tin chỉ áp dụng cho giấy tờ ghi hàng hóa đó, kể cả trong các dòng hàng, và cùng tuyến nhưng khác hàng hóa là một thông tin riêng. Thông tin về tuyến áp dụng cho cả biên bản giao nhận nhiều dòng hàng, nhưng không áp dụng cho tin nhắn chữ hay dòng của bảng tính. Với tên công ty, bỏ chữ "công ty" hoặc "cty" đứng trước tên.
    ```

  - Replace `pickup_company_matched, dropoff_company_matched và customer_company_matched` with `pickup_company_matched và dropoff_company_matched`.
  - Replace `Tin nhắn đổi nơi lấy hàng, nơi đổ hàng hoặc khách hàng của thông tin đó vẫn trả lời như trên` with `Tin nhắn đổi nơi lấy hàng hoặc nơi đổ hàng của thông tin đó vẫn trả lời như trên`.
- Remove `customer_company_matched` from the `save_fact` and `update_fact` results.
- `correct_document` keeps its `company_slot` value `customer`, because it changes one paper and not a fact.

### Tests, in order

1. Backend (integration): A pickup company printed as supplier links the fact.

   - Setup: A route fact with pickup company "Alpha" and the goods value "Đá". An accepted dispatch weigh ticket with goods line "Đá" whose only party is "Alpha", role `supplier`.
   - Input: Link the fact to matching papers.
   - Expected: The ticket is linked to the fact.

2. Backend (integration): A pickup company that issued a receipt-stage ticket links the fact.

   - Setup: A route fact with pickup company "Alpha" and no goods value. An accepted receipt-stage weigh ticket whose issuer is "Alpha".
   - Input: Link the fact to matching papers.
   - Expected: The ticket is linked to the fact.

3. Backend (integration): A handover record with item lines links the fact.

   - Setup: A route fact with pickup company "Alpha" and the goods value "Đá". An accepted handover record that prints "Alpha" as issuer and lists "Đá" as the item of one line.
   - Input: Link the fact to matching papers.
   - Expected: The record is linked to the fact.

4. Backend (integration): A paper without the pickup company does not link.

   - Setup: A route fact with pickup company "Alpha". An accepted dispatch weigh ticket whose only party is "Beta".
   - Input: Link the fact to matching papers.
   - Expected: No link is created.

5. Backend (integration): A text message that names the pickup company does not link.

   - Setup: A route fact with pickup company "Alpha". An accepted paper of kind "tin nhắn" that prints "Alpha".
   - Input: Link the fact to matching papers.
   - Expected: No link is created.

6. Backend (integration): A fact with a pickup and a drop-off links a paper that prints only the pickup.

   - Setup: A route fact with pickup "Alpha" and drop-off "Beta". An accepted dispatch ticket that prints "Alpha" and not "Beta".
   - Input: Link the fact to matching papers.
   - Expected: The ticket is linked.

7. Backend (integration): The trip report shows the drop-off of a fact with a pickup and a drop-off.

   - Setup: A route fact with pickup "Alpha" and drop-off "Beta". An accepted dispatch ticket that prints "Alpha" and not "Beta", linked to the fact.
   - Input: List the trip papers for that ticket's day.
   - Expected: The ticket's route drop-off is "Beta".

8. Backend (integration): A drop-off-only fact does not link a paper without the drop-off company.

   - Setup: A fact with only drop-off "Beta" and wage 600000 đ. An accepted receipt ticket whose only party is "Gamma".
   - Input: Link the fact to matching papers.
   - Expected: No link is created.

9. Backend (integration): A drop-off-only fact links a paper that prints the drop-off company.

   - Setup: A fact with only drop-off "Beta" and wage 600000 đ. An accepted receipt ticket whose only party is "Beta", role `customer`.
   - Input: Link the fact to matching papers.
   - Expected: The ticket is linked.

10. Backend (integration): A customer named by the admin is a value, not a condition.

    - Setup: An accepted dispatch weigh ticket that prints "Alpha" as issuer and has no customer party.
    - Input: Save a fact with pickup "Alpha" and the text value "Khách hàng" = "Gamma".
    - Expected: The ticket is linked to the fact.

11. Backend (integration): A two-word goods condition does not link goods that hold only its long word.

    - Setup: A route fact with pickup "Alpha" and the goods value "Than đá". An accepted ticket that prints "Alpha" with goods line "Than cám".
    - Input: Link the fact to matching papers.
    - Expected: No link is created.

12. Backend (integration): A two-word goods condition links goods that hold both words.

    - Setup: A route fact with pickup "Alpha" and the goods value "Than đá". An accepted ticket that prints "Alpha" with goods line "Than đá loại 1".
    - Input: Link the fact to matching papers.
    - Expected: The ticket is linked.

13. Backend (integration): A short goods word does not match as a prefix.

    - Setup: A route fact with pickup "Alpha" and the goods value "Cá". An accepted ticket that prints "Alpha" with goods line "Cát".
    - Input: Link the fact to matching papers.
    - Expected: No link is created.

14. Backend (integration): A goods word of four or more letters matches as a prefix.

    - Setup: A route fact with pickup "Alpha" and the goods value "Clinke". An accepted ticket that prints "Alpha" with goods line "Clinker".
    - Input: Link the fact to matching papers.
    - Expected: The ticket is linked.

15. Backend (integration): A pickup paper and a drop-off paper of one built trip add the wage once.

    - Setup: A route fact with pickup "Alpha" and wage 700000 đ. An accepted dispatch ticket that prints "Alpha", plate 51C12345, 27000 kg. An accepted receipt ticket that prints "Alpha" as supplier, plate 51C12345, 26950 kg, the next day. Both are linked to the fact.
    - Input: Total the value "Lương tài xế" over those two days.
    - Expected: The sum is 700000 đ.

16. Backend (integration): Two trips of one truck on one day add the wage twice.

    - Setup: A route fact with pickup "Alpha" and wage 700000 đ. Plate 51C12345 has two dispatch tickets that print "Alpha" on one day, at 07:00 with 27000 kg and at 13:00 with 25000 kg. Each has a receipt ticket the same day, at 10:00 with 26980 kg and at 16:00 with 24990 kg. All four are linked.
    - Input: Total the value "Lương tài xế" for that day.
    - Expected: The sum is 1400000 đ.

17. Backend (integration): A per-ton rate uses each built trip's weight once.

    - Setup: A route fact with pickup "Alpha" and rate 150000 đ/tấn. One built trip from a dispatch ticket of 27000 kg and a receipt ticket of 26950 kg, both linked.
    - Input: Total the value "Cước vận chuyển" for that trip's days.
    - Expected: The amount is 4050000 đ.

18. Backend (integration): The migration turns a customer condition into a value.

    - Setup: Before the migration, a fact with pickup "Alpha", customer "Gamma" and no "Khách hàng" value.
    - Input: Run the migration.
    - Expected: The fact has the text value "Khách hàng" = "Gamma".

19. Backend (integration): The migration merges two facts that differed only by customer.

    - Setup: Before the migration, two facts with pickup "Alpha" and customers "Gamma" and "Delta". The newer one has wage 700000 đ, the older one rate 150000 đ/tấn.
    - Input: Run the migration.
    - Expected: One fact remains, with wage 700000 đ, rate 150000 đ/tấn and "Khách hàng" = "Gamma".

20. Backend (integration): A fact with a pickup and a drop-off links a paper that prints only the drop-off.

    - Setup: A route fact with pickup "Alpha", drop-off "Beta" and the goods value "Đá". An accepted receipt ticket with goods line "Đá" whose only party is "Beta", role `issuer`.
    - Input: Link the fact to matching papers.
    - Expected: The ticket is linked.

21. Backend (integration): A Gamma pickup trip gets the Gamma wage when an Alpha fact also links its drop-off paper.

    - Setup: Fact A with pickup "Alpha", drop-off "Beta" and wage 700000 đ. Fact G with pickup "Gamma", drop-off "Beta" and wage 600000 đ, saved before fact A. One trip of plate 51C12345: a dispatch ticket that prints only "Gamma", 27000 kg, and a receipt ticket that prints only "Beta", 26950 kg, the next day. The receipt links both facts; the dispatch ticket links fact G.
    - Input: Total the value "Lương tài xế" over those two days.
    - Expected: The sum is 600000.

22. Backend (integration): An Alpha pickup trip gets the Alpha wage.

    - Setup: Fact A with pickup "Alpha", drop-off "Beta" and wage 700000 đ. Fact G with pickup "Gamma", drop-off "Beta" and wage 600000 đ. One trip of plate 51C12345: a dispatch ticket that prints only "Alpha", 27000 kg, and a receipt ticket that prints only "Beta", 26950 kg, the next day. The receipt links both facts; the dispatch ticket links fact A.
    - Input: Total the value "Lương tài xế" over those two days.
    - Expected: The sum is 700000.

23. Backend (integration): A receipt-only trip keeps the newest fact.

    - Setup: Fact A with pickup "Alpha", drop-off "Beta" and wage 700000 đ, saved after fact G. Fact G with pickup "Gamma", drop-off "Beta" and wage 600000 đ. One trip of plate 51C12345 with only a receipt ticket that prints only "Beta", which links both facts.
    - Input: Total the value "Lương tài xế" for that day.
    - Expected: The sum is 700000.

24. Backend (integration): A Gamma pickup trip with only an Alpha fact gets no wage.

    - Setup: Fact A with pickup "Alpha", drop-off "Beta" and wage 700000 đ, and no other fact. One trip of plate 51C12345: a dispatch ticket that prints only "Gamma", 27000 kg, and a receipt ticket that prints only "Beta", 26950 kg, the next day. Only the receipt links fact A.
    - Input: Total the value "Lương tài xế" over those two days.
    - Expected: The sum is 0.

## Revert cost

The customer columns are gone. A revert must add them back empty. The old customer conditions stay as "Khách hàng" values.

## Production manual test

> Needs a human test: the agent cannot send a Zalo message as an admin. A person performs step 4.

- Read the Render deploy log. It has the line `[migration] customer_values_added=… facts_merged=… facts_relinked=…` and no error.
- Find the workspace with this read-only query through `ssh render_personal`: `SELECT id FROM workspaces;`. Then run `SELECT f.id, count(df.document_id) FROM facts f LEFT JOIN document_facts df ON df.fact_id = f.id WHERE f.workspace_id = '<workspace id>' AND (f.pickup_match_key IS NOT NULL OR f.dropoff_match_key IS NOT NULL) GROUP BY f.id;`. Every route fact shows a count above 0.
- Run `SELECT d.kind, count(*) FROM document_facts df JOIN documents d ON d.id = df.document_id WHERE df.workspace_id = '<workspace id>' GROUP BY d.kind;`. Handover record kinds are in the list.
- A person, as the admin, sends in the admin chat: "thông tin tuyến lấy hàng ở `<pickup company>` áp dụng cho bao nhiêu giấy tờ?".
- Find that message and the reply. Get the admin's id with `SELECT user_id FROM memberships WHERE workspace_id = '<workspace id>' AND role = 'admin';`. Run `SELECT id, created_at FROM messages WHERE workspace_id = '<workspace id>' AND user_id = '<admin id>' AND author = 'user' ORDER BY created_at DESC LIMIT 1;`, then `SELECT text FROM messages WHERE workspace_id = '<workspace id>' AND user_id = '<admin id>' AND author = 'bot' AND created_at > '<that created_at>' ORDER BY created_at LIMIT 1;`. The reply names the route fact and a count above 0.
