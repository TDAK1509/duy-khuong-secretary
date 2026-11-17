# Admins get complete answers to multi-step questions

## The mindset of this PR

- Goal: An admin who asks a report or analysis question that needs many
  lookups gets a complete answer, written for a manager, instead of "Xin lỗi,
  tôi chưa xử lý được. Bạn thử lại nhé." or an answer cut short.
- What matters most: 1. The answer is complete and correct. 2. Members' chat
  and scheduled runs behave exactly as today. 3. One question cannot loop
  without end.
- Out of scope: New tools. The model choice. Members' prompt and limits.
  Scheduled runs' limits.

## Outcome

Brief: The admin chat may use more tool rounds per question, and its prompt
asks for full answers instead of short answers capped at about 1,500
characters for drivers.

Before: After 5 rounds of tool calls, the admin gets
"Xin lỗi, tôi chưa xử lý được. Bạn thử lại nhé.". The admin prompt says the
reader may be a driver and limits answers to about 1,500 characters, so
comparisons over many companies or trucks come back shortened.
After: The admin chat allows up to 15 rounds. The prompt lets the answer be as
long as the question needs. Long answers arrive as several Zalo messages.

Steps:

- In Zalo, as an admin of a workspace with documents in October and November,
  ask: "So sánh tổng trọng lượng hàng giao cho từng công ty trong tháng 10 và
  tháng 11, chia theo từng xe."
- The answer covers every company and truck, for both months.
- The service log line `[admin-chat] … outcome=answered rounds=<n>` shows an
  `n` that may be above 5.
- An answer longer than 2,000 characters arrives as several messages in a row.
- As a driver, ask a question. The answer is still short and simple.

## Solution

- Tool rounds per question
  - Before: `MAX_TOOL_ROUNDS = 5` in `src/app/admin-chat/run-tool-loop.ts`, for
    the admin chat, the member chat and scheduled runs.
  - After: the admin chat allows 15 rounds. The member chat and scheduled runs
    keep 5.
- Admin prompt (`src/app/admin-chat/admin-prompt.ts`, "Cách trả lời")
  - Before: "Câu ngắn, từ ngữ đơn giản. Người dùng có thể là tài xế, ít dùng
    điện thoại." and "Trả lời ngắn gọn, tối đa khoảng 1.500 ký tự."
  - After: the reader is a manager. Answer as fully as the question needs:
    lead with the result, then the breakdown one line per company, truck or
    driver, then any caveat (documents waiting for review, results that are
    not complete). Keep the number and date formats.
- The member prompt stays as it is.
- Long answers already split into Zalo-sized messages (`splitText` in
  `src/app/delivery/split-text.ts`). Nothing to change there.

Tests: none. This repository adds no tests unless the owner asks for them. The
steps above are the check.

## Revert cost

Admin answers go back to short answers and 5 rounds. Nothing else changes.
