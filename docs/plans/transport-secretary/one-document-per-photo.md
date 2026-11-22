# A photo with several papers is refused, and the sender is asked for one paper per photo

## The mindset of this PR

- Goal: When a photo shows two or more separate papers, nothing from it is
  saved, and the sender is asked to send one paper per photo. A single paper
  that lists several jobs, goods lines or trucks is still saved as today.
- What matters most: 1. A single paper is never refused. 2. Nothing from a
  refused photo is saved, and the sender knows what to do. 3. No extra model
  call.
- Out of scope: Texts and admin sheets. Splitting a photo into its papers. Papers
  already saved from such photos. Answering a question sent with a refused
  photo (as for a blurred photo, only the refusal is sent).

## Outcome

Brief: The reader says when a photo shows several separate papers, with a new
photo problem. The server then refuses the photo like a blurred one: nothing is
saved and the sender gets one reply. This applies to every sender, members and
admins.

Before: A driver photographs a pickup weigh ticket and a factory weigh ticket
lying side by side. Both are saved from one photo, with one photo as their
only source.
After: The bot replies "Ảnh này có nhiều giấy tờ nên Trợ lý chưa lưu. Bạn chụp
và gửi mỗi giấy tờ một ảnh nhé." Nothing is saved. The driver sends two photos
and each ticket is saved.

Steps, for the owner (after deploy):

- In Zalo, as a driver, send one photo with two different weigh tickets side by
  side. The reply is the text above, and "Tháng này có bao nhiêu giấy tờ?" does
  not count them.
- Send each ticket in its own photo. Each is saved as usual.
- Send a photo of one invoice that lists several repair jobs. It is saved as
  today, with every job.
- Send a photo of one weighing list (bảng kê) that lists several trucks. It is
  saved as today.
- As an admin, send a photo with two different papers, captioned "phiếu của
  tài xế <tên>". The same refusal comes, and nothing is saved for that driver.
- Send one album of two photos, each with one ticket. Both are saved. Send an
  album where one photo has two tickets: only that photo gets the refusal.
- Send a screenshot of several Zalo messages with a question. It is handled as
  today, with no refusal.
- Send a photo that the bot asks to explain ("Ảnh này là gì?" reply), then a
  photo-less explanation; if the reread finds several papers, the reply is the
  refusal, and the bot stops waiting for that photo.

Steps, for the developer (before merging, with the owner's OK; about $1 of
model calls, which OpenAI bills and logs):

- Over `ssh render_personal`, in a read-only transaction, list the 14
  production photo messages that produced more than one document and 30
  recent ones that produced one, and copy their photos from storage to a
  temporary local folder. Nothing in the database or storage changes.
- On the branch, run a throwaway local script that builds the reader request
  with the branch's prompt and schema for each photo (as a member, and once as
  an admin) and calls the photo reader model. It writes nothing.
- Report for each photo: old document count, new `photo_problem`, item count,
  and what is on the photo (one paper or several). A single invoice or a
  weighing list is never refused; two separate tickets are. Delete the local
  photos.

## Bug and root cause

Bug: One photo with several separate papers is saved as several documents that
share one photo. The owner wants that never to happen: the sender sends one
paper per photo.
Reproduce: send one photo of two different weigh tickets.

Root cause: the reader prompt tells the model to return two items for two
papers in one photo (`src/app/reading/reader-prompt.ts`, rule 3), and intake
saves them all (`plan-reply.ts`, `run-reply-stage.ts`). On production, 14 of
about 750 photos produced more than one document; 13 of them came from admins.

Why the server does not count documents itself: grouping items into documents
(`groupItems`, `src/app/documents/document-draft.ts`) needs a printed issuer
and number to join items. A single invoice with no number and two jobs
becomes two documents, and a weighing list of six trucks becomes six. Both are
among the 14. Only the model sees whether the photo shows one sheet or several.

## Solution

- Reader schema and validation (`reader-schema.ts`, `reading.ts`):
  `photo_problem` gains the value `several_papers`.
- Reader prompt (`reader-prompt.ts`):
  - Rule 1c: `several_papers` only when the photographed scene shows two or
    more separate physical papers meant as work documents, for example two
    weigh tickets, or a ticket next to an invoice. Then `has_work_data` is
    false and `items` is empty. One paper is one paper even when it lists
    several jobs, goods lines or trucks, or has sections or several printed
    copies (liên). Never infer it from several chat bubbles, cards, thumbnails,
    rows or panes in a screenshot: a screenshot used to ask a question stays
    under rule 1, normally with `photo_problem` null.
  - Rule 3: drop "Một ảnh có hai chứng từ khác nhau thì có hai phần tử"; items
    of one paper stay as today.
- Reply (`plan-reply.ts`, `intake-texts.ts`): follow the existing photo
  problems (blurry, cut off, not work). New text: "Ảnh này có nhiều giấy tờ nên
  Trợ lý chưa lưu. Bạn chụp và gửi mỗi giấy tờ một ảnh nhé." The message gets
  `submission_status` `accepted` with no documents, as every classified
  no-work photo does: intake finished, nothing saved. Admins are told of a
  member's photo as for a blurred one. A question in the caption is not
  answered, as for a blurred photo.
- Admin photos stay in intake: admin chat takes only photo-less `no_work_data`
  messages (`reply-to-message.ts`, `isSentToChat`), so an admin gets the same
  refusal, also with a caption naming a driver; nothing is saved for him.
- A photo waiting for an explanation (`planAnswer`, `plan-reply.ts`): when the
  reread with the explanation returns `several_papers`, reply with the refusal
  and end the wait (`photoAfter: 'same_as_reply'`), before the question and
  ask-again branches.
- Albums: Zalo's album event is split into one message per image, each read on
  its own, with the album caption on every image. The rule applies per image.
- Why not the unclear-photo path (`place-unclear-photo.ts`): it waits for the
  sender to explain the same photo. Here the photo cannot be saved whatever the
  explanation, so the sender sends new photos instead.
- Rereads and template backfills use the same reader rules. An operator reread
  of such a photo with saved records returns `no_items` and deletes nothing;
  one without records records `no_document`. A template backfill gets zero
  drafts, counts the paper as unmatched, and does not update it.
- README: the new photo problem and its reply.

Tests: none. This repository adds no tests unless the owner asks for them. The
steps above are the check.

## Revert cost

Photos with several papers are saved again as several documents. Nothing
stored changes.
