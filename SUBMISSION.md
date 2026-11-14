# Submission write-up (paste into the Typeform)

**Project:** Handshake

**Track:** Open (switch to Kite only if the escrow session is wired to Kite Passport before submitting)

**What it does**
Handshake is a deal link that lets two strangers trust each other with money. One person writes a deal in plain words and locks the payment. If the work is delivered, they release it with one click. If they disagree, both sides submit evidence and an agent rules on it, condition by condition, showing the evidence it relied on for every step. The money then pays out by that ruling.

**How it uses SERV Reasoning**
Every reasoning step runs on SERV Reasoning through the OpenAI SDK. SERV turns the informal terms into checkable conditions, and later issues the verdict, both as schema-bound JSON. Verdict requests run with the Shadow Agent, hinted to reject findings that cite no evidence. Appeals re-run at higher reasoning effort. The verdict is then checked again in code before any money moves, and the agent can only pay the two parties, never more than the locked amount.

**What was built during the hackathon**
Everything: the server, escrow session, SERV integration, verdict checks, web app and tests.

**Revenue**
1.5% of money released to the payee. Refunds are free.

**Links**
- Repo:
- Demo:
- X post:
