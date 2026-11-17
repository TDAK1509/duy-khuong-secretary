# Admins get large report tables as an Excel file

## The mindset of this PR

- Goal: When an admin's answer holds a table of more than 5 rows, the admin
  gets an Excel file link plus a short plain-text summary in Zalo, instead of
  a markdown table that Zalo shows as raw `**` and `|` symbols.
- What matters most: 1. Every number in the file is a number a tool returned
  in this turn, copied exactly. 2. The file opens in Excel with real numbers
  that can be summed and sorted. 3. The chat reply that carries the link is
  plain text: no `**`, no `|`, no `#`.
- Out of scope: A plain-text rule for answers without a file (the owner chose
  not to add one). Scheduled runs, which have their own fixed tools. Sending
  the file as a Zalo attachment: the bot can only send text and images today,
  so the file goes out as a link, as `export_documents_xlsx` already does.
  Computing report numbers on the server.

## Outcome

Brief: A new admin tool turns a table the model filled in from this turn's
tool results into an `.xlsx` file and returns a 24-hour link. Large report
tables come as that file, and the chat reply is a short summary with the
link.

Before: An admin asks "So sánh tổng trọng lượng hàng giao cho từng công ty
trong tháng 10 và tháng 11." The answer on `gpt-6.1-sol` is a markdown table
of 20+ rows, which Zalo shows with raw `**` and `| col | col |` symbols.
After: The answer is two or three plain sentences: the main result, a link to
an `.xlsx` file and "link có hiệu lực 24 giờ". The file holds one row per
company, a column per month, and numbers stored as numbers.

Steps:

- In Zalo, as an admin of a workspace with documents in October and November
  for more than 5 companies, send "So sánh tổng trọng lượng hàng giao cho từng
  công ty trong tháng 10 và tháng 11."
- The reply has no `**`, `|` or `#`. It gives the main result in one or two
  sentences, a link and "link có hiệu lực 24 giờ".
- Open the link. An `.xlsx` file downloads, with a bold header row, one row
  per company and the month columns. Select a month column in Excel: the
  status bar shows a sum, because the cells are numbers.
- Ask "Tổng trọng lượng hàng giao cho công ty <one company from the file>
  tháng 10?". The number matches the file.
- Send "Còn theo từng xe thì sao?". The reply has a new link, and the file has
  one row per truck.
- Ask "Tháng này có bao nhiêu giấy tờ?". The answer is plain text with no
  link, because it is not a table of more than 5 rows.

## Solution

- Follow `export_documents_xlsx`
  (`src/app/admin-chat/tools/export-documents-xlsx-tool.ts`, workbook in
  `src/app/documents/build-documents-workbook.ts`): an admin-only tool, built
  with exceljs, stored with `fileStorage.put` under the workspace's
  `exports/` prefix, returned as a 24-hour presigned link with a file name and
  row count. "Tính năng xuất Excel chưa được cấu hình." when file storage is
  off.
- Differences:
  - New: the input is a report table the model fills in: a title, column
    definitions (a name, with the unit in the name such as "Trọng lượng (kg)",
    and a type, number or text) and rows of cells in column order.
  - The tool refuses a table whose rows do not match the column count, a
    number column holding text, or a table over 50 columns or 5,000 rows, and
    says which.
  - The workbook has the title on the first row, a bold header row, the header
    frozen, number cells stored as numbers with thousands separators, and text
    cells as written.
  - The file name starts with `bao-cao-`.
- The tool reads no data and changes no data, so it goes into
  `ADMIN_TEXT_TOOLS` (`src/app/admin-chat/tools/admin-text-guard.ts`), like
  `export_documents_xlsx`. Add it to `ADMIN_TOOLS`
  (`src/app/admin-chat/tools/admin-tools.ts`) and to the tool runners
  (`src/app/admin-chat/tools/run-admin-tool.ts`). Both admin models (report
  and other) get it.
- Admin prompt (`src/app/admin-chat/admin-prompt.ts`)
  - Before: "Cách trả lời" asks for one line per company, truck or driver,
    with no limit. Its last rule says to reply "Hiện tôi chưa tạo được
    <định dạng>" for Excel.
  - After: when the answer holds a table of more than 5 rows, call the new tool
    with every row. Every number in the table must come from a tool result in
    this turn, copied exactly, never estimated. Then reply in plain text with
    no markdown: the main result in one or two sentences, the link and "link
    có hiệu lực 24 giờ". Do not paste the table into the message. A table of 5
    rows or fewer stays in the message as before. Remove Excel from the list
    of formats the bot cannot make.
- README, "Admins ask the bot": describe the report export, the 5-row rule
  and the 24-hour link.

Tests: none. This repository adds no tests unless the owner asks for them. The
steps above are the check.

## Revert cost

Large report tables go back to markdown in chat. Files already created stay in
storage until their links expire.
