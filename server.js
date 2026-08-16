const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT || 4173);
const PUBLIC_DIR = path.join(__dirname, "public");
const SHEET_ID = "1MYHmvO0-doUTvsIXvErfydb1wke_tQ_vCrZOk2CorN4";
const SCHEDULE_GID = "1701553634";
const ROLES_GID = "1141924141";
const CACHE_MS = 60_000;
const GOOGLE_SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?gid=${SCHEDULE_GID}`;

let cache = null;
let cacheAt = 0;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

async function fetchCsv(gid) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?gid=${gid}&tqx=out%3Acsv&_=${Date.now()}`;
  const response = await fetch(url, {
    headers: { "user-agent": "PCTM-Dashboard/1.0" },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`Google Sheets returned ${response.status}`);
  return response.text();
}

async function getSheets(force = false) {
  const now = Date.now();
  if (!force && cache && now - cacheAt < CACHE_MS) return cache;
  const [scheduleCsv, rolesCsv] = await Promise.all([
    fetchCsv(SCHEDULE_GID),
    fetchCsv(ROLES_GID),
  ]);
  cacheAt = now;
  cache = {
    scheduleCsv,
    rolesCsv,
    fetchedAt: new Date(now).toISOString(),
    cacheSeconds: CACHE_MS / 1000,
    source: GOOGLE_SHEET_URL,
  };
  return cache;
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function serveStatic(req, res) {
  const requestPath = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  const safePath = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.readFile(filePath, (error, body) => {
    if (error) {
      res.writeHead(error.code === "ENOENT" ? 404 : 500);
      return res.end(error.code === "ENOENT" ? "Not found" : "Server error");
    }
    res.writeHead(200, {
      "content-type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "cache-control": "no-cache",
    });
    res.end(body);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method !== "GET") {
    res.writeHead(405, { allow: "GET" });
    return res.end("Method not allowed");
  }
  if (req.url.startsWith("/api/sheets")) {
    try {
      const requestUrl = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
      const data = await getSheets(requestUrl.searchParams.has("refresh"));
      return sendJson(res, 200, data);
    } catch (error) {
      return sendJson(res, 502, {
        error: "Could not load the Google Sheet.",
        detail: error.message,
      });
    }
  }
  return serveStatic(req, res);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`PCTM dashboard: http://127.0.0.1:${PORT}`);
});
