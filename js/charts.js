import { esc, money, compactMoney } from './utils.js';

const PALETTE = ['#14532d', '#22c55e', '#15803d', '#86efac', '#166534', '#4ade80', '#16a34a', '#bbf7d0'];
const W = 560;
const H = 210;
const PAD = { l: 48, r: 14, t: 14, b: 28 };

function gridLines(min, range) {
  let out = '';
  for (let k = 0; k <= 3; k++) {
    const value = min + (range * k) / 3;
    const y = PAD.t + (H - PAD.t - PAD.b) * (1 - k / 3);
    out +=
      `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--ring)"/>` +
      `<text x="${PAD.l - 6}" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="var(--muted)" font-size="11">${compactMoney(Math.max(0, value))}</text>`;
  }
  return out;
}

export function lineChart(months) {
  const values = months.map((m) => m.bal);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const step = (W - PAD.l - PAD.r) / (months.length - 1);
  const points = months.map((m, i) => [
    PAD.l + i * step,
    PAD.t + (H - PAD.t - PAD.b) * (1 - (m.bal - min) / range)
  ]);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  const area = `${line} L${last[0].toFixed(1)} ${H - PAD.b} L${points[0][0].toFixed(1)} ${H - PAD.b} Z`;
  const dots = points
    .map(
      (p, i) =>
        `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4.5" fill="var(--g1)" stroke="var(--surface)" stroke-width="2"><title>${months[i].label}: ${money.format(months[i].bal)}</title></circle>` +
        `<text x="${p[0].toFixed(1)}" y="${H - 8}" text-anchor="middle" fill="var(--muted)" font-size="11">${months[i].label}</text>`
    )
    .join('');
  return (
    `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Total savings over the last six months">` +
    `<defs><linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--g1)" stop-opacity=".35"/><stop offset="1" stop-color="var(--g1)" stop-opacity="0"/></linearGradient></defs>` +
    gridLines(min, range) +
    `<path d="${area}" fill="url(#areaFill)"/>` +
    `<path d="${line}" fill="none" stroke="var(--g1)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>` +
    dots +
    `</svg>`
  );
}

export function barChart(months) {
  const max = Math.max(...months.map((m) => Math.max(m.dep, m.wd)), 1);
  const groupW = (W - PAD.l - PAD.r) / months.length;
  const barW = Math.min(24, groupW / 3);
  const chartH = H - PAD.t - PAD.b;
  const bars = months
    .map((m, i) => {
      const cx = PAD.l + i * groupW + groupW / 2;
      const dh = (chartH * m.dep) / max;
      const wh = (chartH * m.wd) / max;
      return (
        `<rect x="${(cx - barW - 2).toFixed(1)}" y="${(H - PAD.b - dh).toFixed(1)}" width="${barW.toFixed(1)}" height="${dh.toFixed(1)}" rx="4" fill="var(--g1)"><title>${m.label} deposits: ${money.format(m.dep)}</title></rect>` +
        `<rect x="${(cx + 2).toFixed(1)}" y="${(H - PAD.b - wh).toFixed(1)}" width="${barW.toFixed(1)}" height="${wh.toFixed(1)}" rx="4" fill="var(--g3)" fill-opacity=".55"><title>${m.label} withdrawals: ${money.format(m.wd)}</title></rect>` +
        `<text x="${cx.toFixed(1)}" y="${H - 8}" text-anchor="middle" fill="var(--muted)" font-size="11">${m.label}</text>`
      );
    })
    .join('');
  return (
    `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Monthly deposits and withdrawals">${gridLines(0, max)}${bars}</svg>` +
    `<div class="mt-2 flex gap-4 text-xs text-green-800 dark:text-green-300">` +
    `<span><i class="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-green-600"></i>Deposits</span>` +
    `<span><i class="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-green-800 opacity-60 dark:bg-green-300"></i>Withdrawals</span></div>`
  );
}

export function donut(entries) {
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (!total) return `<p class="text-sm text-green-800/80 dark:text-green-300/80">Add money to a goal to see how your savings are spread.</p>`;
  const R = 60;
  const C = 2 * Math.PI * R;
  let acc = 0;
  const segments = entries
    .map(([name, value], i) => {
      const len = (C * value) / total;
      const seg = `<circle cx="90" cy="90" r="${R}" fill="none" stroke="${PALETTE[i % PALETTE.length]}" stroke-width="24" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}"><title>${esc(name)}: ${money.format(value)}</title></circle>`;
      acc += len;
      return seg;
    })
    .join('');
  const legend = entries
    .map(
      ([name, value], i) =>
        `<li class="flex items-center gap-2"><i class="h-2.5 w-2.5 rounded-sm" style="background:${PALETTE[i % PALETTE.length]}"></i>${esc(name)} · ${Math.round((value / total) * 100)}%</li>`
    )
    .join('');
  return (
    `<div class="flex flex-wrap items-center gap-4">` +
    `<svg width="180" height="180" viewBox="0 0 180 180" role="img" aria-label="Savings by category"><g transform="rotate(-90 90 90)">${segments}</g>` +
    `<text x="90" y="86" text-anchor="middle" fill="var(--muted)" font-size="11">Total</text>` +
    `<text x="90" y="106" text-anchor="middle" fill="var(--g3)" font-size="17" font-weight="700">${compactMoney(total)}</text></svg>` +
    `<ul class="min-w-[130px] flex-1 space-y-1.5 text-xs text-green-800 dark:text-green-300">${legend}</ul></div>`
  );
}
