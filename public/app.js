const app = document.getElementById("app");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (cents) => "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const time = (t) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

let token = null;
let lastJson = "";
let lastStatus = null;
let timer = null;

async function api(path, body) {
  const res = await fetch("/api" + path, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", ...(token ? { "x-deal-token": token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong. Try again.");
  return data;
}

function remember(id, t) {
  try { localStorage.setItem("hs:" + id, t); } catch {}
}
function recall(id) {
  try { return localStorage.getItem("hs:" + id); } catch { return null; }
}

/* ---------- Home ---------- */
let stageTimer = null;
function playStage() {
  const slip = document.getElementById("slip");
  const seal = document.getElementById("seal");
  if (!slip) return;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let step = still ? 4 : 1;
  const show = () => { slip.dataset.step = step; seal.innerHTML = step === 4 ? "Paid<br>out" : "Money<br>locked"; };
  show();
  if (still) return;
  stageTimer = setInterval(() => {
    if (!document.body.contains(slip)) return clearInterval(stageTimer);
    step = step === 4 ? 1 : step + 1;
    show();
  }, 2600);
}

// Reveal rows as they scroll into view. One observer, then it lets go.
function reveal() {
  const items = app.querySelectorAll("[data-reveal], .rows li, .trio div");
  if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    items.forEach((el) => el.classList.add("in"));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add("in");
      io.unobserve(e.target);
    }
  }, { threshold: 0.35 });
  items.forEach((el) => { el.classList.add("pre"); io.observe(el); });
}

function home() {
  clearInterval(timer);
  clearInterval(stageTimer);
  document.title = "Handshake: a deal link two strangers can trust";
  app.className = "home";
  app.innerHTML = `
  <section class="hero">
    <div>
      <h1 class="rise">${"Trust a stranger with money.".split(" ").map((w, i) => `<span><i style="animation-delay:${i * 70}ms">${w}</i></span>`).join(" ")}</h1>
      <p class="lede">Write the deal in your own words. The money locks until the work is done. If you disagree, an agent rules on the evidence and shows every step of its reasoning.</p>
      <div class="cta-row">
        <a class="btn gold" href="#write">Write a deal</a>
        <a class="btn plain" href="#how">How it works</a>
      </div>
    </div>
    <div class="slip" id="slip" data-step="1" aria-label="Example: a $400 logo deal between Maya and Jonas, from lock to payout">
      <div class="top"><span>Handshake deal</span><span>Logo design</span></div>
      <div>Held for Maya and Jonas</div>
      <div class="big">$400.00</div>
      <span class="seal" id="seal">Money<br>locked</span>
      <dl>
        <div class="row s2 cut"><dt>Jonas says</dt><dd>3 concepts sent Thursday</dd></div>
        <div class="row s2"><dt>Maya says</dt><dd>never got the SVG files</dd></div>
        <div class="row s3 cut"><dt>Concepts delivered</dt><dd>met</dd></div>
        <div class="row s3"><dt>Rounds of changes</dt><dd>met</dd></div>
        <div class="row s3"><dt>Final files</dt><dd>not met</dd></div>
        <div class="row s4 cut"><dt>Jonas receives</dt><dd>$263.98</dd></div>
        <div class="row s4"><dt>Maya gets back</dt><dd>$132.00</dd></div>
      </dl>
    </div>
  </section>

  <section class="band" id="why">
    <h2>Deals between strangers break in three places.</h2>
    <ul class="pain">
      <li data-reveal><h3><span>You pay first. They vanish.</span></h3><p>With Handshake the money is locked, not sent. The other person can see it is there, but only gets it when the work is done.</p></li>
      <li data-reveal><h3><span>You deliver first. They never pay.</span></h3><p>The money is locked before you start. A buyer who goes quiet cannot keep it: the verdict pays out on its own after 12 hours.</p></li>
      <li data-reveal><h3><span>You disagree. It is your word against theirs.</span></h3><p>A neutral agent rules on the evidence, condition by condition, and shows every step. The money follows the ruling, not whoever shouts loudest.</p></li>
    </ul>
  </section>

  <section class="band" id="how">
    <h2>How a deal runs.</h2>
    <ol class="rows">
      <li><h3>Write it</h3><p>Describe the deal the way you would in a message: what must be delivered, by when, for how much. It becomes a short numbered list of conditions, and anything you left unclear is pointed out.</p></li>
      <li><h3>Send the link</h3><p>You get one invite link for the other person. They read the conditions and accept. Nothing can be locked before they do.</p></li>
      <li><h3>Lock the money</h3><p>Once they accept, you lock the amount. From here it can only go to them or back to you, and never more than you locked.</p></li>
      <li><h3>Do the work</h3><p>They deliver. Either of you can add evidence at any time: a note on what was done, and a link if there is one.</p></li>
      <li><h3>Release it</h3><p>Happy with the work? Confirm delivery and the money goes out, minus a 1.5% fee. Most deals end here.</p></li>
    </ol>
  </section>

  <section class="band" id="dispute">
    <h2>If you disagree.</h2>
    <ol class="rows cont">
      <li><h3>Open a dispute</h3><p>Either side can open one while the money is locked. Both add their evidence, then either one asks for the verdict.</p></li>
      <li><h3>Read the verdict</h3><p>The agent goes through every condition, marks it met, not met or unclear, and names the evidence it relied on. Then it rules: release, refund, or a split.</p></li>
      <li><h3>Accept or appeal</h3><p>When both sides accept, the money pays out by the ruling. Either side can appeal once with a reason, and that second verdict is final. If nobody appeals within 12 hours, the verdict pays out on its own, so nobody can stall it by staying silent.</p></li>
    </ol>
  </section>

  <section class="band" id="safe">
    <h2>The agent holds the money. It cannot run off with it.</h2>
    <div class="trio">
      <div><h3>It can only pay the two of you.</h3><p>The payee list is fixed when the money locks. Nobody else can ever be paid from the pot.</p></div>
      <div><h3>It can never pay more than was locked.</h3><p>The budget is the locked amount, enforced in code, outside the model's reach.</p></div>
      <div><h3>It has to show its work.</h3><p>Each condition gets a finding and the evidence behind it. A ruling that cites nothing is thrown out.</p></div>
    </div>
  </section>

  <section class="write" id="write">
    <div class="side-note">
      <h2>Write a deal.</h2>
      <p>You are the one paying. Be specific about what must be delivered and by when; vague terms make weak conditions.</p>
    </div>
    <form id="new">
      <label>What is the deal?
        <input name="title" required maxlength="120" placeholder="Logo design for Luna Coffee">
      </label>
      <div class="pair">
        <label>Your name
          <input name="payerName" required maxlength="60" placeholder="Maya">
        </label>
        <label>Their name
          <input name="payeeName" required maxlength="60" placeholder="Jonas">
        </label>
      </div>
      <label>Amount to lock, in dollars
        <input name="amount" required type="number" min="1" step="0.01" placeholder="400">
      </label>
      <label>Terms, in plain words
        <span class="hint">What must be delivered, by when, and what counts as done.</span>
        <textarea name="terms" required maxlength="4000" placeholder="Jonas delivers 3 logo concepts by Friday. Maya picks one and gets 2 rounds of changes. Final files as SVG and PNG."></textarea>
      </label>
      <div id="err"></div>
      <button class="btn" type="submit">Create deal link</button>
    </form>
  </section>`;
  playStage();
  reveal();
  document.getElementById("new").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button");
    const body = Object.fromEntries(new FormData(e.target));
    btn.disabled = true;
    btn.textContent = "Reading your terms";
    try {
      const { deal, token: t } = await api("/deals", body);
      remember(deal.id, t);
      history.pushState({}, "", "/d/" + deal.id);
      route();
      scrollTo(0, 0);
    } catch (err) {
      document.getElementById("err").innerHTML = `<p class="error" role="alert">${esc(err.message)}</p>`;
      btn.disabled = false;
      btn.textContent = "Create deal link";
    }
  });
}

/* ---------- Deal room ---------- */
const potState = {
  awaiting_payee: "Waiting for acceptance",
  awaiting_funds: "Accepted, not locked yet",
  locked: "Locked",
  disputed: "Locked, in dispute",
  judged: "Locked, verdict issued",
  judged_final: "Paid out",
  released: "Paid out",
  escalated: "Locked for human review",
};

function sideLine(d, who) {
  if (!d.payout) return who === "payer" ? "pays" : "delivers";
  const got = who === "payer" ? d.payout.payerBack : d.payout.payeeNet;
  return (who === "payer" ? "got back " : "received ") + money(got);
}

function nextPanel(d) {
  const r = d.role;
  const other = r === "payer" ? d.payee.name : d.payer.name;
  const evidenceForm = `
    <form data-act="evidence">
      <label>Add evidence
        <span class="hint">Say what it shows. Paste a link if you have one.</span>
        <textarea name="text" required maxlength="2000" style="min-height:96px"></textarea>
      </label>
      <label>Link (optional)<input name="url" type="url" placeholder="https://"></label>
      <button class="btn plain" type="submit">Add evidence</button>
    </form>`;
  if (!r) {
    return `<h2>You are viewing this deal</h2><p>Only ${esc(d.payer.name)} and ${esc(d.payee.name)} can act on it, using their own links.</p>`;
  }
  switch (d.status) {
    case "awaiting_payee":
      if (r === "payer") {
        const link = `${location.origin}/d/${d.id}#${d.inviteToken}`;
        return `<h2>Send this link to ${esc(d.payee.name)}</h2>
          <p>It is their private key to the deal. They read the conditions and accept.</p>
          <div class="share"><input readonly value="${esc(link)}" aria-label="Invite link" id="invite"><button class="btn plain" data-copy="invite">Copy link</button></div>`;
      }
      return `<h2>${esc(d.payer.name)} wants to make this deal with you</h2>
        <p>Read the conditions. If they match what you agreed, accept, and ${esc(d.payer.name)} will lock ${money(d.amount)}.</p>
        <div class="actions"><button class="btn red" data-act="accept">Accept the conditions</button></div>`;
    case "awaiting_funds":
      if (r === "payer") {
        return `<h2>${esc(d.payee.name)} accepted</h2>
          <p>Lock ${money(d.amount)}. From then on it can only go to ${esc(d.payee.name)} or back to you.</p>
          <div class="actions"><button class="btn blue" data-act="fund">Lock ${money(d.amount)}</button></div>`;
      }
      return `<h2>Waiting for ${esc(d.payer.name)} to lock the money</h2><p>Do not start work until the pot shows Locked.</p>`;
    case "locked":
      return (r === "payer"
        ? `<h2>The money is locked</h2><p>When ${esc(d.payee.name)} delivers, release it. If something is wrong, open a dispute.</p>
           <div class="actions"><button class="btn blue" data-act="release">Confirm delivery and release</button><button class="btn plain" data-act="dispute">Open a dispute</button></div>`
        : `<h2>The money is locked for you</h2><p>Deliver the work and add proof here. ${esc(d.payer.name)} releases it, or you can open a dispute.</p>
           <div class="actions"><button class="btn plain" data-act="dispute">Open a dispute</button></div>`) + `<hr class="rule">` + evidenceForm;
    case "disputed":
      return `<h2>Dispute open</h2><p>Both sides add evidence. When you are ready, ask for the verdict. It rules only on the conditions and what was submitted.</p>
        <div class="actions"><button class="btn gold" data-act="judge">Ask for the verdict</button>
        ${r === "payer" ? `<button class="btn plain" data-act="release">Release the money anyway</button>` : ""}</div>
        <hr class="rule">` + evidenceForm;
    case "judged": {
      const mine = d.accepted?.[r];
      const theirs = d.accepted?.[r === "payer" ? "payee" : "payer"];
      return `<h2>Read the verdict</h2>
        <p>${mine ? `You accepted. Waiting for ${esc(other)}.` : theirs ? `${esc(other)} accepted. It pays out when you accept too.` : "It pays out as soon as both sides accept. Either side can appeal once, and the appeal verdict is final."}</p>
        <p>If nobody appeals, it pays out on its own on ${esc(new Date(d.payoutDueAt).toLocaleString([], { weekday: "long", hour: "2-digit", minute: "2-digit" }))}.</p>
        <div class="actions">${mine ? "" : `<button class="btn gold" data-act="settle">Accept the verdict</button>`}</div>
        ${d.appealUsed ? "" : `<hr class="rule">
        <form data-act="appeal"><label>Appeal
          <span class="hint">Say what the verdict got wrong. It is re-judged with deeper reasoning, once.</span>
          <textarea name="text" required maxlength="2000" style="min-height:96px"></textarea></label>
          <button class="btn plain" type="submit">Appeal the verdict</button></form>`}`;
    }
    case "released":
      return `<h2>Done</h2><p>${esc(d.payer.name)} confirmed delivery and the money was released.</p><div class="actions"><a class="btn plain" href="/#write">Write a new deal</a></div>`;
    case "judged_final":
      return `<h2>Settled</h2><p>The verdict was carried out. The record below is sealed.</p><div class="actions"><a class="btn plain" href="/#write">Write a new deal</a></div>`;
    case "escalated":
      return `<h2>Held for human review</h2><p>The verdict failed its automatic checks twice, so nothing was paid. Reason: ${esc(d.escalation?.reason)}</p>`;
  }
  return "";
}

function verdictBlock(d) {
  const v = d.verdict;
  if (!v) return "";
  const names = { release: `Release to ${d.payee.name}`, refund: `Refund ${d.payer.name}`, split: "Split the pot" };
  const cond = Object.fromEntries(d.contract.conditions.map((c) => [c.id, c.text]));
  const label = { met: "Met", not_met: "Not met", unclear: "Unclear" };
  return `<section class="block verdict">
    <h2>${v.final ? "Final verdict" : "Verdict"}</h2>
    <div class="ruling">
      <div class="pct">${v.payee_percent}%</div>
      <div class="why"><strong>${esc(names[v.ruling])}</strong>${esc(v.explanation)}</div>
    </div>
    <div class="bar-split" role="img" aria-label="${v.payee_percent}% to ${esc(d.payee.name)}, ${100 - v.payee_percent}% back to ${esc(d.payer.name)}">
      <i style="width:${100 - v.payee_percent}%"></i><i style="width:${v.payee_percent}%;background:var(--gold)"></i>
    </div>
    <h3>Reasoning, condition by condition</h3>
    ${v.findings.map((f) => `<div class="finding">
        <span class="tag ${f.status}">${label[f.status]}</span>
        <div><strong>${esc(cond[f.condition_id])}</strong><br>${esc(f.reasoning)}
        <div class="cites">${f.evidence_ids.length ? "Relied on evidence " + f.evidence_ids.map((id) => "#" + esc(id.slice(1))).join(", ") : "No evidence cited"}</div></div>
      </div>`).join("")}
    <p class="meta">${v.meta.live
      ? `Reasoned by SERV Reasoning on ${esc(v.meta.model)}, ${v.meta.shadow ? "validated by the Shadow Agent, " : ""}${v.meta.attempts} attempt${v.meta.attempts > 1 ? "s" : ""}, ${(v.meta.ms / 1000).toFixed(1)}s. Confidence: ${esc(v.confidence)}.`
      : ""}</p>
    ${d.payout ? `<h3>Payout</h3>
      <table class="ledger">
        <tr><td>${esc(d.payee.name)} receives</td><td>${money(d.payout.payeeNet)}</td></tr>
        <tr><td>${esc(d.payer.name)} gets back</td><td>${money(d.payout.payerBack)}</td></tr>
        <tr><td>Handshake fee (${d.feeBps / 100}% of the released part)</td><td>${money(d.payout.fee)}</td></tr>
      </table>
      <p class="meta">Record seal (SHA-256): ${esc(d.seal)}</p>` : ""}
  </section>`;
}

function room(d) {
  document.title = d.title + " | Handshake";
  const changed = lastStatus && lastStatus !== d.status;
  lastStatus = d.status;
  app.innerHTML = `
  <section class="room-head">
    <h1>${esc(d.title)}</h1>
    <p class="you">${d.role ? `You are ${esc(d[d.role].name)}, the ${d.role}.` : "Read-only view."}</p>
  </section>
  <section class="table">
    <div class="side payer"><div class="who">${esc(d.payer.name)}</div><div class="gets">${esc(sideLine(d, "payer"))}</div></div>
    <div class="pot${changed ? " shake" : ""}"><div class="sum">${money(d.amount)}</div><div class="state">${potState[d.status]}</div></div>
    <div class="side payee"><div class="who">${esc(d.payee.name)}</div><div class="gets">${esc(sideLine(d, "payee"))}</div></div>
  </section>
  <section class="block next" id="next">${nextPanel(d)}<div id="err"></div></section>
  ${verdictBlock(d)}
  ${!d.verdict && d.payout ? `<section class="block"><h2>Payout</h2><table class="ledger">
      <tr><td>${esc(d.payee.name)} receives</td><td>${money(d.payout.payeeNet)}</td></tr>
      <tr><td>Handshake fee (${d.feeBps / 100}%)</td><td>${money(d.payout.fee)}</td></tr></table>
      <p class="meta">Record seal (SHA-256): ${esc(d.seal)}</p></section>` : ""}
  <div class="cols">
    <section class="block">
      <h2>Conditions</h2>
      <p>${esc(d.contract.summary)}</p>
      <ol class="conds">${d.contract.conditions.map((c) => `<li><div>${esc(c.text)}<p class="proof">Proof: ${esc(c.proof)}</p></div></li>`).join("")}</ol>
      ${d.contract.gaps.length ? `<div class="gaps">The terms leave these open:<ul>${d.contract.gaps.map((g) => `<li>${esc(g)}</li>`).join("")}</ul></div>` : ""}
    </section>
    <section class="block">
      <h2>Evidence</h2>
      <div class="ev">${d.evidence.length ? d.evidence.map((e) => `<article class="${e.role}">
          <div class="from">#${esc(e.id.slice(1))} from ${esc(d[e.role].name)}</div><p>${esc(e.text)}</p>
          ${e.url ? `<p><a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer nofollow">${esc(e.url)}</a></p>` : ""}</article>`).join("")
        : `<p class="empty">Nothing yet. Evidence can be added once the money is locked.</p>`}</div>
      <h3 style="margin:30px 0 12px">History</h3>
      <ol class="timeline">${d.timeline.map((t) => `<li><span>${time(t.at)}</span><span>${esc(t.text)}</span></li>`).join("")}</ol>
    </section>
  </div>`;
}

async function act(id, name, body, btn) {
  const label = btn?.textContent;
  if (btn) {
    btn.disabled = true;
    if (name === "judge" || name === "appeal") btn.textContent = "Weighing the evidence";
  }
  try {
    const { deal } = await api(`/deals/${id}/${name}`, body || {});
    lastJson = JSON.stringify(deal);
    room(deal);
    if (name === "judge" || name === "appeal") document.querySelector(".verdict")?.scrollIntoView({ behavior: "smooth" });
  } catch (err) {
    const box = document.getElementById("err");
    if (box) box.innerHTML = `<p class="error" role="alert" style="margin-top:14px">${esc(err.message)}</p>`;
    if (btn) { btn.disabled = false; btn.textContent = label; }
  }
}

async function dealPage(id) {
  const fromHash = location.hash.slice(1);
  if (/^[a-f0-9]{32}$/.test(fromHash)) {
    remember(id, fromHash);
    history.replaceState({}, "", "/d/" + id);
  }
  token = recall(id);
  lastStatus = null;
  app.className = "";
  app.innerHTML = `<p class="thinking">Opening the deal</p>`;
  const refresh = async (force) => {
    const el = document.activeElement;
    const typing = el && /INPUT|TEXTAREA/.test(el.tagName) && el.value && !el.readOnly;
    if (!force && (typing || document.querySelector(".btn[disabled]"))) return;
    try {
      const { deal } = await api("/deals/" + id);
      const json = JSON.stringify(deal);
      if (json !== lastJson) { lastJson = json; room(deal); }
    } catch (err) {
      if (force) app.innerHTML = `<section class="block"><h2>${esc(err.message)}</h2><div class="actions"><a class="btn" href="/">Write a new deal</a></div></section>`;
    }
  };
  await refresh(true);
  clearInterval(timer);
  timer = setInterval(refresh, 5000);

  app.onclick = (e) => {
    const copy = e.target.closest("[data-copy]");
    if (copy) {
      const input = document.getElementById(copy.dataset.copy);
      navigator.clipboard?.writeText(input.value).then(() => (copy.textContent = "Copied"), () => input.select());
      return;
    }
    const btn = e.target.closest("button[data-act]");
    if (btn) act(id, btn.dataset.act, null, btn);
  };
  app.onsubmit = (e) => {
    const form = e.target.closest("form[data-act]");
    if (!form) return;
    e.preventDefault();
    act(id, form.dataset.act, Object.fromEntries(new FormData(form)), form.querySelector("button"));
  };
}

function route() {
  const m = location.pathname.match(/^\/d\/([a-f0-9]{10})$/);
  app.onclick = app.onsubmit = null;
  if (m) dealPage(m[1]);
  else home();
}
window.addEventListener("popstate", route);
document.addEventListener("click", (e) => {
  const a = e.target.closest('a[href^="/#"]');
  if (!a) return;
  e.preventDefault();
  if (location.pathname !== "/") { history.pushState({}, "", "/"); route(); }
  document.querySelector(a.getAttribute("href").slice(1))?.scrollIntoView();
});
route();
