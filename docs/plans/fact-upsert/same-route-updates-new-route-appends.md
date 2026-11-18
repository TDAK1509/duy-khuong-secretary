# A fact for an existing route updates it, a fact for a new route is added

## The mindset of this PR

- Goal: When an admin states a route fact (a fact with a pickup or drop-off
  company), the server decides whether it is the same rule as a saved route
  fact or a new one. The same route (with the same truck, driver and customer
  scope) updates the saved fact's values. Any other route is saved as a new
  fact, and saved facts stay untouched. The reply says which one happened.
- What matters most: 1. A different route never overwrites a saved fact.
  2. The same route never creates a second copy. 3. The reply always says
  whether a fact was added or updated, and what changed.
- Out of scope: Facts without a pickup or drop-off (truck-only, driver-only,
  driver plate facts): they keep today's behavior. Merging existing duplicate
  facts. Restoring the fact overwritten on 18/11 automatically: the admin sends
  it again. Per-value timestamps.

## Outcome

Brief: `save_fact` with a pickup or drop-off looks for a saved route fact with
the same identity, under the workspace lock. When it finds one, it updates that
fact's values. Otherwise it adds a new fact. `update_fact` can no longer change
or clear a fact's pickup, drop-off or customer, so a new route can never
replace an old one.

Before: A truck has a saved fact "route A → B, wage 500k". The admin writes
"truck X carries coal from C to D, 190k/tấn, wage 500k". The bot calls
`update_fact` and rewrites the A → B fact into C → D, so the A → B route is
lost. The admin prompt even says to use `update_fact` for "đổi tuyến".
After: The same message adds a C → D fact, and A → B stays. A later "route A →
B wage 600k" updates the A → B fact's wage from 500k to 600k, without a second
copy.

Steps (test plate 51C66666 has no papers. Pick three company names that
already exist in the saved company list: ask "Liệt kê các công ty đã lưu" and
use them as P, Q and R):

- As an admin, send "Xe 51C66666 lấy hàng ở <P>, đổ hàng ở <Q>, lương tài xế
  500k mỗi chuyến." The reply says "Đã lưu thông tin mới".
- Send "Xe 51C66666 tuyến <P> đến <Q> lương tài xế 600k." The reply says "Đã
  cập nhật thông tin cũ: Lương tài xế 500.000đ → 600.000đ." "Đã lưu thông tin
  gì về xe 51C66666?" shows one fact.
- Send the same sentence again. The reply says the existing fact was found and
  no value changed.
- Send "Xe 51C66666 lấy hàng ở <P>, đổ hàng ở <R>, lương tài xế 300k." The
  reply says "Đã lưu thông tin mới". The truck now lists two facts: <P> → <Q>
  at 600k and <P> → <R> at 300k.
- Send "Đổi tuyến của xe 51C66666 từ <P>–<Q> sang <P>–<R>." The bot does not
  rewrite a route. It explains that a different route is a separate fact and
  offers to save it and delete the old one.
- As an admin, send "tuyến vận chuyển than từ <P> đi nhà máy <Q>, cước vận
  chuyển 70k/tấn, bồi dưỡng 50k/chuyến, lương tài xế 200k/chuyến" (no plate).
  The log's first call is `save_fact`, and the reply says "Đã lưu thông tin
  mới". Delete that fact too.
- Delete both test facts ("Xóa thông tin chuyến … của xe 51C66666").
- Resend the route fact that was overwritten on 18/11 (the owner has its
  text). The reply says "Đã lưu thông tin mới", and that truck's other route
  fact is still listed.

## Bug and root cause

Bug: An admin had a saved route fact for a truck. They stated a different
route for the same truck. The bot replied "Đã cập nhật…" and rewrote the saved
fact into the new route, dropping the old route, its customer and an
allowance. The old route's rule was lost.
Reproduce: save a route fact for a truck, then state a different route with
amounts for the same truck.

Root cause: the choice between adding and updating is left to the model. The
admin prompt (`src/app/admin-chat/admin-prompt.ts`, trip-facts section) says:
call `list_facts`, then `save_fact` if nothing exists, else `update_fact` "nếu
giá trị hoặc phạm vi thay đổi". It also lists "đổi xe, đổi tuyến" as a reason
for `update_fact`. The model found one fact for the plate and updated it.
`update_fact` (`src/app/facts/update-fact.ts`) accepts new pickup and drop-off
companies, so the route was replaced.

## Solution

- Route fact identity: two route facts are the same rule when all match:
  - pickup and drop-off: each side either empty on both facts, or the same
    company. Two companies are the same when:
    - their stored match keys are equal; or
    - both slots have picked organizations (`fact_companies`) that share one;
      or
    - one slot has picked organizations and the other slot's match key is an
      alias (`organization_aliases`) of one of them.
    - A slot resolved with no pick compares by its match key only.
  - customer: same rule, both empty or the same company.
  - plate: both empty, or equal. Driver: both empty, or the same member.
- `save_fact` (`src/app/facts/save-fact.ts`,
  `src/app/admin-chat/tools/save-fact-tool.ts`), only when the new fact has a
  pickup or drop-off:
  - Company resolution runs first, as today: one picker call per save, already
    metered. The lookup adds no model call.
  - Then, in one transaction: take `lockWorkspaceRecords`, load the
    workspace's route facts, and compare identities. Then:
    - none: insert, as today. `action: "added"`.
    - one: update that fact (below). `action: "updated"`.
    - more than one: change nothing. `action: "ambiguous"` with each
      candidate's id and scope.
  - New optional argument `fact_id`: after an ambiguous result, the bot asks
    the admin which fact is meant and calls `save_fact` again with that id. It
    is accepted only when that fact has the same identity.
  - Updating a fact:
    - each value the call names replaces that value's whole stored content
      (number and unit, or text). New names are added. Omitted values stay.
      `save_fact` never removes a value; removal is `update_fact`.
    - the statement becomes the newest statements that fit in 2,000
      characters, newest first, dropping the oldest.
    - `updated_at` is set. By the existing rule (most recently updated fact
      wins per value), every value of this fact then wins over other linked
      facts' values. This is intended.
    - links are not rebuilt: identity means scope and picks are unchanged, so
      the linked-paper count is read, not recomputed. Except when picks are
      restored: a stored slot that is unresolved (for example after
      `split_merged_name`) while the new call's slot is resolved takes the new
      picks (`replaceSlotCompanies`, `*_resolved = true`), and the fact is
      relinked in the same transaction. The reply lists it in
      `restored_companies` ("đã khớp lại công ty …"), so it never reads as a
      no-op, and `linked_documents` is recomputed.
    - an exact restatement (every named value already stored, nothing
      restored) writes nothing: no statement change, no `updated_at`. The
      reply is "Đã có thông tin này, không đổi giá trị nào".
    - the automatic "Khách hàng" value is left out of a same-route update:
      identity already means the same customer.
    - the reply shows the stored fact's scope names, not the new call's
      spelling.
  - Result per action: the current scope, `linked_documents`, and for
    `updated` a list of changes: `replaced` (old → new), `added` (new value),
    or none when nothing changed. `refused_values` as today.
  - Facts without a pickup or drop-off insert as today, including the
    automatic customer value.
- `update_fact` (`src/app/admin-chat/tools/update-fact-spec.ts`,
  `update-fact-tool.ts`, `src/app/facts/update-fact.ts`)
  - Before: can set and clear pickup, drop-off and customer.
  - After: pickup, drop-off and customer are removed from both its setters and
    `clear_scope`. A call naming them is refused with: a different route is a
    separate fact (save it), and the old one can be deleted. It still changes
    values, plate and driver, and still clears plate or driver ("bỏ giới hạn
    biển số").
  - Its statement is trimmed the same way as `save_fact`'s: newest first,
    within 2,000 characters, one statement per line (line breaks inside a
    statement become spaces), instead of refusing once the statement is full.
  - After a plate or driver change on a route fact, it runs the same identity
    check under the lock. When the result would equal another saved route
    fact, it refuses and names that fact.
- Admin prompt, trip-facts section
  - Before: list, then save if nothing exists, else update; "đổi tuyến" uses
    `update_fact`.
  - After: for any stated route fact, call `save_fact`. The server adds or
    updates. Call it before any search or report tool in the same turn. If the
    change guard refuses it, say nothing was saved and ask the admin to send
    the fact on its own. Use `update_fact` only to remove a value or to change
    the plate or driver scope. A different route is never an update. When the
    admin asks to change a route, explain this and offer to save the new route
    and delete the old one. Reply from `action`: "Đã lưu thông tin mới", or
    "Đã cập nhật thông tin cũ" with each replaced value old → new and each
    added value, or "Đã có thông tin này, không đổi giá trị nào". On
    `ambiguous`, list the candidates and ask which one.
- Admin prompt, added after review (owner-approved, production 18/11): when
  the admin states a route or standing fact, `save_fact` is the first tool of
  the turn, with no member-data tool (`search_records`, `list_organizations`,
  `list_documents`, …) before it, so the change guard does not refuse it.
  Company names go in as written; `save_fact` resolves them. The honesty
  rule's "search before saying it isn't saved" does not apply to saving a fact
  the admin just stated. A plate comes only from the admin's current message.
- README, the facts part of "Admins ask the bot": same route updates, a
  different route adds, and route changes are refused.

Tests: none. This repository adds no tests unless the owner asks for them. The
steps above are the check.

## Revert cost

`save_fact` always adds again, and `update_fact` can change routes again.
Facts saved or updated in the meantime stay as they are.
