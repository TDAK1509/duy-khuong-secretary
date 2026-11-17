# The repository states its product direction

## The mindset of this PR

- Goal: Anyone who works in this repository, a person or Claude, reads in
  `CLAUDE.md` and the README that the app serves transportation companies
  only, and knows which areas to focus on.
- What matters most: 1. `CLAUDE.md` holds the direction, because Claude reads
  it at the start of every session. 2. The README intro says the same thing.
  3. The text is short enough to be read in full.
- Out of scope: Any code change. Any other README section.

## Outcome

Brief: `CLAUDE.md` and the README intro describe the app as a secretary for
transportation companies: who uses it, what each role can do, and where work
should focus.

Before: `CLAUDE.md` holds only two required rules. The README opens with "A
Vietnamese Zalo chat assistant for truck companies." and says nothing about
roles or focus.
After: `CLAUDE.md` has a "Product direction" section, and the README intro
describes the same direction in a few sentences.

Steps:

- Open `CLAUDE.md`. A "Product direction" section sits above "Required rules".
- The section names the customer (transportation companies) and both roles
  (drivers and admins), and says what each role can do.
- Open `README.md`. Its first paragraph describes the same direction.
- Start a new Claude Code session in the repository and ask "Who is this app
  for?". The answer names transportation companies, drivers and admins.

## Solution

- `CLAUDE.md`: add a "Product direction" section above "Required rules", with
  this content:
  - Customer: transportation (trucking) companies only. The app acts as the
    company's secretary on Zalo.
  - It receives receipts, weigh tickets, invoices, photos, files and texts from
    the company's members, and stores them in an organized way. Admins later
    search, filter and extract that data for reports.
  - Drivers (members): upload images, documents and texts, and ask only about
    the data they uploaded. Their behavior stays as it is.
  - Admins: upload like drivers, including uploads made for a named driver.
    They state standing facts about trips, vehicles and drivers (for example
    driver wage, freight rate per ton, allowance, billing customer for a
    vehicle and route). A fact applies to every matching document, past and
    future, from one place: facts are the single source of truth for those
    values. Admins ask for reports, analyses and answers about the saved data,
    and the bot answers as well as a general-purpose LLM chat would.
  - Focus areas: document intake and reading, facts linked to documents,
    admin reports and analysis in chat. Work outside these areas needs a
    reason.
- `README.md`: replace the first sentence with two or three sentences carrying
  the same direction: transportation companies, drivers upload, admins upload,
  state facts and get reports.

Tests: none. This PR only changes documentation, and this repository adds no
tests unless the owner asks for them.

## Revert cost

Nothing in production. The two files go back to their old text.
