// The escrow session is the agent's leash. It follows the shape of a Kite
// Passport Session: a budget, a time limit and a list of allowed payees.
// The limits are enforced here in code, so no model output can move money
// outside them. Funds are test money; settlement is an internal ledger.
import crypto from "node:crypto";

export const FEE_BPS = 150; // 1.5%, charged only on money released to the payee
export const PLATFORM = "handshake-fee";

export class EscrowError extends Error {}

export function openSession({ amount, payerId, payeeId, days = 30 }) {
  if (!Number.isInteger(amount) || amount <= 0) throw new EscrowError("Amount must be a positive number of cents.");
  return {
    id: "ses_" + crypto.randomBytes(6).toString("hex"),
    budget: amount,
    spent: 0,
    allowedPayees: [payerId, payeeId, PLATFORM],
    feeCap: Math.floor((amount * FEE_BPS) / 10000),
    expiresAt: Date.now() + days * 86400000,
    closed: false,
    ledger: [{ at: Date.now(), type: "lock", from: payerId, amount }],
  };
}

export function pay(session, to, amount, memo) {
  if (session.closed) throw new EscrowError("Session is closed.");
  if (Date.now() > session.expiresAt) throw new EscrowError("Session has expired.");
  if (!session.allowedPayees.includes(to)) throw new EscrowError(`Payee ${to} is not allowed on this session.`);
  if (!Number.isInteger(amount) || amount < 0) throw new EscrowError("Invalid amount.");
  if (session.spent + amount > session.budget) throw new EscrowError("Payment would exceed the session budget.");
  if (to === PLATFORM) {
    const feesSoFar = session.ledger.filter((l) => l.to === PLATFORM).reduce((s, l) => s + l.amount, 0);
    if (feesSoFar + amount > session.feeCap) throw new EscrowError("Fee would exceed the fee cap.");
  }
  if (amount === 0) return;
  session.spent += amount;
  session.ledger.push({ at: Date.now(), type: "pay", to, amount, memo });
}

// Split the pot by a percentage to the payee, take the fee from the payee's
// share, send the rest back to the payer, then close the session.
export function settle(session, { payerId, payeeId, payeePercent, memo }) {
  if (!Number.isInteger(payeePercent) || payeePercent < 0 || payeePercent > 100) {
    throw new EscrowError("Payee percent must be a whole number from 0 to 100.");
  }
  const pot = session.budget - session.spent;
  const payeeGross = Math.floor((pot * payeePercent) / 100);
  const fee = Math.floor((payeeGross * FEE_BPS) / 10000);
  const payeeNet = payeeGross - fee;
  const payerBack = pot - payeeGross;
  pay(session, payeeId, payeeNet, memo);
  pay(session, PLATFORM, fee, "fee");
  pay(session, payerId, payerBack, memo);
  session.closed = true;
  return { payeeNet, fee, payerBack };
}
