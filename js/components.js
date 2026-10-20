import { esc, money, fmtDay } from './utils.js';
import { CATEGORIES } from './store.js';
import { pct, isDone, daysLeft, monthlyNeed, health } from './analytics.js';

export const muted = 'text-green-800/80 dark:text-green-300/80';
export const strong = 'text-green-800 dark:text-green-300';
const CIRC = 2 * Math.PI * 42;

export const icon = (name) => (CATEGORIES.find(([n]) => n === name) || [null, '🎯'])[1];

export const panel = (span, title, body) =>
  `<section class="card ${span}"><h2 class="mb-3 text-sm font-bold ${strong}">${title}</h2>${body}</section>`;

export const kpi = (label, value, extra = '') =>
  `<div class="card"><p class="text-xs ${muted}">${label}</p><p class="mt-1 text-xl font-extrabold ${strong}">${value}</p>${extra}</div>`;

export const pageHead = (title, subtitle, actions = '') =>
  `<div class="mb-5 flex flex-wrap items-end justify-between gap-3"><div><h2 class="text-2xl font-extrabold tracking-tight ${strong}">${title}</h2>` +
  `<p class="text-sm ${muted}">${subtitle}</p></div><div class="flex flex-wrap gap-2">${actions}</div></div>`;

export const listRow = (title, sub, right = '') =>
  `<div class="list-row"><span class="min-w-0 break-words">${title}<small class="block ${muted}">${sub}</small></span><div class="shrink-0 text-right">${right}</div></div>`;

export const feed = (rows, emptyText) =>
  rows.length ? `<div class="space-y-2">${rows.join('')}</div>` : `<p class="text-sm ${muted}">${emptyText}</p>`;

export const amountText = (sign, value) => `<b class="whitespace-nowrap ${strong}">${sign}${money.format(value)}</b>`;

export const emptyState = (title, text, buttons = '') =>
  `<div class="card col-span-full border-2 border-dashed py-12 text-center"><h2 class="text-xl font-bold ${strong}">${title}</h2>` +
  `<p class="mx-auto mt-1 max-w-md text-sm ${muted}">${text}</p><div class="mt-4 flex flex-wrap justify-center gap-2">${buttons}</div></div>`;

const HEALTH_STYLE = {
  Done: 'bg-green-600 text-white border-green-600',
  'On track': 'chip-strong',
  Behind: 'border-dashed',
  Overdue: 'border-dashed font-bold',
  Open: ''
};

const healthChip = (g) => `<span class="chip ${HEALTH_STYLE[health(g)]}">${health(g)}</span>`;

const ring = (p) =>
  `<div class="relative h-24 w-24 shrink-0"><svg class="-rotate-90" width="96" height="96" viewBox="0 0 100 100" aria-hidden="true">` +
  `<circle cx="50" cy="50" r="42" fill="none" stroke="var(--ring)" stroke-width="10"/>` +
  `<circle cx="50" cy="50" r="42" fill="none" stroke="var(--g1)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${CIRC.toFixed(2)}" stroke-dashoffset="${(CIRC * (1 - p / 100)).toFixed(2)}"/></svg>` +
  `<span class="absolute inset-0 grid place-items-center text-lg font-bold ${strong}">${p}%</span></div>`;

function deadlineChip(g) {
  const d = daysLeft(g);
  if (isDone(g)) return '<span class="chip chip-strong">Goal reached 🎉</span>';
  if (d === null) return '<span class="chip">No deadline</span>';
  if (d < 0) return `<span class="chip chip-strong">Overdue by ${Math.abs(d)} day${Math.abs(d) === 1 ? '' : 's'}</span>`;
  if (d === 0) return '<span class="chip chip-strong">Due today</span>';
  return `<span class="chip">${d} day${d === 1 ? '' : 's'} left · ${fmtDay(g.deadline)}</span>`;
}

export function goalCard(g) {
  const p = pct(g);
  const need = monthlyNeed(g);
  const done = isDone(g);
  return (
    `<article class="card flex flex-col gap-3 ${done ? 'border-green-500 bg-green-50 dark:bg-green-950' : ''}" data-id="${esc(g.id)}">` +
    `<div class="flex items-center gap-4">${ring(p)}<div class="min-w-0"><h3 class="break-words text-lg font-bold">${esc(g.name)}</h3>` +
    `<div class="mt-1 flex flex-wrap gap-1.5"><span class="chip">${icon(g.category)} ${esc(g.category)}</span><span class="chip">${g.priority} priority</span>${healthChip(g)}</div></div></div>` +
    `<div class="flex justify-between text-sm ${muted}"><span>Saved <b class="text-green-950 dark:text-green-50">${money.format(g.saved)}</b></span><span>Target <b class="text-green-950 dark:text-green-50">${money.format(g.target)}</b></span></div>` +
    `<div class="meter"><i style="width:${p}%"></i></div>` +
    `<div class="flex flex-wrap gap-1.5">${deadlineChip(g)}` +
    (need !== null ? `<span class="chip chip-strong">Save ${money.format(need)} / month</span>` : '') +
    (g.monthly && !done ? `<span class="chip">Auto ${money.format(g.monthly)} / month</span>` : '') +
    `</div><div class="mt-auto flex flex-wrap gap-1.5 pt-1">` +
    (done
      ? `<button class="btn btn-primary btn-sm" data-act="complete" type="button">Withdraw &amp; complete</button>`
      : `<button class="btn btn-primary btn-sm" data-act="tx" type="button">Add / withdraw</button>`) +
    `<button class="btn btn-sm" data-act="hist" type="button">History</button>` +
    `<button class="btn btn-sm" data-act="edit" type="button">Edit</button>` +
    `<button class="btn btn-sm" data-act="del" type="button">Cancel goal</button></div></article>`
  );
}

export function renderHistory(goal) {
  if (!goal.history.length) return `<p class="text-sm ${muted}">No transactions yet.</p>`;
  return goal.history
    .map((h) =>
      listRow(h.type === 'deposit' ? 'Added' : 'Withdrawn', fmtDay(h.date.slice(0, 10)) + (h.note ? ' · ' + esc(h.note) : ''), amountText(h.type === 'deposit' ? '+' : '−', h.amount))
    )
    .join('');
}
