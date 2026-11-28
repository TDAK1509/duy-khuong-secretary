# PR 7 of 12 — The trip report treats a paper issued by the pickup company as the pickup end

Depends on: PR 2 of 12, "Standing facts become company knowledge entries with fixed outcomes".

What this PR needs from PR 2:

- `company_knowledge_entries` holds one row per thing the admin taught the company.
- Its pickup condition is in `when_pickup_name` / `when_pickup_match_key`, with optional company picks in `company_knowledge_companies` (slot `pickup`) when `when_pickup_resolved` is true.
- `company_knowledge_links` holds one row per entry and paper it applies to.

## Done when

- In the trip report, a paper saved with stage `receipt` is listed as a pickup paper when its issuer is the pickup company of a linked entry.
- That paper pairs with the trip's real drop-off paper, so the trip shows both ends.
- A receipt-stage paper issued by any other company stays a drop-off paper, as today.

## Before / After

Before: The pickup factory's weigh tickets were saved with stage `receipt`. The trip report lists them as drop-off papers. Each trip shows the pickup ticket and the drop-off ticket as two half trips, "Không ghép được đơn" twice.

After: An entry says pickup = `<pickup company>`. The trip report lists the tickets issued by `<pickup company>` as pickup papers, and pairs each one with its drop-off ticket. Old papers are fixed with no reread.

## Solution

- Trip paper lists (`src/app/trips/list-trip-papers.ts`):
  - Before: `listTripPapers` excludes every paper with stage `receipt`, and `listReceiptPapers` takes every receipt-stage trip ticket.
  - After: a paper counts as a pickup paper, not a receipt, when it is linked to an entry whose pickup condition company is the paper's `issuer` party. This holds whatever the paper's saved stage is. Every other paper is listed as today.
  - The company matches the same way linking does: by match key, by alias, or by company pick when the slot is resolved.
- The paper's saved stage does not change. Only the trip report's view changes.
- No LLM-facing text changes.

### Tests, in order

1. Backend (integration): A receipt-stage ticket issued by the entry's pickup company is listed as a pickup.

   - Setup: An entry with `when_pickup` "Alpha". An accepted receipt-stage weigh ticket whose issuer is "Alpha", linked to the entry.
   - Input: List the trip papers for that day.
   - Expected: The ticket is in the pickup list and not in the receipt list.

2. Backend (integration): A ticket issued under an alias of the pickup company is listed as a pickup.

   - Setup: An entry with `when_pickup` "Alpha". The saved company "Alpha Group" has the alias "Alpha". An accepted receipt-stage weigh ticket whose issuer is "Alpha Group", linked to the entry.
   - Input: List the trip papers for that day.
   - Expected: The ticket is in the pickup list.

3. Backend (integration): A receipt-stage ticket issued by another company stays a receipt.

   - Setup: An entry with `when_pickup` "Alpha". An accepted receipt-stage weigh ticket whose issuer is "Beta" and that prints "Alpha" as supplier, linked to the entry.
   - Input: List the trip papers for that day.
   - Expected: The ticket is in the receipt list.

4. Backend (integration): The pickup-company ticket pairs with the drop-off ticket in the report.

   - Setup: An entry with `when_pickup` "Alpha". An accepted receipt-stage ticket issued by "Alpha", plate 51C12345, 27080 kg, linked to the entry. An accepted receipt-stage ticket issued by "Beta", plate 51C12345, 27060 kg, on the next day.
   - Input: Build the trip report for those two days.
   - Expected: One row holds both tickets, marked "Khớp trọng lượng".

## Revert cost

Nothing breaks. The report goes back to listing those tickets as drop-off papers.

## Production manual test

> Needs a human test: the agent cannot send a Zalo message as an admin. A person performs step 2.

- Find a month with such tickets. Get the workspace with this read-only query through `ssh render_personal`: `SELECT id FROM workspaces;`. Then run:

  ```sql
  SELECT to_char(d.document_date, 'YYYY-MM') AS month, count(*) AS tickets, min(d.id::text) AS sample_id
  FROM documents d
  JOIN company_knowledge_links l ON l.document_id = d.id
  JOIN company_knowledge_entries e ON e.id = l.entry_id AND e.when_pickup_match_key IS NOT NULL
  JOIN document_parties p ON p.document_id = d.id AND p.role = 'issuer'
  WHERE d.workspace_id = '<workspace id>' AND d.stage = 'receipt' AND (
    (NOT e.when_pickup_resolved AND (p.match_key = e.when_pickup_match_key
      OR EXISTS (SELECT 1 FROM organization_aliases a WHERE a.organization_id = p.organization_id AND a.match_key = e.when_pickup_match_key)))
    OR (e.when_pickup_resolved AND EXISTS (SELECT 1 FROM company_knowledge_companies c WHERE c.entry_id = e.id AND c.slot = 'pickup' AND c.organization_id = p.organization_id))
  )
  GROUP BY 1 ORDER BY 2 DESC LIMIT 3;
  ```

  Note the top month and its `sample_id`.
- A person, as the admin, asks for the trip report of that month and forwards the link.
- Get the sample ticket's number with `SELECT document_number, vehicle_plate, document_date FROM documents WHERE id = '<sample_id>';`.
- The agent downloads the file. The row with that ticket number in the pickup column also has a drop-off ticket number, and it is not "Không ghép được đơn".
