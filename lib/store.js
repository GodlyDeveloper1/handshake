// Tiny JSON-file store. Enough for a demo; swap for a database later.
import fs from "node:fs";
import path from "node:path";

const FILE = process.env.DATA_FILE || path.join(process.cwd(), "data", "deals.json");
let deals = {};
try {
  deals = JSON.parse(fs.readFileSync(FILE, "utf8"));
} catch {
  deals = {};
}

function flush() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(deals, null, 2));
}

export const store = {
  get: (id) => deals[id] || null,
  save(deal) {
    deals[deal.id] = deal;
    flush();
    return deal;
  },
};
