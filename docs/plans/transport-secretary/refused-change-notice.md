# The admin sees exactly which change the bot skipped

## The mindset of this PR

- Goal: When the bot refuses a change in an admin chat, the admin reads
  exactly which change it skipped and how to get it done.
- What matters most: 1. The guard blocks exactly the same cases as today.
  2. Every skipped change is named, and none is left out. 3. No change is
   named that was not skipped.
- Out of scope: Relaxing or removing the guard. Answers of members. Scheduled
  runs.

## Outcome

Brief: The notice the bot adds after a refused change names the skipped
actions in plain words, instead of listing every action the bot could ever
refuse.

Before: An admin asks, in one message, for the total weight of a truck this
month and for a daily 7:00 reminder. The answer ends with "Có việc tôi chưa làm
(đặt lịch, hủy lịch, mời hoặc xóa người, ghi nhớ hoặc quên, tách tên đã gộp, lưu
hoặc xóa thông tin về thành viên) vì …". The admin cannot tell what was not
done.
After: The same message ends with a notice that names only the schedule, for
example "Tôi chưa đặt lịch vì …", followed by how to redo it: send that request
again on its own, without a photo.

Steps:

- In Zalo, as an admin of a workspace with saved documents, send:
  "Tổng trọng lượng tháng này của xe 93C04939 là bao nhiêu? Rồi đặt lịch nhắc
  tôi mỗi sáng 7 giờ kiểm tra xe."
- The answer gives the total. Its notice names only the schedule as not done.
- Send "Đặt lịch nhắc tôi mỗi sáng 7 giờ kiểm tra xe." on its own.
- The bot replies "Đã đặt lịch." with the schedule summary, and adds no notice.
- Send a photo of a weigh ticket with the caption "Nhớ giúp tôi: tài xế <name
  of a driver in the group> lái xe 93C04939". The notice names only saving the
  fact about that driver.

## Bug and root cause

Bug: An admin attaches an invoice photo and, in the same message, asks the bot
to save standing facts about a truck. The bot answers that it could not do
some things and lists every kind of action it can refuse. The admin cannot
tell which part was skipped.
Reproduce: send the first message in the steps above as an admin.

Root cause: the guard in `src/app/admin-chat/tools/admin-text-guard.ts` records
only whether some change was refused (`changeRefused`), not which tool.
`joinAnswerParts` in `src/app/admin-chat/answer-with-chat.ts` then appends the
fixed text `CHANGE_REFUSED_NOTICE` (`src/app/admin-chat/chat-texts.ts:5`),
which lists every action that can be refused.

## Solution

- Refused changes in the guard
  - Before: the guard keeps one yes/no for "a change was refused".
  - After: the guard keeps the names of the refused tools, in the order they
    were refused, without repeats.
- Refusal notice
  - Before: one fixed text that lists all refusable actions.
  - After: the notice names each refused action once, in plain Vietnamese,
    gives the reason (data read from a photo, or member data read in this
    turn), and asks the admin to resend that request alone, without a photo.
  - Every tool in the guard's list of change tools has its own plain label,
    for example `create_scheduled_task` reads "đặt lịch" and `add_member_fact`
    reads "lưu thông tin về thành viên".
- Which cases the guard blocks stays exactly as it is today.

Tests: none. This repository adds no tests unless the owner asks for them. The
steps above are the check.

## Revert cost

Nothing breaks. The notice goes back to listing every action.
