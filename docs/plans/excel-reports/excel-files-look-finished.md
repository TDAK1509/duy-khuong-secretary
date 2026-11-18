# Excel files from the bot look finished: fitted columns, header filters, real numbers and dates

## The mindset of this PR

- Goal: Every Excel file the bot sends (`export_report_xlsx` and
  `export_documents_xlsx`) opens with columns wide enough for their content, a
  filter button on every header cell, a styled header, and numbers and dates
  stored as real numbers and dates, so the admin can sort, filter and sum
  right away.
- What matters most: 1. Every value shown is the same as today. Only how
  amounts and dates are stored changes, from formatted text to real numbers
  and dates. 2. Filters cover the header row and every data row, never the
  title. 3. Long text never makes a column unreadably wide.
- Out of scope: Which rows and columns a report holds. Charts. Totals rows.
  Merging the title cell. New sheets.

## Outcome

Brief: Both workbook builders size each column to its displayed content
(within limits), wrap long text, turn on a filter over the header and data
rows, style and freeze the header, and write amounts and dates as real Excel
numbers and dates.

Before: An admin asks for a cost report as Excel. Every column opens at the
default narrow width, so headers and trip names are cut off. The header is
only bold, and there are no filter buttons. In the document export, amounts
and dates are text, so a column cannot be summed and sorts wrongly ("10/11"
before "2/11").
After: The file opens with readable column widths, a shaded, frozen header
with a filter button on each column, amounts shown as 1,250,000 and summable,
and dates shown as 31/10/2026 that sort by date.

Steps:

- In Zalo, as an admin, send "Xuất Excel giấy tờ tháng này."
- Open the link. Each column is wide enough for its header and values, up to
  a limit. Long text wraps inside its cell instead of stretching the column.
- Each header cell has a filter button. Filter the plate column to one truck.
  Only that truck's rows remain.
- The header row is shaded, bold, frozen, and wraps long column names.
- Select the amount column. The status bar shows a sum. Sort the date column
  ascending. The dates come out in calendar order.
- Ask a report that returns more than 5 rows, for example "So sánh tổng trọng
  lượng hàng giao cho từng công ty trong tháng 10 và tháng 11." The report file
  has the same formatting. The title stays on row 1, outside the filter.

## Solution

- New: one shared formatting step, called by both builders
  (`src/app/documents/build-report-workbook.ts`,
  `src/app/documents/build-documents-workbook.ts`). It is told the header row
  (row 2 for reports, under the title, and row 1 for document exports), the
  last data row and the last column.
  - Widths: measured while rows are added, from each cell's displayed text
    (numbers as formatted, dates as dd/mm/yyyy). Split on line breaks, count
    characters (Unicode code points) of the longest line, and count wide
    characters such as emoji as 2. Width = longest line + 2, at least 8, at
    most 50.
  - Wrap: every text cell, header included, gets wrap on. Row heights stay
    automatic.
  - Header row: bold, light gray fill, thin bottom border, vertically
    centered, frozen at the header row.
  - Filter: one auto-filter from the first to the last column, from the header
    row to the last data row. For reports the title row is not in the filter.
- Real numbers and dates
  - Before: `build-documents-workbook.ts` writes the amount and numeric fact
    values as formatted text, and dates as text. `build-report-workbook.ts`
    writes numbers as numbers and has no date type.
  - After: the document export writes the amount and numeric fact values as
    numbers with `#,##0` (or `#,##0.00` when not whole), and the document date
    as a date with format `dd/mm/yyyy`. Text values stay text.
    `build-report-workbook.ts` keeps its number and text columns and gains a
    `date` column type that writes `dd/mm/yyyy` dates. `export_report_xlsx`
    does not expose it yet.
- Numbers are right-aligned.

Tests: none. This repository adds no tests unless the owner asks for them. The
steps above are the check.

## Revert cost

Excel files go back to default widths, no filters, and text amounts and dates
in the document export. Nothing else changes.
