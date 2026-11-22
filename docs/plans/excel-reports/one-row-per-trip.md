# The trip report has one row per trip, with both ends of the trip

## The mindset of this PR

- Goal: An admin asks for a trip report with pickup and drop-off columns
  ("ngày nhận hàng, ngày đổ hàng, khối lượng lấy hàng, khối lượng đổ hàng, nơi
  lấy hàng, nơi đổ hàng, …"). Each trip in the period is one row. The pickup
  paper and the drop-off paper of the same trip fill their own columns.
- What matters most: 1. Correct numbers: no trip counted twice, and wage,
  freight and allowance counted once per trip. 2. Every requested column is
  filled from saved data when the data exists. 3. A pairing the server is
  not sure of is marked, never shown as fact.
- Out of scope: GPS kilometres. Totals in chat (`total_fact_values`). Pairing papers outside the trip report (search,
  totals, `total_fact_values`). How facts link to papers. The order in which
  inbound events are processed.

## Outcome

Brief: The trip report builds trips, not paper rows. Every pickup paper is
paired with the same truck's drop-off paper when the server can tell which
one it is. Pickup-only and drop-off-only trips still get a row. New fixed
fields give each end its own date, weight, place and paper number.

Before: An admin asked on 20/11 for a report from 28/10 to 20/11 with 13 columns.
The file had 247 rows, one per paper. Six columns were empty in every row:
ngày nhận hàng, ngày đổ hàng, khối lượng lấy hàng, khối lượng đổ hàng, nơi lấy
hàng, nơi đổ hàng. Even the date and weight were missing, because the bot had
no pickup or drop-off field to choose and marked those columns as having no
data. A trip whose pickup ticket and receipt ticket were both saved showed as
two rows.
After: The same request gives one row per trip. A trip with both tickets shows
the pickup date, weight, place and ticket number, and the drop-off date,
weight, place and ticket number, on one row. Wage, freight and allowance
appear once per trip. A drop-off the AI chose is marked "(AI suy luận ra)" in
the text cells and listed in "Ghi chú".

Steps, for the owner (after deploy):

- In Zalo, as an admin, send that request again: "xuất file excel báo cáo số
  liệu vận chuyển tất cả số xe từ ngày 28/10/2026 đến 20/11/2026; thông tin
  bao gồm ngày tháng nhận hàng, ngày tháng đổ hàng, số xe, số phiếu cân (nếu
  có), khối lượng lấy hàng, khối lượng đổ hàng, tên hàng, nơi lấy hàng, nơi đổ
  hàng, tên khách hàng, cước vận chuyển, lương tài xế, bồi dưỡng".
- Open the file. It has the 13 columns in that order. No column is empty in
  every row.
- Pick a truck and a day where the driver sent both the pickup ticket and the
  receiving factory's ticket. That trip is one row. Both dates, both weights
  and both places match the two photos.
- Open "Ghi chú". It gives the number of trips with both papers, with only the
  pickup paper and with only the drop-off paper, and lists every pairing with
  both ticket numbers and "quy tắc" or "AI".
- Ask for the same report again with a "lương tài xế" column. The "Tổng cộng"
  of that column is not higher than in the 20/11 file.

Steps, for the developer (before merging, with the owner's OK, over `ssh
render_personal`, in a read-only transaction, the AI call billable):

- Run a throwaway script that builds the trips and the table rows for
  28/10–20/11, all trucks, with the 13 columns above, without storing a file.
  Print: trips, trips with both papers, pickup only, drop-off only, pairings by
  rule and by AI, AI calls run, failed and skipped, and the totals of the three
  money columns. Compare with the same script on `main`: no money total grows,
  and no paper id appears in two trips. Explain every difference in the PR.
- For 10 random paired trips, print both papers' plate, date, printed times,
  goods weight and issuer from `documents`, `document_lines` and
  `document_parties`. Report how many pairs are the same load.

## Bug and root cause

Bug: An admin asks for a trip report with separate pickup and drop-off
columns. Those columns are empty, the date and weight are missing, and one
trip can take two rows.
Reproduce: the request in the steps above, for 28/10–20/11.

Root cause:
1. The report has one row per paper (`src/app/trips/build-trip-report.ts`,
   rows built from `listTripPapers`). A trip's pickup ticket (stage
   `dispatch`) and its receiving factory's ticket (stage `receipt`, linked by
   a drop-off-only route fact) are two rows. In that period there were 42
   such receipt rows next to 193 dispatch rows.
2. The fixed fields (`TRIP_FIELDS`: `date`, `plate`, `route`, `customer`,
   `goods`, `weight_kg`, `document_number`, `document_kind`, `sender`) have one
   date, one weight and one combined route. Nothing holds a drop-off date,
   weight or ticket number, and pickup and drop-off places only exist joined
   in `route`. The model then gave six columns the source `none`, including
   the ones `date` and `weight_kg` could have filled.
3. Drop-off pairing (`src/app/trips/infer-drop-offs.ts`) only fills the
   drop-off name in `route`, and only for rows whose drop-off is unknown. Rows
   whose route fact names both ends (131 in that period) are never paired, so
   their receipt ticket's date and weight are never used. Receipt tickets that
   are report rows are never candidates.

## Solution

- Trips (new, in `src/app/trips/`): the report is built from trips. A trip has
  a pickup paper, a drop-off paper, or both.
  - Trip tickets: drop-off candidates and drop-off-only trips meet the same
    eligibility as route-fact linking (`src/app/facts/link-facts.ts`: accepted,
    not kind "tin nhắn", not saved from a sheet, no item-level lines). Share
    that condition, do not copy it.
  - Pickup papers: today's report rows that are not `receipt` papers, dated
    `date_from` to `date_to`. Pickup papers dated `date_from` − 1 day are also
    loaded, only to take part in pairing, so a receipt on `date_from` whose
    pickup was the day before does not become a trip of its own. They are not
    rows.
  - Drop-off candidates: eligible `receipt` papers of the report's plates,
    dated `date_from` to `date_to` + 1 day. Receipt papers that are report rows
    today (linked by a drop-off-only fact) are candidates too.
  - Possible duplicates are found on the pickup papers before pairing, with
    today's key (plate, date, pickup). Those papers get no rule pairing and may
    still go to the AI step, as today. The trip carries the flag.
  - Every pickup paper takes part in pairing, including those whose route fact
    names a drop-off. Such a paper pairs only with a receipt whose receiver is
    that drop-off. This needs the paper's route fact id, its drop-off slot
    state and picked companies, and the candidate receiver's organization:
    a resolved slot compares organization ids, an unresolved slot uses the
    same alias-aware name match as route-fact linking.
  - Pairing keeps today's rule (time window, weights within 3%, mutually
    unique) and today's AI step (opaque ids, strict answer, "none" allowed,
    reasons, 150 rows and 40 KB per call). Rows the rule leaves go to the AI
    step:
    - Rows and candidates are split by truck, so no candidate is offered in
      two calls. Trucks are packed into calls up to the per-call limits.
    - At most 4 calls per report, at most 4 at the same time, within the
      existing 60-second timeout each. Trucks beyond that stay unpaired and
      are counted as skipped.
    - Across all calls, a candidate chosen for two rows is rejected for both.
    - A failed call leaves its rows unpaired.
  - Each receipt belongs to at most one trip.
  - Unpaired receipt papers dated `date_from` to `date_to` become drop-off-only
    trips. A receipt dated `date_to` + 1 day appears only paired with an
    in-range pickup. Unpaired pickup papers become pickup-only trips.
  - A trip's date is its pickup paper's date, else its drop-off paper's date.
    Trips are listed by trip date, then plate, then paper id. The report layout
    is unchanged: without a chosen sort, rows go by the first date column
    ascending, else in that trip order.
- Fixed fields
  - Before: `date`, `plate`, `route`, `customer`, `goods`, `weight_kg`,
    `document_number`, `document_kind`, `sender`, read from one paper.
  - After: per trip:
    - `date`: the trip's date.
    - Pickup date, drop-off date: each paper's date.
    - Pickup place: the route fact's pickup, else the dispatch issuer.
    - Drop-off place: the route fact's drop-off, else the paired receipt's
      receiver. Only a place taken from a receipt the AI chose carries
      "(AI suy luận ra)". When the route fact gives the place, an AI pairing
      shows only in "Ghi chú".
    - `route`: "<pickup place> → <drop-off place>", "?" for a missing end.
    - Pickup weight, drop-off weight: each paper's goods weight in kg.
    - `weight_kg`: the pickup weight, else the drop-off weight.
    - Pickup paper number, drop-off paper number; `document_number`: both,
      pickup first, joined by " / ".
    - `customer`, `goods`, `document_kind`, `sender`: from the pickup paper,
      else the drop-off paper. `goods`: the winning "Hàng hóa" fact value, else
      the first document-level line labelled "Hàng hóa" of the pickup paper,
      else of the drop-off paper. The paper query gains that line.
- Fact values on a trip: each value comes from the facts linked to the pickup
  paper, else from those linked to the drop-off paper, so a paired trip never
  counts one value twice. `fact_amount` multiplies the rate by the weight of
  the paper whose fact gave the rate, as today. A drop-off-only trip keeps its
  receipt's linked values: for some routes the receipt is the only linked
  paper. A pickup and a receipt of one load that fail to pair stay two trips,
  as they are two rows today, and both are listed in "Ghi chú" as unpaired.
- "Ghi chú": the trip counts (both papers, pickup only, drop-off only), the
  pairings table (plate, date, both paper numbers, "quy tắc" or "AI"), whether
  each AI call ran, failed or was skipped, the existing lines (`none`
  columns, blank columns, review papers, papers without weight) and possible
  duplicates.
- Tool result: `rows` counts trips, plus the three trip counts and the pairing
  counts.
- Tool spec (`export-trip-report-xlsx-spec.ts`) and admin prompt
  (`admin-prompt.ts`, the trip-report rule):
  - "one row per trip paper" becomes "one row per trip".
  - Describe each field in Vietnamese with the words admins use: "nhận hàng"
    or "lấy hàng" is the pickup end; "đổ hàng" or "giao hàng" is the drop-off
    end; "số phiếu cân" is the paper number.
  - `none` only when no field and no saved fact value fits the column.
- README, the trip-report paragraph: trips, pairing of every pickup paper,
  the new fields, the fact-value rule per trip and the AI batching.

Tests: none. This repository adds no tests unless the owner asks for them. The
steps above are the check.

## Revert cost

The trip report goes back to one row per paper. Nothing stored changes.
