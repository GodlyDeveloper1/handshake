// Deal storage. Locally: a JSON file. On a serverless host (Vercel): Upstash
// Redis over its REST API, because functions there have no disk to write to.
import fs from "node:fs";
import path from "node:path";

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const useRedis = Boolean(REDIS_URL && REDIS_TOKEN);

export class StorageError extends Error {}

async function redis(...command) {
  const res = await fetch(REDIS_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${REDIS_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(command),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw new StorageError(body.error || `Storage answered ${res.status}.`);
  return body.result;
}

const redisStore = {
  kind: "redis",
  async get(id) {
    const raw = await redis("GET", `deal:${id}`);
    return raw ? JSON.parse(raw) : null;
  },
  async save(deal) {
    await redis("SET", `deal:${deal.id}`, JSON.stringify(deal));
    return deal;
  },
  // One verdict at a time per deal, across every server instance.
  async lock(id) {
    return (await redis("SET", `lock:${id}`, "1", "NX", "EX", "180")) === "OK";
  },
  async unlock(id) {
    await redis("DEL", `lock:${id}`);
  },
  all: null,
};

const FILE = process.env.DATA_FILE || path.join(process.cwd(), "data", "deals.json");
let deals = {};
if (!useRedis) {
  try {
    deals = JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    deals = {};
  }
}
const locks = new Set();
const fileStore = {
  kind: "file",
  async get(id) {
    return deals[id] || null;
  },
  async save(deal) {
    if (process.env.VERCEL) throw new StorageError("No database is connected. Add an Upstash Redis database to this Vercel project.");
    deals[deal.id] = deal;
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(deals, null, 2));
    return deal;
  },
  async lock(id) {
    if (locks.has(id)) return false;
    locks.add(id);
    return true;
  },
  async unlock(id) {
    locks.delete(id);
  },
  all: () => Object.values(deals),
};

export const store = useRedis ? redisStore : fileStore;
