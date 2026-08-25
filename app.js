"use strict";
/* Model Pricing & Value — standalone static page.
   Port of the mdlc-pricing DSH plugin (server half lib/index.js + browser
   half lib/client.js) to plain HTML/CSS/JS:

   - Embedded snapshot data, identical to the plugin's fallback, so the page
     works fully offline.
   - On load (and on Refresh) it tries live data, in order:
       1. the same-origin /api/mdlc-pricing endpoint (serve.py local proxy,
          or the DSH Web plugin's endpoint) — JSON or HTML
       2. a committed data/models.json (same-origin, no CORS — the static
          host path; regenerate with node tools/update-snapshot.mjs)
       3. https://opencode.ai/docs/go directly (only works if that origin
          sends CORS headers — it does not today)
     Any failure falls back to the snapshot and the status pill explains why,
     with a hint tailored to local vs remote hosting — same resilience as
     the plugin.
   - Sortable columns, tier filter, value computation, best-value highlight.

   Requires: pricing-core.js loaded first (window.PricingCore).
*/

/* Shared helpers: fmtNum, money, fmtCount, parsePricing. */
const PricingCore = (typeof window !== "undefined" && window.PricingCore) || {};
const { parsePricing, fmtNum, money, fmtCount } = PricingCore;

/* ------------------------------------------------------------------ *
 * Snapshot data (same numbers as the plugin's embedded fallback)
 * ------------------------------------------------------------------ */
const SNAPSHOT = [
	{ name: "Grok 4.5", inp: 2.0, out: 6.0, cacheR: 0.30, cacheW: null, usage: 15 },
	{ name: "GPT 5.6 Luna (<= 272K tokens)", inp: 0.20, out: 1.20, cacheR: 0.02, cacheW: 0.25, usage: 15 },
	{ name: "GPT 5.6 Luna (> 272K tokens)", inp: 0.40, out: 1.80, cacheR: 0.04, cacheW: 0.50, usage: 15 },
	{ name: "GLM-5.3", inp: 1.40, out: 4.40, cacheR: 0.26, cacheW: null, usage: 15 },
	{ name: "GLM-5.2", inp: 1.40, out: 4.40, cacheR: 0.26, cacheW: null, usage: 60 },
	{ name: "GLM-5.1", inp: 1.40, out: 4.40, cacheR: 0.26, cacheW: null, usage: 60 },
	{ name: "Kimi K3", inp: 3.00, out: 15.00, cacheR: 0.30, cacheW: null, usage: 15 },
	{ name: "Kimi K2.7 Code", inp: 0.95, out: 4.00, cacheR: 0.19, cacheW: null, usage: 60 },
	{ name: "Kimi K2.6", inp: 0.95, out: 4.00, cacheR: 0.16, cacheW: null, usage: 60 },
	{ name: "MiMo V2.5", inp: 0.14, out: 0.28, cacheR: 0.0028, cacheW: null, usage: 60 },
	{ name: "MiMo V2.5 Pro", inp: 0.435, out: 0.87, cacheR: 0.003625, cacheW: null, usage: 15 },
	{ name: "MiniMax M3", inp: 0.30, out: 1.20, cacheR: 0.06, cacheW: null, usage: 60 },
	{ name: "MiniMax M2.7", inp: 0.30, out: 1.20, cacheR: 0.06, cacheW: 0.375, usage: 60 },
	{ name: "MiniMax M2.5", inp: 0.30, out: 1.20, cacheR: 0.06, cacheW: 0.375, usage: 60 },
	{ name: "Muse Spark 1.2 Contributor", inp: 0.10, out: 0.20, cacheR: 0.002, cacheW: null, usage: 60 },
	{ name: "Qwen3.8 Max", inp: 2.00, out: 6.00, cacheR: 0.25, cacheW: 2.50, usage: 15 },
	{ name: "Qwen3.7 Max", inp: 2.50, out: 7.50, cacheR: 0.50, cacheW: 3.125, usage: 60 },
	{ name: "Qwen3.7 Plus (<= 256K tokens)", inp: 0.40, out: 1.60, cacheR: 0.04, cacheW: 0.50, usage: 60 },
	{ name: "Qwen3.7 Plus (> 256K tokens)", inp: 1.20, out: 4.80, cacheR: 0.12, cacheW: 1.50, usage: 60 },
	{ name: "Qwen3.6 Plus (<= 256K tokens)", inp: 0.50, out: 3.00, cacheR: 0.05, cacheW: 0.625, usage: 60 },
	{ name: "Qwen3.6 Plus (> 256K tokens)", inp: 2.00, out: 6.00, cacheR: 0.20, cacheW: 2.50, usage: 60 },
	{ name: "DeepSeek V4 Pro (Off-Peak)", inp: 0.66, out: 1.98, cacheR: 0.022, cacheW: null, usage: 15 },
	{ name: "DeepSeek V4 Pro (Peak)", inp: 1.32, out: 3.96, cacheR: 0.044, cacheW: null, usage: 15 },
	{ name: "DeepSeek V4 Flash (Off-Peak)", inp: 0.22, out: 0.66, cacheR: 0.007, cacheW: null, usage: 30 },
	{ name: "DeepSeek V4 Flash (Peak)", inp: 0.44, out: 1.32, cacheR: 0.014, cacheW: null, usage: 30 },
	{ name: "DeepSeek V4 Flash Vision Exp (Off-Peak)", inp: 0.22, out: 0.66, cacheR: 0.007, cacheW: null, usage: 15 },
	{ name: "DeepSeek V4 Flash Vision Exp (Peak)", inp: 0.44, out: 1.32, cacheR: 0.014, cacheW: null, usage: 15 },
	{ name: "Hy3", inp: 0.14, out: 0.58, cacheR: 0.035, cacheW: null, usage: 60 },
	{ name: "Ox Alpha Free", inp: null, out: null, cacheR: null, cacheW: null, usage: null }
];

/* ------------------------------------------------------------------ *
 * App state
 * ------------------------------------------------------------------ */
const state = {
	filter: "all",
	sortKey: "value",
	sortDir: "desc",
	pricing: { source: "loading", models: SNAPSHOT, fetchedAt: null, reason: null }
};

const COLS = [
	{ key: "name", label: "Model" },
	{ key: "inp", label: "Input" },
	{ key: "ein", label: "Eff In" },
	{ key: "out", label: "Output" },
	{ key: "eout", label: "Eff Out" },
	{ key: "cr", label: "Cache Read" },
	{ key: "ecr", label: "Eff CR" },
	{ key: "cw", label: "Cache Write" },
	{ key: "ecw", label: "Eff CW" },
	{ key: "usage", label: "Included/mo" },
	{ key: "value", label: "Value" }
];

const FILTER_LABELS = { all: "All", 15: "$15/mo", 30: "$30/mo", 60: "$60/mo", free: "Free" };

/* ------------------------------------------------------------------ *
 * Live data fetching
 *
 * Browsers block a direct cross-origin fetch to opencode.ai/docs/go
 * (no Access-Control-Allow-Origin header), so the reliable live paths are
 * same-origin:
 *   1. /api/mdlc-pricing       — serve.py local proxy (HTML) or the DSH Web
 *                                plugin's endpoint (JSON)
 *   2. ./data/models.json      — committed refresh of the upstream table;
 *                                the static-host path (GitHub Pages etc.),
 *                                regenerated with node tools/update-snapshot.mjs
 *   3. https://opencode.ai/docs/go direct — only if CORS is ever granted
 * Any failure falls back to the embedded snapshot and the status pill
 * explains why, with a hint tailored to local vs remote hosting.
 * ------------------------------------------------------------------ */
class LiveUnavailable extends Error {}

function isLocalHost() {
	const h = typeof location !== "undefined" ? location.hostname : "";
	return h === "" || h === "localhost" || h === "127.0.0.1" || h === "::1";
}

function liveHint() {
	return isLocalHost()
		? "run \"python3 serve.py\" for live data"
		: "static hosts can't reach opencode.ai (browser CORS) — run \"node tools/update-snapshot.mjs\" and redeploy to refresh data";
}

async function fetchLive() {
	const sameOrigin = location.protocol === "http:" || location.protocol === "https:";

	// 1) Same-origin /api/mdlc-pricing — JSON (DSH plugin) or HTML (serve.py).
	if (sameOrigin) {
		try {
			const r = await fetch("/api/mdlc-pricing", { cache: "no-store" });
			const ct = (r.headers && typeof r.headers.get === "function")
				? (r.headers.get("content-type") || "") : "";
			const text = await r.text();
			if (ct.indexOf("json") !== -1) {
				let j = null;
				try { j = JSON.parse(text); } catch (e) { j = null; }
				if (j && j.source === "live" && Array.isArray(j.models) && j.models.length) {
					return { models: j.models, fetchedAt: j.fetchedAt || null, via: "/api/mdlc-pricing" };
				}
				// A JSON snapshot carries the server's own reason (upstream
				// down etc.) — trust it; the browser cannot do better.
				if (j && j.reason) throw new LiveUnavailable(String(j.reason));
			} else {
				const models = parsePricing(text);
				if (models && models.length) {
					return { models, fetchedAt: new Date().toISOString(), via: "/api/mdlc-pricing" };
				}
			}
		} catch (e) {
			if (e instanceof LiveUnavailable) throw e;
			// no usable endpoint here (plain static server) — try the next source
		}
	}

	// 2) Committed data/models.json — same-origin JSON, no CORS. Works on any
	//    static host that ships the file (see tools/update-snapshot.mjs).
	try {
		const r = await fetch("./data/models.json", { cache: "no-store" });
		if (!r.ok) throw new Error("http " + r.status);
		const j = await r.json();
		if (j && j.source === "live" && Array.isArray(j.models) && j.models.length) {
			return { models: j.models, fetchedAt: j.fetchedAt || null, via: "data/models.json" };
		}
	} catch (e) { /* no committed data — continue */ }

	// 3) Direct upstream (only works if opencode.ai ever sends CORS headers;
	//    today it does not, so this normally fails in a browser).
	try {
		const r = await fetch("https://opencode.ai/docs/go", {
			headers: { "user-agent": "Mozilla/5.0" }
		});
		if (!r.ok) throw new Error("http " + r.status);
		const html = await r.text();
		const models = parsePricing(html);
		if (!models) throw new Error("pricing table not found");
		return { models, fetchedAt: new Date().toISOString(), via: "opencode.ai/docs/go" };
	} catch (e) {
		if (e instanceof LiveUnavailable) throw e;
		const msg = (e && e.message) ? e.message : String(e);
		throw new Error(msg + " — " + liveHint());
	}
}

async function refresh() {
	state.pricing = { source: "loading", models: state.pricing.models, fetchedAt: null, reason: null };
	render();
	try {
		const live = await fetchLive();
		state.pricing = { source: "live", models: live.models, fetchedAt: live.fetchedAt, reason: null };
	} catch (err) {
		state.pricing = {
			source: "snapshot",
			models: SNAPSHOT,
			fetchedAt: null,
			reason: err && err.message ? err.message : "fetch failed"
		};
	}
	render();
}

/* ------------------------------------------------------------------ *
 * Derived rows: value + filter (ported from the plugin's ModelExplorer)
 * ------------------------------------------------------------------ */
function derivedRows() {
	const rows = state.pricing.models.map((m) => {
		const value = (m.usage != null && m.out != null) ? m.usage / m.out : null;
		return { model: m, value };
	}).filter((r) => {
		if (state.filter === "all") return true;
		if (state.filter === "free") return r.model.usage == null;
		return r.model.usage === parseFloat(state.filter);
	});

	const valued = rows.filter((r) => r.value != null);
	const best = valued.length ? valued.reduce((a, b) => (a.value >= b.value ? a : b)) : null;
	return { rows, best };
}

/** Effective cost = price ÷ (10 × monthly credit). Same shape as the base
 *  price columns, so it sorts and renders like any other numeric column. */
function effCost(m, field) {
	const price = m[field];
	if (price == null || m.usage == null) return null;
	return price / (10 * m.usage);
}

function cellVal(r, key) {
	const m = r.model;
	switch (key) {
		case "name": return m.name;
		case "inp": return m.inp;
		case "ein": return effCost(m, "inp");
		case "out": return m.out;
		case "eout": return effCost(m, "out");
		case "cr": return m.cacheR;
		case "ecr": return effCost(m, "cacheR");
		case "cw": return m.cacheW;
		case "ecw": return effCost(m, "cacheW");
		case "usage": return m.usage;
		case "value": return r.value;
		default: return null;
	}
}

/* ------------------------------------------------------------------ *
 * DOM helpers
 * ------------------------------------------------------------------ */
function el(tag, props, children) {
	const node = document.createElement(tag);
	if (props) {
		for (const [k, v] of Object.entries(props)) {
			if (k === "class") node.className = v;
			else if (k === "title") node.title = v;
			else if (k === "ariaSort") node.setAttribute("aria-sort", v);
			else node.setAttribute(k, v);
		}
	}
	if (children) {
		for (const c of children) {
			if (c == null) continue;
			node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
		}
	}
	return node;
}

function span(text, extraClass) {
	return el("span", extraClass ? { class: extraClass } : null, [String(text)]);
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */
function renderCell(r, key) {
	if (key === "name") {
		const m = r.model;
		const hasPrice = m.inp != null || m.out != null || m.cacheR != null;
		const children = [];
		const star = bestRow && r === bestRow ? el("span", { class: "star" }, ["★ "]) : null;
		if (star) children.push(star);
		children.push(document.createTextNode(m.name));
		if (!hasPrice) children.push(span(" · free", "free"));
		return el("span", null, children);
	}
	if (key === "usage") {
		return r.model.usage == null ? span("—", "free") : span(money(r.model.usage), "num");
	}
	if (key === "value") {
		const isBest = bestRow && r === bestRow;
		return span(fmtCount(r.value), isBest ? "best-val num" : "num");
	}
	const v = cellVal(r, key);
	if (v == null) return span("—", "free");
	return span(money(v), "num");
}

let bestRow = null;

function render() {
	const { rows, best } = derivedRows();
	bestRow = best;

	// -- tbody
	const tbody = document.getElementById("tbody");
	tbody.textContent = "";

	if (!rows.length) {
		tbody.appendChild(el("tr", null, [
			el("td", { class: "emptystate", colspan: String(COLS.length) }, ["No models match this filter."])
		]));
	} else {
		const sorted = rows.slice().sort((a, b) => {
			const av = cellVal(a, state.sortKey);
			const bv = cellVal(b, state.sortKey);
			if (av == null && bv == null) return 0;
			if (av == null) return 1;
			if (bv == null) return -1;
			if (typeof av === "string") return av.localeCompare(bv) * (state.sortDir === "asc" ? 1 : -1);
			return (av - bv) * (state.sortDir === "asc" ? 1 : -1);
		});
		for (const r of sorted) {
			const tr = el("tr", best && r === best ? { class: "hlrow" } : null,
				COLS.map((c) => el("td", null, [renderCell(r, c.key)])));
			tbody.appendChild(tr);
		}
	}

	// -- header sort indicators + aria-sort
	for (const th of document.querySelectorAll(".model-table thead th")) {
		const key = th.getAttribute("data-key");
		const arrow = th.querySelector(".arrow");
		if (arrow) arrow.remove();
		if (key === state.sortKey) {
			th.setAttribute("aria-sort", state.sortDir === "asc" ? "ascending" : "descending");
			th.appendChild(el("span", { class: "arrow" }, [state.sortDir === "asc" ? "▲" : "▼"]));
		} else {
			th.setAttribute("aria-sort", "none");
		}
	}

	// -- banner
	const banner = document.getElementById("banner");
	banner.textContent = "";
	if (best) {
		banner.appendChild(span("★ Best value:", "best"));
		banner.appendChild(document.createTextNode(" " + best.model.name + " "));
		banner.appendChild(span(fmtCount(best.value) + " output tokens/mo", "num"));
		banner.appendChild(span(" covered by monthly credit", "muted"));
	} else {
		banner.appendChild(span("No valued models in this selection.", "muted"));
	}

	// -- count label
	const countLabel = document.getElementById("countLabel");
	const nonNull = rows.filter((r) => r.value != null).length;
	const filterWord = FILTER_LABELS[state.filter] || "All";
	countLabel.textContent = rows.length + " model" + (rows.length === 1 ? "" : "s") +
		" · " + nonNull + " valued · tier: " + filterWord;

	// -- source pill
	const pill = document.getElementById("srcPill");
	const srcText = document.getElementById("srcText");
	const footSrc = document.getElementById("footSrc");
	const p = state.pricing;
	pill.setAttribute("data-state", p.source);
	let text;
	if (p.source === "live") {
		const when = p.fetchedAt ? new Date(p.fetchedAt).toLocaleString() : "now";
		text = "Live data from opencode.ai/docs/go — updated " + when;
		footSrc.textContent = "Live data source: opencode.ai/docs/go";
	} else if (p.source === "loading") {
		text = "Loading live prices…";
		footSrc.textContent = "";
	} else {
		text = "Showing embedded snapshot" + (p.reason ? " — live fetch unavailable: " + p.reason : "");
		footSrc.textContent = "Data: embedded snapshot (offline) · live source: opencode.ai/docs/go";
	}
	srcText.textContent = text;
	pill.title = text;
}

/* ------------------------------------------------------------------ *
 * Theme
 * ------------------------------------------------------------------ */
function applyTheme(theme) {
	document.documentElement.setAttribute("data-theme", theme);
	try { localStorage.setItem("mdlc-theme", theme); } catch (e) { /* ignore */ }
}

/* ------------------------------------------------------------------ *
 * Wire up events
 * ------------------------------------------------------------------ */
document.addEventListener("DOMContentLoaded", () => {
	const filterSelect = document.getElementById("filterSelect");
	const sortSelect = document.getElementById("sortSelect");
	const refreshBtn = document.getElementById("refreshBtn");
	const resetBtn = document.getElementById("resetBtn");
	const themeBtn = document.getElementById("themeBtn");

	// initial theme: saved choice, else system preference
	let theme = "dark";
	try { theme = localStorage.getItem("mdlc-theme") || null; } catch (e) { /* ignore */ }
	if (!theme) theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
	applyTheme(theme);
	themeBtn.textContent = theme === "dark" ? "Light" : "Dark";

	filterSelect.addEventListener("change", () => { state.filter = filterSelect.value; render(); });
	sortSelect.addEventListener("change", () => {
		state.sortKey = sortSelect.value;
		state.sortDir = sortSelect.value === "value" ? "desc" : "asc";
		render();
	});

	document.querySelectorAll(".model-table thead th").forEach((th) => {
		th.addEventListener("click", () => {
			const key = th.getAttribute("data-key");
			if (state.sortKey === key) state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
			else { state.sortKey = key; state.sortDir = "asc"; }
			sortSelect.value = key;
			render();
		});
	});

	refreshBtn.addEventListener("click", () => {
		refreshBtn.disabled = true;
		refreshBtn.textContent = "…";
		refresh().finally(() => {
			refreshBtn.disabled = false;
			refreshBtn.innerHTML = "&#x21BB; Refresh";
		});
	});

	resetBtn.addEventListener("click", () => {
		state.filter = "all";
		state.sortKey = "value";
		state.sortDir = "desc";
		filterSelect.value = "all";
		sortSelect.value = "value";
		render();
	});

	themeBtn.addEventListener("click", () => {
		const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
		applyTheme(next);
		themeBtn.textContent = next === "dark" ? "Light" : "Dark";
	});

	render();
	refresh();
});