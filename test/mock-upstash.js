// A stand-in for the Upstash Redis REST API, for testing the Redis store offline.
// Usage: node test/mock-upstash.js [port]
import http from "node:http";

const data = new Map();
http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const [cmd, key, value, ...flags] = JSON.parse(body || "[]");
    let result = null;
    if (cmd === "GET") result = data.get(key) ?? null;
    else if (cmd === "SET") {
      if (flags.includes("NX") && data.has(key)) result = null;
      else { data.set(key, value); result = "OK"; }
    } else if (cmd === "DEL") result = data.delete(key) ? 1 : 0;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ result }));
  });
}).listen(process.argv[2] || 3999);
