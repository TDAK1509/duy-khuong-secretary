# Excel reports look finished and are arranged for the question asked

These PRs merge in the order written. Each one leaves production working when
it ships alone.

Facts every PR in this file relies on:

- The bot sends three kinds of Excel files, all built by server code with
  exceljs (`^4.4.0`):
  - `export_report_xlsx`: a table the model fills. Its columns have a name and
    a type, `number` or `text`
    (`src/app/admin-chat/tools/export-report-xlsx-tool.ts`, `-spec.ts`).
  - `export_trip_report_xlsx`: a trip or cost table the server fills
    (`src/app/admin-chat/tools/export-trip-report-xlsx-tool.ts`,
    `src/app/trips/build-trip-report.ts`). Its column sources are fixed fields
    (`date`, `plate`, `route`, `weight_kg`, …), `fact_value` (a fact value,
    any unit, per row) and `fact_amount` (đ/tấn × kg / 1000, money). Today the
    sources are reduced to name and type before drawing.
  - `export_documents_xlsx`: a document list
    (`src/app/admin-chat/tools/export-documents-xlsx-tool.ts`). Its fact
    columns are formatted per cell with each row's own unit.
- The first two are built by `buildReportWorkbook`
  (`src/app/documents/build-report-workbook.ts`): a title on row 1, the header
  on row 2, then the data rows, no total row, plus optional text sheets such
  as "Ghi chú". The document list is built by `build-documents-workbook.ts`
  (header on row 1). All three are styled by `formatWorkbookSheet`
  (`src/app/documents/format-workbook-sheet.ts`): widths from the displayed
  text, 8 to 50 characters, a gray bold header, a filter, a frozen header, and
  number and date formats.
- exceljs writes formulas but does not calculate them. A formula cell needs a
  cached `result`, or viewers that do not recalculate (phone apps, in-app
  previews) can show blank or 0.
- The owner's verdict on today's files: "very ugly". The owner approved a
  sample with a dark blue header, banded rows, light row lines, money as
  "500.000 đ", a total row and landscape printing. Report goals, in order:
  correct, then a good experience for the reader.
- This repository adds no tests unless the owner asks for them. Every PR below
  lists none, and its outcome steps are the check. Merging to `main` deploys.
  The repo is public: no production names or ids in committed files.

---

## PR 1: One finished house style, with units known per column

### The mindset of this PR

- Goal: Every Excel file the bot sends looks finished and easy to read,
  following the sample the owner approved, and adds a correct total row for
  columns that can be added up.
- What matters most: 1. Every data value and its order stay the same.
  Presentation rows (title block, total row) and formula cells are added.
  2. A total appears only for a column with one additive unit (money, kg,
  tons, litres), and its cached value is right in any viewer. 3. Readable on
  screen and on paper.
- Out of scope: Choosing the order, groups or summary per question (PR 2 and
  PR 3). Charts. New data.

### Outcome

Brief: A shared house style for all three Excel tools. Each column knows its
unit (money, kg, tons, litres, rate, other number). Money and weight cells
show their unit, and additive columns get a "Tổng cộng" row whose value is
stored in the file and recomputed by Excel when filtering.

Before: A report opens with a plain title, a gray header, no row lines or
shading, money as plain numbers and no total.
After: The same report opens with a large title and an info line, a dark blue
header with white text and filter buttons, alternating light row shading,
money as "500.000 đ", and a bold "Tổng cộng" row for its money and weight
columns.

Steps, for the owner:

- In Zalo, as an admin, ask "Làm báo cáo excel chi phí tháng 11, mỗi dòng một
  chuyến, gồm các cột Ngày lấy hàng, Số xe, Tên chuyến, Lương chuyến."
- Open the link in the Zalo preview, on the phone, and in Excel or Google
  Sheets. All three show the title block, the dark blue header, banded rows,
  wages as "500.000 đ", and a "Tổng cộng" row with the same, non-zero total.
- In Excel or Sheets, filter the plate column to one truck. The total changes
  to that truck's sum.
- Rows marked "(AI suy luận ra)" show that text in dark amber.
- Print preview: landscape, one page wide, header repeated on each page.
- Ask "Xuất Excel giấy tờ tháng này." The document list has the same style,
  and a total under the amount column.

Steps, for the developer (local):

- Build a report whose `export_report_xlsx` columns include a litre column
  ("Chi phí dầu (lít)", unit `liter`) and a rate column (unit `rate`). The
  litre column is totaled in litres, and the rate column has no total.
- Build a document list where one fact column holds values in two different
  units. That column keeps per-cell formats and has no total.

### Solution

- Column units
  - Before: columns carry only a name and `number`/`text`/`date`.
  - After: `ReportColumn` (`build-report-workbook.ts`) also carries `unit`, one
    of `vnd`, `kg`, `ton`, `liter`, `rate`, `number` (or none for text and
    dates).
    - `export_report_xlsx`: new optional `unit` per column in the spec, from
      that enum. Without it, the column is `number`, never inferred from its
      name. The prompt asks the model to set it for money, weight and litres.
    - `export_trip_report_xlsx`: `fact_amount` → `vnd`. `weight_kg` → `kg`.
      `fact_value` → from the units of its non-blank values: all "đ" → `vnd`,
      all "đ/tấn" or another "…/…" → `rate`, all kg → `kg`. Mixed units, or
      text in some rows → keep per-cell formats, no column unit.
    - `export_documents_xlsx`: the amount column → `vnd`. Each fact column: the
      same rule as `fact_value`.
- House style in `formatWorkbookSheet` (`src/app/documents/format-workbook-sheet.ts`),
  for all three tools:
  - Title block: the title, bold, size 15, dark blue, merged across the table
    columns. Under it, one info line, grey italic, size 10: "Số dòng: N · Tạo
    lúc: dd/mm/yyyy hh:mm" (Vietnam time; N counts data rows only). The
    document list gains the same block above its header. Neither line is in
    the filter range.
  - Header: dark blue fill (`#1F3864`), white bold text, centered, wrapped,
    taller row, frozen below the header.
  - Body: a light line under each row, every other data row shaded `#F2F5FA`,
    text top-aligned and wrapped, numbers right-aligned, dates centered.
  - Formats by unit: `vnd` `#,##0 "đ"`; `kg` `#,##0 "kg"`; `ton`
    `#,##0.00 "tấn"`; `liter` `#,##0.0 "lít"`; `rate` and `number` `#,##0`, or
    `#,##0.00` when not whole. Mixed-unit columns keep today's per-cell formats.
  - Total row "Tổng cộng" (bold, light blue fill, a top line and a double bottom
    line) when at least one column has unit `vnd`, `kg`, `ton` or `liter`. Each
    such column gets `SUBTOTAL(109, <first data row>:<last data row>)` with the
    server-computed sum as the cached `result`. No other column is totaled.
  - The filter covers the header and data rows only, not the total row.
  - Inferred values: a cell containing "(AI suy luận ra)" is shown in dark
    amber text.
  - Widths: as today, 8 to 50 characters from the displayed text, now
    including the unit suffix.
  - Print: landscape, A4, fit to one page wide, header row repeated on each
    page (`printTitlesRow`).
- Text sheets ("Ghi chú", built in `build-trip-report.ts`) get an explicit
  layout: label rows (label in bold, value beside it), a blank separator kept
  as is, and any sub-table drawn with the house header and body style. No
  blanket bolding of the first column.
- README, the Excel part of "Admins ask the bot": the house style, units and
  the total row.

Tests: none (see the shared facts above).

### Revert cost

Files go back to today's plain style. The `unit` argument stays accepted and
unused.

---

## PR 2: The model picks the order and the groups for each report

Depends on: PR 1.

### The mindset of this PR

- Goal: For `export_report_xlsx` and `export_trip_report_xlsx`, the model
  chooses how rows are ordered and grouped for the question asked. The server
  validates the choice and draws it, with subtotals it computes.
- What matters most: 1. A layout never changes, drops or duplicates a data
  row, and every subtotal is computed by the server and Excel. 2. The
  arrangement fits the question. 3. Any invalid layout falls back to the PR 1
  look as a whole, and the report is still sent.
- Out of scope: The summary block and subtitle (PR 3). Charts. Pivot tables.
  The document list, which keeps the PR 1 style.

### Outcome

Brief: Both report tools accept an optional `layout` with sort keys and one
group column. Grouped reports get a subtotal row after each group, Excel
outline levels to collapse groups, and a grand total that does not count the
subtotals twice. The prompt teaches the model when to group and how to sort.

Before: Every report lists rows in the order the tool returned them, with no
groups.
After:
- "Báo cáo chi phí tháng 11 theo từng xe": rows grouped by truck, each truck
  followed by "Tổng <biển số>" with its subtotals, collapsible, and "Tổng cộng"
  at the end.
- "Xe nào có lương chuyến cao nhất tháng 11? Xuất excel.": rows sorted by the
  wage column, largest first, with no groups.

Steps, for the owner:

- Send "Báo cáo chi phí tháng 11 theo từng xe, gồm Ngày lấy hàng, Số xe, Tên
  chuyến, Lương chuyến."
- Open the link. Rows are grouped by truck, sorted by date inside each truck.
  After each truck, a bold "Tổng <biển số>" row holds its wage subtotal. The
  outline buttons collapse each truck. The last row, "Tổng cộng", equals the sum
  of the subtotals. The same numbers show in the Zalo preview and on the phone.
- In Excel or Sheets, filter the plate column to one truck. That truck's rows
  and its subtotal row stay, and "Tổng cộng" equals that truck's subtotal.
- Send "Xe nào có lương chuyến cao nhất tháng 11? Xuất excel." Rows are sorted
  by wage, largest first, with no groups.
- Send "Danh sách chuyến ngày 16/11, xuất excel." Rows are sorted by date then
  plate, with no groups.

Steps, for the developer (local):

- Call the tool with a `layout` naming a column that does not exist. The file
  uses the PR 1 look, and the log shows `[report-layout] invalid
  reason=<…> fallback`.
- Call it with a group column holding blanks. The blanks form the last group,
  "(Trống)", with its own subtotal.

### Solution

- New optional argument `layout` on both report tools, in a shared spec:
  - `sort`: up to 3 keys, each a column index (0-based) and `asc` or `desc`.
  - `group_by`: one column index or null.
  - `totals`: column indexes to total, each with an additive unit (`vnd`, `kg`,
    `ton`, `liter`). When left out, every additive column is totaled, as in
    PR 1.
- Columns are referenced by index, not by name, so duplicate display names
  are harmless. The prompt sees indexes in the column list it sends.
- Validation, as a unit, before drawing: every index exists, totals are
  additive columns, there are at most 3 sort keys, and the group column is not
  a number column of unit `vnd`, `kg`, `ton` or `liter`. Any failure: the
  whole layout is dropped, the PR 1 look is used, and the log line names the
  reason. The report is always sent.
- Order (server-side, stable):
  - The effective keys are `group_by` first (ascending), then the `sort` keys,
    then the original row order.
  - Text: `Intl.Collator('vi', { numeric: true, sensitivity: 'base' })`, then
    exact string. Numbers and dates by value. Blanks (null, empty, spaces) last.
    In a column with numbers and text, numbers come before text.
- Groups: rows with the same group value form a group. Blank values form one
  last group labelled "(Trống)". After each group, a subtotal row: the group
  column holds the group value (or "(Trống)"), the first text column holds
  "Tổng <value>", and each total column has
  `SUBTOTAL(9, <group's first row>:<group's last row>)` with the
  server-computed sum as the cached result. Bold, light fill. The group's data
  rows get outline level 1. Function 9, not 109, as Excel's own Subtotal tool
  does: collapsing an outline group hides its rows, and 109 would then drop
  them from the subtotal and the grand total. 9 still ignores rows hidden by
  the filter and nested SUBTOTAL cells.
- Grand total "Tổng cộng" (when the sheet has groups):
  `SUBTOTAL(9, <first data row>:<last row before the grand total>)` with the
  cached sum of the data rows. Excel's SUBTOTAL ignores nested SUBTOTAL rows,
  so the subtotals are not counted twice.
- Filter: covers the header, data and subtotal rows. Filtering the group
  column keeps that group's subtotal row. Filtering other columns can hide
  subtotal rows. Only the group-column case is promised.
- The tool result echoes the effective layout (group, sort keys, totals) for
  the model's reply.
- Admin prompt (`src/app/admin-chat/admin-prompt.ts`), with the Excel rules:
  choose the layout from the question.
  - "theo từng xe / tuyến / ngày / tài xế" → `group_by` that column, sort by
    date.
  - "cao nhất / nhiều nhất / thấp nhất" → sort by that number column `desc`
    or `asc`, no groups.
  - A list for one day or one truck → sort by date or time, no groups.
  - When unsure: no groups, sort by date.
- Log `[report-layout] group=<index> sort=<…> totals=<…>` or
  `[report-layout] invalid reason=<…> fallback`.
- README: the layout options.

Tests: none (see the shared facts above).

### Revert cost

Reports go back to the PR 1 look with rows in tool order. Nothing else
changes.

---

## PR 3: A summary block and subtitle at the top of each report

Depends on: PR 1, PR 2.

### The mindset of this PR

- Goal: Each report opens with the few figures the reader wants first, such
  as total money, number of trips and number of trucks, and a one-line
  subtitle with the period. The server computes every figure.
- What matters most: 1. Every figure is computed by the server from the rows,
  never written by the model. 2. The figures chosen fit the question.
- Out of scope: Charts. Figures that need data not in the rows.

### Outcome

Brief: `layout` gains `summary` (up to 4 figures, each a label and a measure
the server computes) and `subtitle`. They are drawn between the info line and
the header. The tool result returns the computed figures, so the chat reply
can quote them.

Before: Reports start straight with the header.
After: "Báo cáo chi phí tháng 11 theo từng xe" opens with a subtitle such as
"Tháng 11/2026, theo ngày lấy hàng" and a summary such as "Tổng lương chuyến:
12.400.000 đ · Số chuyến: 118 · Số xe: 9".

Steps, for the owner:

- Send "Báo cáo chi phí tháng 11 theo từng xe, gồm Ngày lấy hàng, Số xe, Tên
  chuyến, Lương chuyến."
- Open the link. Above the header: the subtitle and 2 to 4 summary figures.
  The total wage in the summary equals "Tổng cộng". The number of trips equals
  "Số dòng" in the info line.
- The chat reply quotes the same figures as the file.

Steps, for the developer (local):

- Call the tool with a summary `sum` over a `rate` column. The summary is
  dropped, and the log names the reason.

### Solution

- `layout.summary`: up to 4 items, each a label (at most 40 characters) and a
  measure:
  - `sum` of a column with an additive unit (`vnd`, `kg`, `ton`, `liter`);
  - `count` of data rows;
  - `count_distinct` of a column (blanks not counted).
  - A sum over a column with blank cells adds "(N dòng trống)".
- `layout.subtitle`: plain text, at most 120 characters, control characters
  removed. For `export_trip_report_xlsx`, the server writes the period from its
  validated `date_from` / `date_to` and puts the model's subtitle after it. The
  prompt forbids figures in the subtitle. The figures belong to the summary.
- Validation joins PR 2's: an invalid summary item drops the whole summary.
  The rest of the layout stays.
- Drawing: the subtitle, then one line per figure, "<label>: <value>" in the
  column's unit format, between the info line and the header.
- The tool result returns each figure with its value, and the prompt says to
  quote figures only from it.
- Admin prompt: choose 2 to 4 figures the reader likely wants first (the
  money asked about, the number of trips, the number of trucks or routes). The
  subtitle names the period and the date basis.
- README: the summary block.

Tests: none (see the shared facts above).

### Revert cost

Reports lose the summary block and subtitle. Nothing else changes.
