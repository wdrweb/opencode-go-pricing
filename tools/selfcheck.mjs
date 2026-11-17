#!/usr/bin/env node
/**
 * tools/selfcheck.mjs — guards pricing-core.parsePricing against a silent
 * upstream shape change (the reason this repo's refresh workflow broke).
 *
 *   node tools/selfcheck.mjs
 */
import assert from "node:assert/strict";
import core from "../pricing-core.js";

const payload = {
	object: "list",
	data: [
		{
			id: "a", name: "Model A",
			cost: { text: { input: { price: 0.15, cache: { read: 0.003 } }, output: { price: 0.6 } } },
			go: { monthly_usage: { go: 100, "go-plus": 200 } }
		},
		{
			id: "b", name: "Model B",
			cost: {
				text: {
					input: { price: 0.66, cache: { read: 0.022 } },
					output: { price: 1.98 }
				},
				multipliers: [{ when: { utc_days: { in: ["mon"] }, any: [{ all: [{ utc_hours: { gte: "01:00" } }] }] }, factor: 2 }]
			},
			go: { monthly_usage: { go: 15 } }
		},
		{
			id: "c", name: "Model C",
			cost: { text: { input: { price: 0.1, cache: { write: { "30m": 0.25, "12h": 0.5 } } }, output: { price: 0.5 } } },
			go: { monthly_usage: { go: null } }
		},
		{
			id: "d", name: "Model D",
			cost: { text: { input: { price: 2 }, output: { price: 10 } }, multipliers: [{ when: { date: { gte: "2026-12-01" } }, factor: 2 }] },
			go: { monthly_usage: { go: 30 } }
		}
	]
};

const rows = core.parsePricing(JSON.stringify(payload));
assert.equal(rows.length, 5, "4 models, +1 peak row");

const [a, offPeak, peak, c, d] = rows;
assert.deepEqual(a, { name: "Model A", inp: 0.15, out: 0.6, cacheR: 0.003, cacheW: null, usage: 100 });
assert.equal(offPeak.name, "Model B (Off-Peak)");
assert.equal(offPeak.inp, 0.66);
assert.equal(peak.name, "Model B (Peak)");
assert.equal(peak.inp, 1.32, "peak = base × factor");
assert.equal(peak.out, 3.96);
assert.equal(c.cacheW, 0.25, "TTL tiers collapse to the cheapest");
assert.equal(c.usage, null, "missing monthly usage stays null (free tier)");
assert.equal(d.name, "Model D", "date-based multiplier is not a peak row");

assert.equal(core.parsePricing("<!doctype html><table>"), null, "non-JSON yields null");
assert.equal(core.parsePricing({ object: "list" }), null, "payload without data yields null");

console.log(`selfcheck ok — ${rows.length} rows from ${payload.data.length} models`);
