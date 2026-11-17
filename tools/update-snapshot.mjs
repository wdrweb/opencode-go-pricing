#!/usr/bin/env node
/**
 * tools/update-snapshot.mjs — regenerate data/models.json from the live
 * opencode.ai Go models endpoint. No dependencies (Node 18+ global fetch).
 *
 *   node tools/update-snapshot.mjs       # writes data/models.json
 *
 * data/models.json is the static-host data path: the page fetches it
 * same-origin (no CORS), so committing it keeps GitHub Pages / Netlify /
 * Vercel / any static host up to date. The parsing code is the very same
 * pricing-core.js the browser uses. For fully automatic refreshes, drop in
 * the workflow at .github/workflows/refresh-pricing.yml.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import core from "../pricing-core.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "data", "models.json");
const UPSTREAM = "https://opencode.ai/inference/go/v1/models";

const res = await fetch(UPSTREAM, {
	headers: { "user-agent": "Mozilla/5.0" },
	signal: AbortSignal.timeout(15000)
});
if (!res.ok) throw new Error("upstream http " + res.status);

const models = core.parsePricing(await res.text());
if (!models || !models.length) throw new Error("models endpoint payload not recognised");

const payload = {
	source: "live",
	fetchedAt: new Date().toISOString(),
	models
};

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(payload, null, 2) + "\n");
console.log(`wrote ${OUT}: ${models.length} models, fetched at ${payload.fetchedAt}`);
