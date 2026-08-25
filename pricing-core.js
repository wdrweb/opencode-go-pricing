/* pricing-core.js — shared pure helpers for the Model Pricing & Value page.

   The upstream opencode.ai/docs/go page is HTML, and the tiny table parser
   that extracts the pricing rows must live in exactly ONE place because it is
   used by two runtimes:

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

	/* ---- upstream table parser (ported from the plugin's lib/index.js) ---- */
	function stripTags(s) {
		return s.replace(/<[^>]*>/g, " ");
	}

	function decode(s) {
		return s
			.replace(/&amp;/g, "&")
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.replace(/&quot;/g, "\"")
			.replace(/&#39;/g, "'")
			.replace(/&#x27;/g, "'")
			.replace(/&nbsp;/g, " ");
	}

	function toNum(s) {
		const t = String(s).replace(/<[^>]*>/g, "").trim();
		if (t === "" || t === "-") return null;
		const n = parseFloat(t.replace(/[\$,]/g, ""));
		return isNaN(n) ? null : n;
	}

	function rowCells(rowHtml) {
		const out = [];
		let idx = 0;
		while (idx < rowHtml.length) {
			const td = rowHtml.indexOf("<td", idx);
			const th = rowHtml.indexOf("<th", idx);
			let open;
			if (td === -1) open = th;
			else if (th === -1) open = td;
			else open = Math.min(td, th);
			if (open === -1) break;
			const gt = rowHtml.indexOf(">", open);
			if (gt === -1) break;
			const isTh = rowHtml.charAt(open + 1) === "t" && rowHtml.charAt(open + 2) === "h";
			const closeTag = isTh ? "</th>" : "</td>";
			const close = rowHtml.indexOf(closeTag, gt);
			if (close === -1) { idx = gt + 1; continue; }
			out.push(decode(stripTags(rowHtml.slice(gt + 1, close))));
			idx = close + closeTag.length;
		}
		return out;
	}

	function parsePricing(html) {
		const headerPos = html.indexOf(">Cached Read<");
		if (headerPos === -1) return null;
		const tableStart = html.lastIndexOf("<table", headerPos);
		if (tableStart === -1) return null;
		const tableEnd = html.indexOf("</table>", headerPos);
		if (tableEnd === -1) return null;
		const table = html.slice(tableStart, tableEnd);
		const tbodyStart = table.indexOf("<tbody");
		const tbodyEnd = table.indexOf("</tbody>");
		const body = (tbodyStart !== -1 && tbodyEnd !== -1) ? table.slice(tbodyStart, tbodyEnd) : table;
		const models = [];
		let idx = 0;
		while (idx < body.length) {
			const tr = body.indexOf("<tr", idx);
			if (tr === -1) break;
			const trEnd = body.indexOf("</tr>", tr);
			if (trEnd === -1) break;
			const cells = rowCells(body.slice(tr, trEnd));
			if (cells.length >= 6) {
				const modelName = cells[0].trim();
				if (modelName && modelName !== "Model") {
					models.push({
						name: modelName,
						inp: toNum(cells[1]),
						out: toNum(cells[2]),
						cacheR: toNum(cells[3]),
						cacheW: toNum(cells[4]),
						usage: toNum(cells[5])
					});
				}
			}
			idx = trEnd + 5;
		}
		return models.length ? models : null;
	}

	return { fmtNum: fmtNum, money: money, fmtCount: fmtCount, parsePricing: parsePricing };
});