# Handshake

Escrow with a brain: one deal link that lets two strangers trust each other with money.

Built for the SERV Hackathon, Edition 02.

## The problem

Deals between strangers online break in three places. The buyer pays first and the seller vanishes. The seller delivers first and the buyer never pays. Or they disagree about the work, and it is one person's word against the other's.

Handshake locks the money before work starts, pays it out when the work is done, and settles disagreements with a ruling both sides can read step by step.

## What it does

1. The payer writes a deal in plain words and gets a link to send.
2. SERV Reasoning turns the terms into numbered, checkable conditions and lists what the terms leave open.
3. The payee accepts. The payer locks the money in an escrow session.
4. Work delivered: the payer releases the money with one click.
5. Disagreement: both sides add evidence and ask for a verdict. SERV Reasoning rules condition by condition, cites the evidence it relied on, and explains each step.
6. Both accept the verdict, or either side appeals once for a final ruling at higher reasoning effort. Then the money pays out. If nobody appeals within 12 hours (`VERDICT_WINDOW_HOURS`), the verdict pays out on its own, so a losing party cannot stall it.

## How it uses SERV Reasoning

All reasoning goes through the SERV endpoint with the OpenAI SDK (`lib/serv.js`).

- Schema-bound output. Both the contract and the verdict are requested with `response_format: json_schema`, so the app receives data, not prose.
- Shadow Agent. Verdict requests include the `serv_shadow_agent` tool with a hint: every finding must cite submitted evidence and the ruling must follow from the findings.
- Reasoning effort. Contracts use `low`, verdicts `medium`, appeals `high`.

The model never moves money. Its verdict passes a second set of checks in code (`checkVerdict` in `lib/judge.js`): every condition has exactly one finding, every cited evidence id exists, and the ruling matches the findings. A verdict that fails twice escalates and the money stays locked.

## The escrow session

`lib/escrow.js` gives the agent a leash shaped like a Kite Passport Session: a budget equal to the locked amount, a time limit, and an allowed-payee list of the two parties plus a capped fee. Payments outside those limits throw.

Status: the session is enforced in this app's code and settles on an internal ledger with test money. It is not yet connected to Kite Passport or any real payment rail.

## Run it

Needs Node 18 or newer.

```
npm install
copy .env.example .env
```

Put your key from https://console.openserv.ai into `.env` as `SERV_API_KEY`, then:

```
npm start
```

Open http://localhost:3000. The app needs the key: without one, creating a deal returns an error.

```
npm test
```

runs the escrow, verdict-check and full-flow tests against a running server. To run them without spending credits, start the server with a stub in a second terminal first: `set HANDSHAKE_STUB=1 && npm start`.

## Deploy on Vercel

The repo is set up for Vercel: `public/` is served as the site and `api/index.js` runs the Express app as a function (`vercel.json`).

1. Import the repo at vercel.com and deploy. No build settings are needed.
2. In the project settings, add the environment variable `SERV_API_KEY`.
3. In the project's Storage tab, add an Upstash Redis database and connect it to the project. Vercel functions have no disk, so deals are kept in Redis there. The connection adds its own environment variables.
4. Redeploy so the function picks up the variables.

Any always-on Node host also works without Redis: run `npm start` and deals are kept in `data/deals.json`.

## Business model

A 1.5% fee on the part of the pot released to the payee. Refunds are free.

## Not built yet

- Real settlement (Kite Passport session, x402, or card rails)
- File uploads as evidence; today evidence is text and links, and the agent treats a link as a claim
- Accounts; today each party's private link is their key
