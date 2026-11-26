# Claude instructions for this repository

## Product direction

- Customer: transportation (trucking) companies only. The app acts as the company's secretary on Zalo.
- It receives receipts, weigh tickets, invoices, photos, files and texts from the company's members, and stores them in an organized way. Admins later search, filter and extract that data for reports.
- Drivers (members): only upload images, documents and texts. The bot stores the data and does not answer their questions.
- Admins: upload like drivers, including uploads made for a named driver. They state standing facts about trips, vehicles and drivers, for example driver wage, freight rate per ton, allowance, or the billing customer for a vehicle and route. A fact applies to every matching document, past and future, from one place: facts are the single source of truth for those values. Admins ask for reports, analyses and answers about the saved data, and the bot answers as well as a general-purpose LLM chat would.
- Focus areas: document intake and reading, facts linked to documents, admin reports and analysis in chat. Work outside these areas needs a reason.

## Required rules

- This is a personal project. Never post a "shipped" announcement for work in this repository: do not run the `shipped` skill, and do not post to any company Slack channel about it.
- Do not add tests (unit, integration, mutation or CI test jobs) unless the user explicitly asks for them.
