# PR 2 of 12 — Standing facts become company knowledge entries with fixed outcomes

Depends on: PR 1 of 12, "A route fact matches every paper that prints its company". That PR removed the customer condition and set the matching rules. This PR keeps those rules, and the Matching section below restates them in full.

## Done when

- Each standing fact is one row in `company_knowledge_entries`. The row holds its conditions (goods, pickup, drop-off, plate, driver) and its outcomes (customer, drop-off, wage, rate per ton, allowance, note) as fixed columns.
- The old fact tables and the `save_fact` / `list_facts` / `update_fact` / `delete_fact` / `total_fact_values` tools are gone. The admin uses the `*_company_knowledge` tools.
- The paper export has fixed columns "Khách hàng", "Nơi đổ hàng", "Lương tài xế", "Cước vận chuyển (đ/tấn)" and "Chi phí bồi dưỡng". Each column shows only when at least one row has a value.
- For the same papers, the trip report and totals give the same numbers as before the migration.
- A correction of one paper still changes only that paper.

## Before / After

Before: A wage is the row "Lương tài xế = 700000 đ" in `fact_values`. Admin chat, the paper export and the trip report find it by its name.

After: The wage is `then_wage_vnd = 700000` on the entry. The admin says "lương tuyến `<pickup company>` là 700k". The bot calls `save_company_knowledge` with `when_pickup_company` and `then_wage_vnd`. The paper export shows the column "Lương tài xế".

## Solution

### Schema

- New table `company_knowledge_entries`: one row is one thing the admin taught the company, with its conditions and outcomes.
  - `id` uuid, not null, primary key, default `gen_random_uuid()`.
  - `workspace_id` uuid, not null, foreign key to `workspaces.id`, delete cascades.
  - `author_user_id` uuid, null, foreign key to `users.id`, delete sets null.
  - `statement` text, not null, check `btrim(statement) <> '' AND char_length(statement) <= 2000`.
  - `when_goods` text, null, check `when_goods IS NULL OR char_length(btrim(when_goods)) BETWEEN 1 AND 200`.
  - `when_vehicle_plate` text, null, check `when_vehicle_plate ~ '^\d{2}[A-Z]\d{3,5}$'`.
  - `when_driver_user_id` uuid, null. Foreign key (`workspace_id`, `when_driver_user_id`) to `memberships` (`workspace_id`, `user_id`), delete cascades.
  - `when_pickup_name` text, null. `when_pickup_match_key` text, null, check `~ '^[a-z0-9]+$'`. Check `(when_pickup_name IS NULL) = (when_pickup_match_key IS NULL)`.
  - `when_pickup_resolved` boolean, not null, default false.
  - `when_dropoff_name` text, null. `when_dropoff_match_key` text, null, check `~ '^[a-z0-9]+$'`. Check `(when_dropoff_name IS NULL) = (when_dropoff_match_key IS NULL)`.
  - `when_dropoff_resolved` boolean, not null, default false.
  - `then_customer` text, null, check `then_customer IS NULL OR char_length(btrim(then_customer)) BETWEEN 1 AND 200`.
  - `then_dropoff` text, null, check `then_dropoff IS NULL OR char_length(btrim(then_dropoff)) BETWEEN 1 AND 200`.
  - `then_wage_vnd` numeric, null, check `then_wage_vnd >= 0`.
  - `then_rate_vnd_per_ton` numeric, null, check `then_rate_vnd_per_ton >= 0`.
  - `then_allowance_vnd` numeric, null, check `then_allowance_vnd >= 0`.
  - `then_note` text, null, check `then_note IS NULL OR char_length(btrim(then_note)) BETWEEN 1 AND 2000`.
  - `created_at` timestamptz, not null, default now(). `updated_at` timestamptz, not null, default now().
  - Check that at least one condition is set: `when_goods IS NOT NULL OR when_vehicle_plate IS NOT NULL OR when_driver_user_id IS NOT NULL OR when_pickup_match_key IS NOT NULL OR when_dropoff_match_key IS NOT NULL`.
  - Check that at least one outcome is set: `then_customer IS NOT NULL OR then_dropoff IS NOT NULL OR then_wage_vnd IS NOT NULL OR then_rate_vnd_per_ton IS NOT NULL OR then_allowance_vnd IS NOT NULL OR then_note IS NOT NULL`.
  - Unique index on (`id`, `workspace_id`). Index on (`workspace_id`, `when_vehicle_plate`), not unique. Index on (`workspace_id`, `when_pickup_match_key`), not unique.
  - Row-level security: the same `in_scope` policy as `facts` today (workspace set, owner not set).
- New table `company_knowledge_companies`: one row is one saved company that a pickup or drop-off condition was tied to, after the admin picked it from several names.
  - `id` uuid, not null, primary key, default `gen_random_uuid()`.
  - `workspace_id` uuid, not null.
  - `entry_id` uuid, not null. Foreign key (`entry_id`, `workspace_id`) to `company_knowledge_entries` (`id`, `workspace_id`), delete cascades.
  - `slot` text, not null, check `slot IN ('pickup', 'dropoff')`.
  - `organization_id` uuid, not null. Foreign key (`organization_id`, `workspace_id`) to `organizations` (`id`, `workspace_id`), delete restricted.
  - `created_at` timestamptz, not null, default now().
  - Unique index on (`entry_id`, `slot`, `organization_id`). Index on (`workspace_id`, `organization_id`), not unique.
  - The same row-level security policy.
- New table `company_knowledge_links`: one row says one entry applies to one paper.
  - `workspace_id` uuid, not null.
  - `document_id` uuid, not null. Foreign key (`document_id`, `workspace_id`) to `documents` (`id`, `workspace_id`), delete cascades.
  - `entry_id` uuid, not null. Foreign key (`entry_id`, `workspace_id`) to `company_knowledge_entries` (`id`, `workspace_id`), delete cascades.
  - `created_at` timestamptz, not null, default now().
  - Primary key (`document_id`, `entry_id`). Index on (`entry_id`), not unique.
  - The same row-level security policy.

### Migration (one forward migration)

- Each `facts` row becomes one entry, with the same `id`, author, statement and timestamps.
  - `vehicle_plate` → `when_vehicle_plate`. `driver_user_id` → `when_driver_user_id`.
  - Pickup name, key and resolved flag → `when_pickup_*`.
  - Drop-off: when the fact has a pickup, `dropoff_name` → `then_dropoff`. When it has no pickup, the drop-off name, key and resolved flag → `when_dropoff_*`.
  - Each `fact_companies` row → `company_knowledge_companies`, with the same slot, but only for the drop-off slot when the drop-off became a condition.
  - Fact values, by match key:
    - `hanghoa` (text) → `when_goods`.
    - `khachhang` (text) → `then_customer`.
    - `luongtaixe` (number, unit "đ") → `then_wage_vnd`.
    - `cuocvanchuyen` (number, unit "đ/tấn") → `then_rate_vnd_per_ton`.
    - `chiphiboiduong` (number, unit "đ") → `then_allowance_vnd`.
    - Any other value → one line `<name>: <text>` or `<name>: <number> <unit>` in `then_note`, in value position order. This keeps the driver plate value "Biển số xe: …".
  - A fact that ends up with no outcome gets `then_note` = its statement.
- After all entries are inserted, link every entry to matching papers, using the matching rules below.
- Drop `document_facts`, `fact_companies`, `fact_values` and `facts`.
- Log one line: `[migration] facts_moved=<n> entries_inserted=<n> notes_from_values=<n> papers_linked=<n>`.

### Matching (`src/app/facts/link-facts.ts` moves to the new tables)

- A paper can link when it is accepted, its kind is not "tin nhắn", and its `sheet_signature` is null. Item lines do not exclude a paper.
- Plate, driver and goods conditions must all hold. The driver condition keeps the fallback in which the driver sent a source message.
- The goods condition matches a no-item "Hàng hóa" line or the `item` text of any line. Normalize both sides: no accents, lower case, split on anything that is not a letter or digit.
  - Every condition token must be found in the same goods text.
  - A condition token of 4 or more characters matches a goods token that is equal to it, or when one of the two starts with the other and the shorter one has 4 or more characters.
  - A condition token under 4 characters matches only an equal token.
- When the entry has a pickup or drop-off condition, the paper must print at least one of those companies, in any party role. The company matches by match key, by alias, or by company pick when the slot is resolved.
- Customer never limits a match.
- When several linked entries give the same outcome for one paper, the entry with the newest `updated_at` wins, then the larger `id`.

### Tools

Remove `save_fact`, `list_facts`, `update_fact`, `delete_fact` and `total_fact_values` and their files. Add the five tools below. Each spec uses the standard strict object wrapper. Every listed property is required. Nullable text uses `['string','null']`, nullable numbers use `['number','null']`.

```text
save_company_knowledge
description: "Lưu một kiến thức lâu dài của công ty với điều kiện when và kết quả then. Điều kiện có thể gồm hàng hóa, nơi lấy hàng, nơi đổ hàng, biển số và tài xế. Kết quả có thể gồm khách hàng, nơi đổ hàng, lương tài xế, cước vận chuyển theo tấn, chi phí bồi dưỡng và ghi chú. Tên công ty trong điều kiện nơi lấy hàng hoặc nơi đổ hàng khớp khi giấy tờ đã chấp nhận in ít nhất một tên đó ở bất kỳ vai trò nào; giấy tờ có nhiều dòng hàng vẫn được xét. Khách hàng và nơi đổ hàng là kết quả thì chỉ đặt trong then. Nếu đã có mục cùng mọi điều kiện when, công cụ cập nhật kết quả của mục đó (action "updated"); nếu không thì lưu mục mới (action "added"); nếu có nhiều mục có thể khớp thì không đổi gì (action "ambiguous"). Lưu xong trả về số giấy tờ khớp. Cần ít nhất một điều kiện when. Tối đa 100 mục mỗi nhóm."
statement: "Nguyên văn câu quản lý viết, tối đa 2000 ký tự."
entry_id: "Chỉ dùng sau khi save_company_knowledge trả về action \"ambiguous\" và quản lý đã chọn một mục: entry_id của mục đó. Còn lại để null."
when_goods: "Tên hàng hóa làm điều kiện, như quản lý viết. null nếu không dùng điều kiện hàng hóa."
when_pickup_company: "Tên công ty hoặc nơi lấy hàng làm điều kiện, bỏ chữ công ty hoặc cty đứng trước. null nếu không dùng."
when_dropoff_company: "Tên công ty hoặc nơi đổ hàng làm điều kiện, bỏ chữ công ty hoặc cty đứng trước. Chỉ dùng khi quản lý không nêu nơi lấy hàng; khi có nơi lấy hàng, nơi đổ hàng là then_dropoff. null nếu không dùng."
when_vehicle_plate: "Biển số xe làm điều kiện, theo định dạng Việt Nam, ví dụ 93C04939. null nếu không dùng."
when_driver_member_id: "id tài xế lấy từ list_members. null nếu không dùng."
then_customer: "Tên khách hàng là kết quả áp dụng. null nếu không nêu."
then_dropoff: "Tên nơi đổ hàng là kết quả áp dụng. null nếu không nêu."
then_wage_vnd: "Lương tài xế cho một chuyến, đơn vị đồng. null nếu không nêu."
then_rate_vnd_per_ton: "Cước vận chuyển cho một tấn, đơn vị đồng mỗi tấn. null nếu không nêu."
then_allowance_vnd: "Chi phí bồi dưỡng cho một chuyến, đơn vị đồng. null nếu không nêu."
then_note: "Ghi chú lâu dài khác của công ty, chép đúng ý quản lý. null nếu không có."

list_company_knowledge
description: "Liệt kê kiến thức công ty đã lưu, cũ nhất trước. Mỗi mục có entry_id, câu quản lý viết, when, then, người lưu và số giấy tờ đang khớp."
parameters: no properties.

update_company_knowledge
description: "Thay toàn bộ when và then của một kiến thức công ty theo entry_id từ list_company_knowledge. Giá trị không còn đúng phải truyền null; không giữ ngầm giá trị cũ. Tính lại giấy tờ khớp và trả về số giấy tờ khớp. Nếu sau khi đổi trùng mọi điều kiện when với một mục khác, công cụ không đổi gì và trả về other_entry_id."
entry_id: "id của kiến thức cần thay, lấy từ list_company_knowledge."
statement, when_goods, when_pickup_company, when_dropoff_company, when_vehicle_plate, when_driver_member_id, then_customer, then_dropoff, then_wage_vnd, then_rate_vnd_per_ton, then_allowance_vnd, then_note: exactly the descriptions from save_company_knowledge.

delete_company_knowledge
description: "Xóa hẳn một kiến thức công ty theo entry_id từ list_company_knowledge. Giấy tờ đã lưu vẫn giữ nguyên dữ liệu đọc từ giấy. Không hoàn tác được."
entry_id: "id của kiến thức cần xóa, lấy từ list_company_knowledge."

total_company_knowledge
description: "Tính tổng một kết quả số trong kiến thức công ty trên các giấy tờ đã chấp nhận và phù hợp, với cùng bộ lọc và cách chia nhóm như total_document_numbers. Lương tài xế và Chi phí bồi dưỡng là số tiền mỗi chuyến. Cước vận chuyển là giá mỗi tấn, nhân với trọng lượng hàng của từng chuyến (kg chia 1000). Mỗi chuyến tính một lần theo cùng cách ghép phiếu của báo cáo chuyến; nhiều chuyến cùng xe trong cùng ngày vẫn tính riêng, và phiếu lấy cùng phiếu đổ của một chuyến không cộng thêm. review_documents đếm giấy tờ đang chờ xem lại."
value_name enum: ['Lương tài xế', 'Cước vận chuyển', 'Chi phí bồi dưỡng']
value_name description: "Kết quả kiến thức công ty cần tính."
All other properties: exactly the existing total_fact_values property schemas and descriptions.
```

- Save behavior: on `"updated"`, each non-null `then_*` replaces the old value and each null keeps it. The result keeps today's fields: `changes` (before → after), `linked_documents`, `pickup_company_matched`, `dropoff_company_matched`, the company-pick refusal when several companies match a name, and `candidates` on `"ambiguous"`.
- Totals (`total_company_knowledge`) keep the trip-based totals of `total_fact_values`:
  - Build trips with the same paper loading, pairing and `buildTrips` pipeline as the trip report. Each built trip counts once.
  - The winning value or rate of a trip comes from the entries linked to its pickup paper, or to its drop-off paper when it has no pickup.
  - A per-ton rate uses the built trip's weight once.
  - This applies to every money outcome, including entries with no company condition.
  - A trip passes the filters when at least one of its papers passes them. Group by month, plate or company uses the trip's date, plate and papers.
  - With no date range, the range runs from the earliest to the latest paper date that passes the filters.
  - Do not dedupe by plate and day.
- `rewrite_member_plate` (`set-driver-plate-fact.ts`): before, it writes the fact value "Biển số xe". After, it sets `then_note` to `Biển số xe: <plate>` on the entry whose only condition is that driver, and creates that entry when none exists.
- `split_merged_name`: rename the result field `facts_to_resolve_again` to `entries_to_resolve_again`. It counts entries whose company picks used the split company.
- Ability lines (`ability-section.ts`): remove the lines for `save_fact`, `list_facts`, `update_fact`, `delete_fact` and `total_fact_values`. Add exactly:

  ```text
  save_company_knowledge: 'Lưu kiến thức lâu dài của công ty với điều kiện áp dụng và kết quả.'
  list_company_knowledge: 'Cho biết kiến thức công ty đã lưu và số giấy tờ đang khớp.'
  update_company_knowledge: 'Sửa điều kiện hoặc kết quả của một kiến thức công ty đã lưu.'
  delete_company_knowledge: 'Xóa một kiến thức công ty đã lưu; giấy tờ vẫn giữ nguyên.'
  total_company_knowledge: 'Cộng lương, cước vận chuyển hoặc chi phí bồi dưỡng từ kiến thức công ty theo xe, công ty, ngày hoặc tháng.'
  ```

- `admin-text-guard.ts`: replace `list_facts` with `list_company_knowledge` in `ADMIN_TEXT_TOOLS`.

### Consumers

- Every caller that links papers after a write: `insert-document.ts`, `store-documents.ts`, `correct-paper.ts`, `update-paper-from-draft.ts`, `save-sheet-drafts.ts` and `src/bootstrap/relink-facts.ts`. Each one links to entries instead of facts.
- `list_documents` and the quoted papers (`list-documents.ts`, `load-quoted-papers.ts`, `format-quoted-papers.ts`):
  - Before: `fact_values` lists named values.
  - After: `company_knowledge` lists the winning outcomes by fixed name: "Khách hàng", "Nơi đổ hàng", "Lương tài xế", "Cước vận chuyển", "Chi phí bồi dưỡng", "Ghi chú". The section title in `format-quoted-papers.ts` changes from `Giá trị từ thông tin cố định` to `Kiến thức công ty áp dụng`.
- Paper export (`build-documents-workbook.ts`, `export-documents-xlsx-tool.ts`):
  - Before: one dynamic column per fact value name.
  - After: fixed columns "Khách hàng", "Nơi đổ hàng", "Lương tài xế", "Cước vận chuyển (đ/tấn)" and "Chi phí bồi dưỡng". A column shows only when at least one row has a value.
- Paper export spec: replace the `export_documents_xlsx` description with exactly:

  ```text
  Xuất danh sách giấy tờ đã chấp nhận phù hợp với bộ lọc ra file Excel (.xlsx). Mỗi dòng có dữ liệu giấy tờ và các kết quả kiến thức công ty đang áp dụng. Khi công cụ trả về ok, nhắn một câu tiếng Việt kèm đường dẫn và số lượng giấy tờ, ghi rõ "link có hiệu lực 24 giờ". Khi công cụ trả về no_matches, nói "<described_filter> không có giấy tờ nào, chưa tạo file Excel." Không dán nội dung giấy tờ vào tin nhắn.
  ```

- Trip report (`list-trip-papers.ts`, `list-pickup-facts.ts`, `match-trip-facts.ts`, `export-trip-report-xlsx-tool.ts`):
  - The route pickup comes from `when_pickup_name`, the route drop-off from `then_dropoff` (or from `when_dropoff_name` when there is no pickup), and the customer from `then_customer`.
  - Choosing between entries by the trip's drop-off receiver (`matchDropOffNames`) keeps working, on the route drop-off above.
  - Value columns read the fixed outcomes.
- `export_trip_report_xlsx` spec (`export-trip-report-xlsx-spec.ts`): the `source` enum becomes `['field', 'knowledge_value', 'knowledge_amount', 'none']`. Exact descriptions:

  ```text
  source description: "field: một trường cố định của giấy tờ. knowledge_value: một kết quả trong kiến thức công ty. knowledge_amount: tiền cước = cước đồng mỗi tấn × trọng lượng kg / 1000. none: không có nguồn phù hợp."
  value_name description: "Khi source là knowledge_value hoặc knowledge_amount: một trong Khách hàng, Nơi đổ hàng, Lương tài xế, Cước vận chuyển, Chi phí bồi dưỡng, Ghi chú. knowledge_amount chỉ dùng với Cước vận chuyển. Nếu không thì null."
  ```

  In the spec `description`, replace `thông tin chuyến đã lưu` with `kiến thức công ty` at every place it appears.

### Admin prompt (`src/app/admin-chat/admin-prompt.ts`)

- Replace the whole `TRIP_FACTS_SECTION` with exactly:

  ```text
  Kiến thức công ty:
  - Kiến thức công ty là thông tin lâu dài quản lý dạy Trợ lý. Mỗi mục có điều kiện when: hàng hóa, nơi lấy hàng, nơi đổ hàng, biển số, tài xế; và kết quả then: khách hàng, nơi đổ hàng, lương tài xế, cước vận chuyển theo tấn, chi phí bồi dưỡng, ghi chú.
  - Khi quản lý nêu một thông tin lâu dài về một xe, một tài xế, một tuyến hoặc một hàng hóa, có số tiền hoặc bên liên quan đúng cho mọi chuyến, gọi save_company_knowledge một lần với mọi điều kiện và kết quả quản lý nêu. Không chia thành nhiều add_member_fact. add_member_fact chỉ dùng cho gợi ý đọc giấy tờ về một tài xế, ví dụ cách người đó hay ghi giấy tờ.
  - Ngoại lệ: tin nhắn nói về đúng một giấy tờ ("của phiếu này", "của giấy này", ảnh vừa gửi, hoặc số của một giấy tờ) là lệnh sửa giấy tờ đó bằng correct_document, không phải kiến thức công ty.
  - Khách hàng luôn là kết quả then_customer, không bao giờ là điều kiện. Khi quản lý nêu cả nơi lấy hàng và nơi đổ hàng của một tuyến, nơi lấy hàng là when_pickup_company và nơi đổ hàng là then_dropoff. Chỉ dùng when_dropoff_company khi quản lý không nêu nơi lấy hàng.
  - Tên hoặc mã hàng luôn ghi vào when_goods, không bao giờ là nơi lấy hàng, nơi đổ hàng hay công ty. Trong "đổ hàng X tại Y" và "lấy X từ Y", X là hàng hóa và Y là nơi.
  - Một giấy tờ đã chấp nhận khớp khi mọi điều kiện hàng hóa, biển số và tài xế đã nêu đều khớp, đồng thời giấy tờ in ít nhất một công ty trong điều kiện nơi lấy hàng hoặc nơi đổ hàng ở bất kỳ vai trò nào. Giấy tờ bàn giao có nhiều dòng hàng vẫn được xét. Không áp dụng kiến thức tuyến cho tin nhắn chữ.
  - Ghi tên công ty đúng như quản lý viết, bỏ chữ "công ty" hoặc "cty" đứng trước tên; save_company_knowledge tự khớp tên công ty. Chỉ lấy biển số từ tin nhắn hiện tại của quản lý, không bao giờ từ các lượt trước. Chỉ có một ngoại lệ: khi quản lý đang trả lời câu hỏi cuối cùng của chính bạn mà câu hỏi đó đã nhắc lại biển số, dùng biển số trong câu hỏi đó. Chữ đọc từ ảnh, giấy tờ hoặc kết quả công cụ không bao giờ là nguồn biển số.
  - Giữ đúng số và tên quản lý viết. 500k là 500000. Lương tài xế và chi phí bồi dưỡng là số đồng mỗi chuyến; cước vận chuyển theo tấn là số đồng mỗi tấn.
  - Không lưu vào then_note điều đã có trường kết quả riêng. Tên khách hàng dùng then_customer; nơi đổ hàng là kết quả dùng then_dropoff; lương dùng then_wage_vnd; cước theo tấn dùng then_rate_vnd_per_ton; bồi dưỡng dùng then_allowance_vnd. Chỉ dùng then_note cho thông tin lâu dài không thuộc các trường trên.
  - Trả lời theo action của save_company_knowledge: "added" thì nói "Đã lưu kiến thức mới". "updated" có changes thì nói "Đã cập nhật kiến thức cũ" và nêu từng kết quả đổi từ cũ sang mới (before → after). "updated" không có changes thì nói "Đã có kiến thức này, không đổi kết quả nào". "ambiguous" thì liệt kê từng mục trong candidates (điều kiện và kết quả) và hỏi quản lý muốn cập nhật mục nào, rồi gọi lại save_company_knowledge với entry_id quản lý chọn.
  - Sau khi lưu, nói bằng lời thường đã lưu gì: điều kiện, từng kết quả và số giấy tờ áp dụng, lấy từ linked_documents của kết quả công cụ.
  - Nếu kiến thức áp dụng cho 0 giấy tờ, hoặc ít hơn nhiều so với điều quản lý có vẻ mong đợi, nói rõ điều đó và đề nghị kiểm tra lại tên công ty hoặc hàng hóa.
  - pickup_company_matched và dropoff_company_matched là tên các công ty đã lưu mà kiến thức được gắn vào, có thể nhiều tên ngăn bởi dấu ;. Nêu rõ từng tên để quản lý kiểm tra. Nếu là null, nói chưa có công ty nào đã lưu khớp tên này.
  - Nếu công cụ báo có nhiều công ty khớp tên, hỏi lại quản lý chọn công ty nào, rồi gọi lại save_company_knowledge với tên công ty đó chép đúng như công cụ đã liệt kê, giữ cả chữ "công ty" nếu có.
  - Khi quản lý hỏi đã lưu gì về một xe, một tài xế, một tuyến hoặc một hàng hóa, gọi list_company_knowledge. Nêu điều kiện, từng kết quả và "áp dụng cho N giấy tờ". Nếu không có mục nào, trả lời rõ là chưa lưu kiến thức nào cho xe, tài xế, tuyến hoặc hàng hóa đó.
  - Khi sửa một mục, gọi list_company_knowledge để lấy đúng entry_id rồi gọi update_company_knowledge với toàn bộ when và then mới; giá trị không còn đúng truyền null. Nếu có hơn một mục có thể khớp, hỏi lại quản lý muốn sửa mục nào và nêu điều kiện của từng mục. Nếu công cụ trả về other_entry_id, nói rằng sau khi đổi sẽ trùng với một mục đã lưu khác và chưa đổi gì. Sau khi sửa, nêu từng kết quả đã đổi, điều kiện hiện tại và số giấy tờ áp dụng.
  - Khi quản lý muốn xóa một mục, gọi list_company_knowledge để lấy entry_id rồi gọi delete_company_knowledge. Nếu có hơn một mục có thể khớp, hỏi lại quản lý muốn xóa mục nào. Sau khi xóa, nêu điều kiện của mục đã xóa và số giấy tờ nó từng áp dụng (former_linked_documents). Nói rõ giấy tờ vẫn được giữ nguyên.
  - list_documents có thể trả về company_knowledge là các kết quả áp dụng cho giấy tờ. Khi quản lý hỏi giấy tờ kèm lương tài xế, cước, chi phí hoặc khách hàng, nêu đúng các giá trị đó. File từ export_documents_xlsx có các cột kiến thức công ty tương ứng.
  - Để tính tổng lương tài xế, cước vận chuyển hoặc chi phí bồi dưỡng trong kiến thức công ty, dùng total_company_knowledge với cùng bộ lọc và group_by như total_document_numbers; không dùng total_document_numbers cho các kết quả này.
  - Nêu số chuyến (documents) của từng nhóm. Với amounts, nêu tổng (sum) và các mức tiền. Với per_ton, nêu từng mức giá, tổng số tấn (tons) và thành tiền (amount); nếu documents_without_weight lớn hơn 0, nói rõ bấy nhiêu chuyến chưa có trọng lượng hàng nên chưa được tính tiền. Nếu amounts và per_ton đều rỗng, nói rõ chưa có kiến thức nào đã lưu cho kết quả này trên các giấy tờ phù hợp. Nếu review_documents lớn hơn 0, nói rõ.
  ```

- Other exact replacements in the same file:
  - `Gọi list_facts trước để biết tên giá trị.` → `Gọi list_company_knowledge trước để biết các kết quả đã lưu.`
  - `fact_value với tên giá trị đúng như list_facts, ví dụ "Lương chuyến" → "Lương tài xế", "Tiền bồi dưỡng" → "Chi phí bồi dưỡng"; fact_amount với tên giá trị đ/tấn cho tiền cước theo trọng lượng;` → `knowledge_value với một kết quả đúng như list_company_knowledge, ví dụ "Lương chuyến" → "Lương tài xế", "Tiền bồi dưỡng" → "Chi phí bồi dưỡng"; knowledge_amount với Cước vận chuyển cho tiền cước theo trọng lượng;`
  - `Thông tin chuyến đã lưu không đổi giá trị nào trong ba giá trị này.` → `Kiến thức công ty không đổi giá trị nào trong ba giá trị này.`
  - `và với thông tin cố định về xe, tài xế hoặc tuyến thì gọi thêm list_facts` → `và với kiến thức công ty về xe, tài xế, tuyến hoặc hàng hóa thì gọi thêm list_company_knowledge`
  - `Quy tắc tìm trước này không áp dụng khi lưu một thông tin cố định quản lý vừa nêu.` → `Quy tắc tìm trước này không áp dụng khi lưu một kiến thức công ty quản lý vừa nêu.`
  - `Chỉ lưu ghi chú (add_member_fact) hoặc thông tin cố định (save_fact)` → `Chỉ lưu ghi chú (add_member_fact) hoặc kiến thức công ty (save_company_knowledge)`
  - `Thông tin cố định về chuyến có số tiền hoặc bên liên quan thì dùng save_fact (xem phần Thông tin cố định về chuyến).` → `Kiến thức về chuyến có số tiền hoặc bên liên quan thì dùng save_company_knowledge (xem phần Kiến thức công ty).`
  - `Nếu facts_to_resolve_again không rỗng, nói rõ có bấy nhiêu thông tin cố định về chuyến đang dùng công ty vừa tách nên tạm ghép theo tên, và đề nghị quản lý gửi lại các thông tin đó (gọi save_fact) để ghép lại công ty.` → `Nếu entries_to_resolve_again không rỗng, nói rõ có bấy nhiêu kiến thức công ty đang dùng công ty vừa tách nên tạm ghép theo tên, và đề nghị quản lý gửi lại các kiến thức đó (gọi save_company_knowledge) để ghép lại công ty.`
  - In `COMPANY_RULES_SECTION`: `là thông tin cố định về chuyến, không phải quy tắc của công ty: gọi save_fact.` → `là kiến thức công ty, không phải quy tắc của công ty: gọi save_company_knowledge.`
- In `update-fact-tool.ts` error texts (moved to the update tool): `Không tìm thấy thông tin này. Gọi list_facts để lấy đúng id.` → `Không tìm thấy kiến thức này. Gọi list_company_knowledge để lấy đúng entry_id.` The route-change error goes away, because update now replaces every field.
- After this PR, a search of `src` for `save_fact`, `list_facts`, `update_fact`, `delete_fact`, `total_fact_values`, `fact_value` and `document_facts` finds nothing outside migrations.

### Tests, in order

1. Backend (integration): The migration moves a route fact's conditions into the entry.

   - Setup: Before the migration, a fact with pickup "Alpha", drop-off "Beta", and the values "Hàng hóa" = "Đá" and "Lương tài xế" = 700000 đ.
   - Input: Run the migration.
   - Expected: One entry with `when_pickup_name` "Alpha", `when_goods` "Đá" and `when_dropoff_name` null.

2. Backend (integration): The migration moves a route fact's outcomes into fixed columns.

   - Setup: Before the migration, a fact with pickup "Alpha", drop-off "Beta", and the values "Khách hàng" = "Gamma", "Lương tài xế" = 700000 đ, "Cước vận chuyển" = 150000 đ/tấn and "Chi phí bồi dưỡng" = 100000 đ.
   - Input: Run the migration.
   - Expected: The entry has `then_dropoff` "Beta", `then_customer` "Gamma", `then_wage_vnd` 700000, `then_rate_vnd_per_ton` 150000 and `then_allowance_vnd` 100000.

3. Backend (integration): The migration keeps a drop-off-only fact's drop-off as a condition.

   - Setup: Before the migration, a fact with only drop-off "Beta" and the value "Chi phí bồi dưỡng" = 100000 đ.
   - Input: Run the migration.
   - Expected: One entry with `when_dropoff_name` "Beta" and `then_dropoff` null.

4. Backend (integration): The migration keeps an unknown value as a note line.

   - Setup: Before the migration, a fact for one driver with the text value "Biển số xe" = "51C12345".
   - Input: Run the migration.
   - Expected: The entry has `then_note` "Biển số xe: 51C12345".

5. Backend (integration): The migration removes the old fact tables.

   - Setup: Before the migration, one fact with pickup "Alpha" and wage 700000 đ.
   - Input: Run the migration.
   - Expected: The tables `facts`, `fact_values`, `fact_companies` and `document_facts` no longer exist.

6. Backend (integration): An entry links a paper that prints its drop-off condition company in any role.

   - Setup: An entry with only `when_dropoff` "Beta" and `then_allowance_vnd` 100000. An accepted dispatch ticket whose only party is "Beta", role `customer`.
   - Input: Link the entry to matching papers.
   - Expected: The ticket is linked.

7. Backend (integration): An entry with a pickup does not link a paper that prints only its drop-off outcome company.

   - Setup: An entry with `when_pickup` "Alpha", `then_dropoff` "Beta" and `then_wage_vnd` 700000. An accepted receipt ticket whose only party is "Beta".
   - Input: Link the entry to matching papers.
   - Expected: No link.

8. Backend (integration): A two-word goods condition does not link goods that hold only its long word.

   - Setup: An entry with `when_pickup` "Alpha", `when_goods` "Than đá" and `then_wage_vnd` 700000. An accepted ticket that prints "Alpha" with goods line "Than cám".
   - Input: Link the entry to matching papers.
   - Expected: No link.

9. Backend (integration): Saving the same conditions twice updates the entry.

   - Setup: An entry with `when_pickup` "Alpha" and `then_wage_vnd` 600000.
   - Input: Save an entry with `when_pickup` "Alpha" and `then_wage_vnd` 700000.
   - Expected: Action "updated", one entry with wage 700000, and the change 600000 → 700000 in the result.

10. Backend (integration): The paper export shows the fixed outcome columns of the linked entry.

    - Setup: An accepted paper linked to an entry with `when_pickup` "Alpha", `then_customer` "Gamma" and `then_wage_vnd` 700000.
    - Input: Build the paper workbook.
    - Expected: The row has "Khách hàng" = "Gamma" and "Lương tài xế" = 700000.

11. Backend (integration): The paper export leaves out a column with no value.

    - Setup: An accepted paper linked to an entry with `when_pickup` "Alpha" and only `then_wage_vnd` 700000.
    - Input: Build the paper workbook.
    - Expected: There is no "Chi phí bồi dưỡng" column.

12. Backend (integration): The trip report reads the route drop-off from the entry.

    - Setup: One paired trip whose pickup ticket links an entry with `when_pickup` "Alpha", `then_dropoff` "Beta" and `then_wage_vnd` 700000.
    - Input: Build the trip report with the column "Nơi đổ hàng" (field `dropoff_place`).
    - Expected: The cell is "Beta".

13. Backend (integration): The trip report reads the wage from the entry.

    - Setup: One paired trip whose pickup ticket links an entry with `when_pickup` "Alpha" and `then_wage_vnd` 700000.
    - Input: Build the trip report with the column "Lương" (`knowledge_value` "Lương tài xế").
    - Expected: The cell is 700000.

14. Backend (integration): The freight amount is the rate times the trip weight.

    - Setup: One trip of 27000 kg whose pickup ticket links an entry with `when_pickup` "Alpha" and `then_rate_vnd_per_ton` 150000.
    - Input: Build the trip report with a `knowledge_amount` "Cước vận chuyển" column.
    - Expected: The cell is 4050000.

15. Backend (integration): A pickup paper and a drop-off paper of one built trip add the wage once.

    - Setup: An entry with `when_pickup` "Alpha" and `then_wage_vnd` 700000. An accepted dispatch ticket that prints "Alpha", plate 51C12345, 27000 kg. An accepted receipt ticket that prints "Alpha" as supplier, plate 51C12345, 26950 kg, the next day. Both are linked.
    - Input: Total "Lương tài xế" over those two days.
    - Expected: The sum is 700000.

16. Backend (integration): Two trips of one truck on one day add the wage twice.

    - Setup: An entry with `when_pickup` "Alpha" and `then_wage_vnd` 700000. Plate 51C12345 has two dispatch tickets that print "Alpha" on one day, at 07:00 with 27000 kg and at 13:00 with 25000 kg. Each has a receipt ticket the same day, at 10:00 with 26980 kg and at 16:00 with 24990 kg. All four are linked.
    - Input: Total "Lương tài xế" for that day.
    - Expected: The sum is 1400000.

17. Backend (integration): A correction of one paper changes only that paper.

    - Setup: An entry with `when_pickup` "Alpha" and `then_wage_vnd` 700000. Two accepted tickets that print "Alpha" and goods "Đá", both linked.
    - Input: Correct the goods of the first ticket to "Cát" through the existing correction path.
    - Expected: The second ticket still reads "Đá", and the entry still has wage 700000.

18. Backend (integration): A correction recalculates that paper's links.

    - Setup: An entry with `when_pickup` "Alpha", `when_goods` "Đá" and `then_wage_vnd` 700000. One accepted ticket that prints "Alpha" and goods "Đá", linked.
    - Input: Correct the ticket's goods to "Cát" through the existing correction path.
    - Expected: The ticket is no longer linked to the entry.

19. Backend (integration): Rewriting a driver's plate updates that driver's note entry.

    - Setup: An entry whose only condition is driver "Lan", with `then_note` "Biển số xe: 51C12345".
    - Input: Rewrite the plate of "Lan" to 51C67890.
    - Expected: The entry's `then_note` is "Biển số xe: 51C67890".

## Revert cost

The old fact tables are dropped. A revert needs a forward migration that rebuilds them from the entries.

## Production manual test

> Needs a human test: the agent cannot send a Zalo message as an admin. A person performs steps 4 and 6.

- Read the Render deploy log. It has the line `[migration] facts_moved=… entries_inserted=… notes_from_values=… papers_linked=…`, and `facts_moved` equals `entries_inserted`.
- Find the workspace with this read-only query through `ssh render_personal`: `SELECT id FROM workspaces;`. Run `SELECT count(*) FROM company_knowledge_entries WHERE workspace_id = '<workspace id>';` and `SELECT count(DISTINCT document_id) FROM company_knowledge_links WHERE workspace_id = '<workspace id>';`. The counts match the log line.
- Run `SELECT to_regclass('facts'), to_regclass('fact_values'), to_regclass('document_facts');`. All three are null.
- A person, as the admin, asks the admin chat "công ty đã lưu những kiến thức gì?".
- Find the reply. Get the admin's id with `SELECT user_id FROM memberships WHERE workspace_id = '<workspace id>' AND role = 'admin';`. Run `SELECT id, created_at FROM messages WHERE workspace_id = '<workspace id>' AND user_id = '<admin id>' AND author = 'user' ORDER BY created_at DESC LIMIT 1;`, then `SELECT text FROM messages WHERE workspace_id = '<workspace id>' AND user_id = '<admin id>' AND author = 'bot' AND created_at > '<that created_at>' ORDER BY created_at LIMIT 1;`. The reply lists the entries with conditions, outcomes and paper counts.
- A person asks for "xuất danh sách giấy tờ tháng trước" and forwards the link.
- The agent downloads the file and opens it. The columns "Khách hàng" and "Lương tài xế" are filled on the rows of papers linked to a route entry.
