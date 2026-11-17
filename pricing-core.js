/* pricing-core.js — shared pure helpers for the Model Pricing & Value page.

   Upstream is the Go models endpoint (JSON), and the mapper that turns it into
   table rows must live in exactly ONE place because it is used by two runtimes:

     - browser: index.html loads this file BEFORE app.js; it exposes
       window.PricingCore
     - node:    tools/update-snapshot.mjs imports it (CommonJS interop via the
       UMD wrapper below)

   Exports: fmtNum, money, fmtCount, parsePricing
*/
(function (root, factory) {
	if (typeof module === "object" && typeof module.exports === "object") {
		module.exports = factory();
	} else {
		root.PricingCore = factory();
	}
})(typeof self !== "undefined" ? self : this, function () {
	"use strict";

	/* ---- formatting (ported from the plugin's lib/client.js) ---- */
	function fmtNum(v) {
		if (v == null || isNaN(v)) return null;
		if (Math.abs(v) < 1e-9) return "0";
		const abs = Math.abs(v);
		const digits = abs >= 100 ? 0 : abs >= 1 ? 2 : abs >= 0.01 ? 3 : 6;
		let s = v.toFixed(digits);
		if (s.indexOf(".") >= 0) {
			s = s.replace(/0+$/, "");
			if (s.charAt(s.length - 1) === ".") s = s.slice(0, -1);
		}
		return s;
	}

	function money(v) {
		const s = fmtNum(v);
		return s == null ? "—" : "$" + s;
	}

	function fmtCount(v) {
		const s = fmtNum(v);
		return s == null ? "—" : s + "M";
	}

	/* ---- upstream models-endpoint mapper ---- */

	function num(v) {
		return typeof v === "number" && isFinite(v) ? v : null;
	}

	/* Cache write is either a flat price or TTL tiers ({ "30m": 0.25, ... }).
	   The column renders one number, so use the cheapest tier. */
	function cacheWritePrice(cw) {
		if (cw == null) return null;
		if (typeof cw === "number") return num(cw);
		let best = null;
		for (const k in cw) {
			const v = num(cw[k]);
			if (v != null && (best == null || v < best)) best = v;
		}
		return best;
	}

	/* Clock-window multiplier (weekday peak hours) → its surcharge factor.
	   Date-based multipliers are scheduled price changes, not a daily peak,
	   so they stay out of the table. */
	function peakFactor(m) {
		const ms = (m.cost && m.cost.multipliers) || [];
		let factor = null;
		for (const mult of ms) {
			if (!mult.when || !mult.when.any) continue;
			const f = num(mult.factor);
			if (f != null && f > 1 && (factor == null || f > factor)) factor = f;
		}
		return factor;
	}

	function scaled(v, f) {
		return v == null ? null : Math.round(v * f * 1e6) / 1e6;
	}

	/* Accepts the endpoint's JSON (string or already parsed). Returns the rows
	   the page renders, or null when the payload is not the models list. */
	function parsePricing(input) {
		let d = input;
		if (typeof d === "string") {
			try { d = JSON.parse(d); } catch (e) { return null; }
		}
		if (!d || !Array.isArray(d.data)) return null;
		const models = [];
		for (const m of d.data) {
			const cost = (m.cost && m.cost.text) || {};
			const inp = cost.input || {};
			const cache = inp.cache || {};
			const usage = m.go && m.go.monthly_usage;
			const row = {
				name: m.name || m.id,
				inp: num(inp.price),
				out: num((cost.output || {}).price),
				cacheR: num(cache.read),
				cacheW: cacheWritePrice(cache.write),
				usage: usage ? num(usage.go) : null
			};
			const f = peakFactor(m);
			if (f == null) {
				models.push(row);
				continue;
			}
			/* Base price is the off-peak one; peak is base × factor. Two rows
			   keep the columns comparable, as the old price table did. */
			row.name += " (Off-Peak)";
			models.push(row);
			models.push({
				name: (m.name || m.id) + " (Peak)",
				inp: scaled(row.inp, f),
				out: scaled(row.out, f),
				cacheR: scaled(row.cacheR, f),
				cacheW: scaled(row.cacheW, f),
				usage: row.usage
			});
		}
		return models.length ? models : null;
	}

	return { fmtNum: fmtNum, money: money, fmtCount: fmtCount, parsePricing: parsePricing };
});
