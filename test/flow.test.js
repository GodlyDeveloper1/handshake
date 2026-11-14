// End-to-end check against a running server in demo mode (no SERV key).
// Usage: node test/flow.test.js [baseUrl]
import assert from "node:assert/strict";
import { openSession, pay, settle, EscrowError } from "../lib/escrow.js";
import { checkVerdict } from "../lib/judge.js";

const base = process.argv[2] || "http://localhost:3000";
const call = async (path, token, body) => {
  const res = await fetch(base + "/api" + path, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", ...(token ? { "x-deal-token": token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, ...(await res.json()) };
};

// Escrow limits
{
  const s = openSession({ amount: 10000, payerId: "payer", payeeId: "payee" });
  assert.throws(() => pay(s, "attacker", 1), EscrowError, "unknown payee refused");
  assert.throws(() => pay(s, "payee", 10001), EscrowError, "over budget refused");
  assert.throws(() => pay(s, "handshake-fee", 151), EscrowError, "fee cap enforced");
  const r = settle(s, { payerId: "payer", payeeId: "payee", payeePercent: 60 });
  assert.deepEqual(r, { payeeNet: 5910, fee: 90, payerBack: 4000 });
  assert.equal(s.spent, 10000);
  assert.throws(() => pay(s, "payee", 1), EscrowError, "closed session refused");
}

// Verdict checks
{
  const deal = { contract: { conditions: [{ id: "c1" }, { id: "c2" }] }, evidence: [{ id: "e1" }] };
  const f = (id, status, ev = ["e1"]) => ({ condition_id: id, status, evidence_ids: ev, reasoning: "x" });
  assert.equal(checkVerdict(deal, { findings: [f("c1", "met"), f("c2", "met")], ruling: "release", payee_percent: 100 }), null);
  assert.match(checkVerdict(deal, { findings: [f("c1", "met"), f("c2", "met")], ruling: "refund", payee_percent: 0 }), /must be release/);
  assert.match(checkVerdict(deal, { findings: [f("c1", "met", ["e9"]), f("c2", "met")], ruling: "release", payee_percent: 100 }), /never submitted/);
  assert.match(checkVerdict(deal, { findings: [f("c1", "met")], ruling: "release", payee_percent: 100 }), /no finding/);
  assert.match(checkVerdict(deal, { findings: [f("c1", "met"), f("c2", "not_met")], ruling: "split", payee_percent: 100 }), /1 to 99/);
}

// Full flow over HTTP
{
  const made = await call("/deals", null, {
    title: "Logo design", payerName: "Maya", payeeName: "Jonas", amount: 400,
    terms: "Jonas delivers 3 logo concepts by Friday. Maya gets 2 rounds of changes. Final files as SVG and PNG.",
  });
  assert.equal(made.status, 200);
  const id = made.deal.id, payer = made.token, payee = made.deal.inviteToken;
  assert.ok(payee && payee !== payer);

  const pub = await call(`/deals/${id}`);
  assert.equal(pub.deal.role, null);
  assert.equal(JSON.stringify(pub).includes(payer), false, "tokens not leaked to visitors");
  assert.equal(JSON.stringify(pub).includes(payee), false);
  const asPayee = await call(`/deals/${id}`, payee);
  assert.equal(JSON.stringify(asPayee).includes(payer), false, "payer token not leaked to payee");

  assert.equal((await call(`/deals/${id}/fund`, payer, {})).status, 409, "cannot lock before acceptance");
  assert.equal((await call(`/deals/${id}/accept`, payer, {})).status, 403, "payer cannot accept");
  assert.equal((await call(`/deals/${id}/accept`, payee, {})).status, 200);
  assert.equal((await call(`/deals/${id}/fund`, payee, {})).status, 403, "payee cannot lock");
  assert.equal((await call(`/deals/${id}/fund`, payer, {})).deal.status, "locked");
  assert.equal((await call(`/deals/${id}/release`, payee, {})).status, 403, "payee cannot release");
  assert.equal((await call(`/deals/${id}/judge`, payee, {})).status, 409, "no verdict without dispute");
  assert.equal((await call(`/deals/${id}/evidence`, null, { text: "x" })).status, 403);
  assert.equal((await call(`/deals/${id}/evidence`, payee, { text: "x", url: "javascript:alert(1)" })).status, 400);

  await call(`/deals/${id}/evidence`, payee, { text: "Sent 3 concepts on Thursday.", url: "https://example.com/logos" });
  assert.equal((await call(`/deals/${id}/dispute`, payer, {})).deal.status, "disputed");
  await call(`/deals/${id}/evidence`, payer, { text: "Only 1 concept arrived and no SVG files." });
  const judged = await call(`/deals/${id}/judge`, payee, {});
  assert.equal(judged.deal.status, "judged");
  assert.equal(judged.deal.payout, null, "nothing paid before acceptance");
  assert.equal((await call(`/deals/${id}/settle`, payer, {})).deal.status, "judged");
  const done = await call(`/deals/${id}/settle`, payee, {});
  assert.equal(done.deal.status, "judged_final");
  const p = done.deal.payout;
  assert.equal(p.payeeNet + p.fee + p.payerBack, 40000, "every cent accounted for");
  assert.equal(done.deal.session.closed, true);
  assert.match(done.deal.seal, /^[a-f0-9]{64}$/);
  assert.equal((await call(`/deals/${id}/release`, payer, {})).status, 409, "no double payout");
  assert.equal((await call(`/deals/${id}/appeal`, payer, { text: "again" })).status, 409);
}

// Appeal path
{
  const made = await call("/deals", null, { title: "Appeal run", payerName: "A", payeeName: "B", amount: 50, terms: "B writes a 500 word article about tea." });
  const id = made.deal.id, payer = made.token, payee = made.deal.inviteToken;
  await call(`/deals/${id}/accept`, payee, {});
  await call(`/deals/${id}/fund`, payer, {});
  await call(`/deals/${id}/dispute`, payee, {});
  await call(`/deals/${id}/judge`, payee, {});
  const ap = await call(`/deals/${id}/appeal`, payee, { text: "I delivered, see the link." });
  assert.equal(ap.deal.status, "judged_final");
  assert.ok(ap.deal.payout);
  assert.equal(ap.deal.appealUsed, true);
}
console.log("All checks passed.");
