import "./lib/env.js";
import express from "express";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { store } from "./lib/store.js";
import { openSession, settle, EscrowError, FEE_BPS } from "./lib/escrow.js";
import { compileContract, judge } from "./lib/judge.js";
import { LIVE, MODEL } from "./lib/serv.js";

const app = express();
app.use(express.json({ limit: "100kb" }));
const here = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(here, "public")));

const token = () => crypto.randomBytes(16).toString("hex");
const clean = (s, max) => String(s ?? "").trim().slice(0, max);
const fail = (res, code, message) => res.status(code).json({ error: message });
const busy = new Set();

function roleOf(deal, t) {
  if (t && t === deal.payer.token) return "payer";
  if (t && t === deal.payee.token) return "payee";
  return null;
}

function log(deal, text) {
  deal.timeline.push({ at: Date.now(), text });
}

function seal(deal) {
  const record = JSON.stringify({ contract: deal.contract, evidence: deal.evidence, verdict: deal.verdict, payout: deal.payout });
  return crypto.createHash("sha256").update(record).digest("hex");
}

// What a caller may see. Tokens never leave the server except to their owner.
function view(deal, role) {
  const { payer, payee, session, ...rest } = deal;
  const out = {
    ...rest,
    payer: { name: payer.name },
    payee: { name: payee.name },
    session: session && {
      id: session.id, budget: session.budget, spent: session.spent,
      expiresAt: session.expiresAt, closed: session.closed, ledger: session.ledger,
    },
    role,
    live: LIVE,
    feeBps: FEE_BPS,
  };
  if (role === "payer") out.inviteToken = payee.token;
  return out;
}

function load(req, res) {
  const deal = store.get(req.params.id);
  if (!deal) return fail(res, 404, "No deal with that link."), {};
  return { deal, role: roleOf(deal, req.get("x-deal-token")) };
}

function payout(deal, payeePercent, memo) {
  const result = settle(deal.session, { payerId: "payer", payeeId: "payee", payeePercent, memo });
  deal.payout = { ...result, payeePercent, at: Date.now() };
  deal.seal = seal(deal);
}

app.get("/api/status", (_req, res) => res.json({ live: LIVE, model: LIVE ? MODEL : null, feeBps: FEE_BPS }));

app.post("/api/deals", async (req, res) => {
  const title = clean(req.body.title, 120);
  const terms = clean(req.body.terms, 4000);
  const payerName = clean(req.body.payerName, 60);
  const payeeName = clean(req.body.payeeName, 60);
  const amount = Math.round(Number(req.body.amount) * 100);
  if (!title || !terms || !payerName || !payeeName) return fail(res, 400, "Fill in the deal name, both names and the terms.");
  if (!Number.isFinite(amount) || amount < 100 || amount > 100000000) return fail(res, 400, "Enter an amount of at least 1.");
  const deal = {
    id: crypto.randomBytes(5).toString("hex"),
    createdAt: Date.now(),
    title, terms, amount, currency: "USD (test)",
    payer: { name: payerName, token: token() },
    payee: { name: payeeName, token: token() },
    status: "awaiting_payee",
    contract: null, evidence: [], verdict: null, payout: null, session: null,
    appealUsed: false, timeline: [],
  };
  try {
    const { data, meta } = await compileContract(deal);
    if (!data.conditions.length) return fail(res, 422, "The terms did not contain anything checkable. Say what must be delivered.");
    deal.contract = { ...data, meta };
  } catch (err) {
    console.error(err);
    return fail(res, 502, "The reasoning service did not answer. Try again in a moment.");
  }
  log(deal, `${payerName} wrote the deal.`);
  store.save(deal);
  res.json({ deal: view(deal, "payer"), token: deal.payer.token });
});

app.get("/api/deals/:id", (req, res) => {
  const { deal, role } = load(req, res);
  if (deal) res.json({ deal: view(deal, role) });
});

app.post("/api/deals/:id/accept", (req, res) => {
  const { deal, role } = load(req, res);
  if (!deal) return;
  if (role !== "payee") return fail(res, 403, "Only the payee can accept this deal.");
  if (deal.status !== "awaiting_payee") return fail(res, 409, "This deal was already accepted.");
  deal.status = "awaiting_funds";
  log(deal, `${deal.payee.name} accepted the conditions.`);
  res.json({ deal: view(store.save(deal), role) });
});

app.post("/api/deals/:id/fund", (req, res) => {
  const { deal, role } = load(req, res);
  if (!deal) return;
  if (role !== "payer") return fail(res, 403, "Only the payer can lock the money.");
  if (deal.status !== "awaiting_funds") return fail(res, 409, "The money can be locked once the payee has accepted, and only once.");
  deal.session = openSession({ amount: deal.amount, payerId: "payer", payeeId: "payee" });
  deal.status = "locked";
  log(deal, `${deal.payer.name} locked ${deal.amount / 100} ${deal.currency}.`);
  res.json({ deal: view(store.save(deal), role) });
});

app.post("/api/deals/:id/evidence", (req, res) => {
  const { deal, role } = load(req, res);
  if (!deal) return;
  if (!role) return fail(res, 403, "Only the two parties can add evidence.");
  if (!["locked", "disputed"].includes(deal.status)) return fail(res, 409, "Evidence can be added while the money is locked.");
  const text = clean(req.body.text, 2000);
  const url = clean(req.body.url, 500);
  if (!text) return fail(res, 400, "Write what this evidence shows.");
  if (url && !/^https?:\/\//i.test(url)) return fail(res, 400, "Links must start with http:// or https://");
  if (deal.evidence.filter((e) => e.role === role).length >= 8) return fail(res, 409, "Each side can add up to 8 pieces of evidence.");
  deal.evidence.push({ id: `e${deal.evidence.length + 1}`, role, text, url, at: Date.now() });
  log(deal, `${deal[role].name} added evidence.`);
  res.json({ deal: view(store.save(deal), role) });
});

// Happy path: the payer confirms delivery and the money goes out. No AI needed.
app.post("/api/deals/:id/release", (req, res) => {
  const { deal, role } = load(req, res);
  if (!deal) return;
  if (role !== "payer") return fail(res, 403, "Only the payer can release the money.");
  if (!["locked", "disputed"].includes(deal.status)) return fail(res, 409, "There is no locked money to release.");
  try {
    payout(deal, 100, "released by payer");
  } catch (err) {
    return fail(res, 409, err.message);
  }
  deal.status = "released";
  log(deal, `${deal.payer.name} confirmed delivery. Money released.`);
  res.json({ deal: view(store.save(deal), role) });
});

app.post("/api/deals/:id/dispute", (req, res) => {
  const { deal, role } = load(req, res);
  if (!deal) return;
  if (!role) return fail(res, 403, "Only the two parties can open a dispute.");
  if (deal.status !== "locked") return fail(res, 409, "A dispute can be opened while the money is locked.");
  deal.status = "disputed";
  log(deal, `${deal[role].name} opened a dispute.`);
  res.json({ deal: view(store.save(deal), role) });
});

async function runJudge(deal, res, role, { effort, appeal }) {
  if (busy.has(deal.id)) return fail(res, 409, "A verdict is already being worked out.");
  busy.add(deal.id);
  try {
    const result = await judge(deal, { effort });
    if (!result.ok) {
      deal.status = "escalated";
      deal.escalation = { reason: result.reason, meta: result.meta };
      log(deal, "The verdict failed its checks twice. Money stays locked for human review.");
      return res.json({ deal: view(store.save(deal), role) });
    }
    if (appeal) {
      deal.firstVerdict = deal.verdict;
      deal.appealUsed = true;
    }
    deal.verdict = { ...result.verdict, meta: result.meta, at: Date.now(), final: Boolean(appeal) };
    deal.status = appeal ? "judged_final" : "judged";
    log(deal, appeal ? "Appeal verdict issued. It is final." : "Verdict issued. Either side can appeal once.");
    if (appeal) {
      payout(deal, deal.verdict.payee_percent, "appeal verdict");
      log(deal, "Money paid out.");
    }
    res.json({ deal: view(store.save(deal), role) });
  } catch (err) {
    console.error(err);
    if (err instanceof EscrowError) return fail(res, 409, err.message);
    fail(res, 502, "The reasoning service did not answer. Nothing was paid. Try again.");
  } finally {
    busy.delete(deal.id);
  }
}

app.post("/api/deals/:id/judge", (req, res) => {
  const { deal, role } = load(req, res);
  if (!deal) return;
  if (!role) return fail(res, 403, "Only the two parties can ask for a verdict.");
  if (deal.status !== "disputed") return fail(res, 409, "Open a dispute before asking for a verdict.");
  runJudge(deal, res, role, { effort: "medium", appeal: false });
});

// Accepting a verdict pays it out. Both sides see the reasoning first.
app.post("/api/deals/:id/settle", (req, res) => {
  const { deal, role } = load(req, res);
  if (!deal) return;
  if (!role) return fail(res, 403, "Only the two parties can settle.");
  if (deal.status !== "judged") return fail(res, 409, "There is no open verdict to settle.");
  deal.accepted = deal.accepted || {};
  deal.accepted[role] = true;
  log(deal, `${deal[role].name} accepted the verdict.`);
  if (deal.accepted.payer && deal.accepted.payee) {
    try {
      payout(deal, deal.verdict.payee_percent, "verdict accepted");
    } catch (err) {
      return fail(res, 409, err.message);
    }
    deal.status = "judged_final";
    deal.verdict.final = true;
    log(deal, "Money paid out.");
  }
  res.json({ deal: view(store.save(deal), role) });
});

app.post("/api/deals/:id/appeal", (req, res) => {
  const { deal, role } = load(req, res);
  if (!deal) return;
  if (!role) return fail(res, 403, "Only the two parties can appeal.");
  if (deal.status !== "judged" || deal.appealUsed) return fail(res, 409, "This deal has no appeal left.");
  const text = clean(req.body.text, 2000);
  if (!text) return fail(res, 400, "Say what the verdict got wrong.");
  deal.evidence.push({ id: `e${deal.evidence.length + 1}`, role, text: `Appeal: ${text}`, url: "", at: Date.now() });
  log(deal, `${deal[role].name} appealed.`);
  runJudge(deal, res, role, { effort: "high", appeal: true });
});

app.get("*", (_req, res) => res.sendFile(path.join(here, "public", "index.html")));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Handshake on http://localhost:${port} (${LIVE ? "SERV live, " + MODEL : "demo mode, no SERV key"})`));
