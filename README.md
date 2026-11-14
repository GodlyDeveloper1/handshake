# Handshake

Escrow with a brain: one deal link that lets two strangers trust each other with money.

Built for the SERV Hackathon, Edition 02.

## What it does

1. The payer writes a deal in plain words and gets a link to send.
2. SERV Reasoning turns the terms into numbered, checkable conditions and lists what the terms leave open.
3. The payee accepts. The payer locks the money in an escrow session.
4. Work delivered: the payer releases the money with one click.
5. Disagreement: both sides add evidence and ask for a verdict. SERV Reasoning rules condition by condition, cites the evidence it relied on, and explains each step.
6. Both accept the verdict, or either side appeals once for a final ruling at higher reasoning effort. Then the money pays out.

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

Open http://localhost:3000. Without a key the app runs in demo mode with placeholder verdicts, and the page says so.

```
npm test
```

runs the escrow, verdict-check and full-flow tests against a running server.

## Deploy

Any Node host works. On Render: new Web Service from this repo, build command `npm install`, start command `npm start`, and add `SERV_API_KEY` as an environment variable. Deals are kept in a JSON file, so they reset when the host restarts.

## Business model

A 1.5% fee on the part of the pot released to the payee. Refunds are free.

## Not built yet

- Real settlement (Kite Passport session, x402, or card rails)
- File uploads as evidence; today evidence is text and links, and the agent treats a link as a claim
- Automatic payout if one side never responds to a verdict
- Accounts; today each party's private link is their key
