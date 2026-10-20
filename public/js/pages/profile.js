import { esc, money, initials, fmtDate } from '../utils.js';
import { buckets } from '../analytics.js';
import { muted, strong, panel, pageHead } from '../components.js';

const notificationState = (profile) => {
  if (typeof Notification === 'undefined') return 'Not supported in this browser';
  if (Notification.permission === 'denied') return 'Blocked in browser settings';
  return profile.notify && Notification.permission === 'granted' ? 'On' : 'Off';
};

export function renderProfile(data) {
  const { profile, goals, wallet, reminders, sample } = data;
  const emptyApp = !goals.length && !wallet.ledger.length && !reminders.length;
  const months = buckets(goals);
  const thisMonth = months[months.length - 1];
  const net = thisMonth.dep - thisMonth.wd;
  const recent = months.slice(3);
  const avg = Math.round(recent.reduce((s, x) => s + x.dep - x.wd, 0) / recent.length);
  const rate = profile.income > 0 ? Math.round((avg / profile.income) * 100) : null;
  const targetPct = profile.savingsTarget > 0 ? Math.min(100, Math.round((Math.max(0, net) / profile.savingsTarget) * 100)) : null;
  const hasPin = Boolean(profile.pinHash);
  const row = (label, body) => `<div class="flex flex-wrap items-center justify-between gap-3 border-b border-green-100 py-3 last:border-0 dark:border-green-900"><div><p class="text-sm font-semibold">${label}</p></div><div class="flex flex-wrap gap-2">${body}</div></div>`;

  const account =
    `<div class="mb-4 flex items-center gap-4"><div class="grid h-16 w-16 place-items-center rounded-full bg-green-600 text-xl font-extrabold text-white dark:bg-green-500 dark:text-green-950">${esc(initials(profile.name))}</div>` +
    `<div><p class="text-lg font-bold">${profile.name ? esc(profile.name) : 'Your profile'}</p><p class="text-xs ${muted}">Using the app since ${fmtDate(profile.createdAt)}</p></div></div>` +
    `<form data-form="profile" novalidate class="space-y-3"><label class="label">Your name<input name="name" class="field" maxlength="40" value="${esc(profile.name)}" placeholder="Vishal"></label>` +
    `<div class="grid grid-cols-2 gap-3"><label class="label">Monthly income (₹)<input name="income" class="field" type="number" min="0" step="1" inputmode="numeric" value="${profile.income || ''}"></label>` +
    `<label class="label">Monthly savings target (₹)<input name="savingsTarget" class="field" type="number" min="0" step="1" inputmode="numeric" value="${profile.savingsTarget || ''}"></label></div>` +
    `<p class="err" data-error="profile" role="alert"></p><button class="btn btn-primary" type="submit">Save profile</button></form>`;

  const stats =
    `<div class="space-y-3 text-sm"><div class="flex justify-between"><span class="${muted}">Saved this month</span><b class="${strong}">${money.format(net)}</b></div>` +
    (targetPct !== null ? `<div><div class="mb-1 flex justify-between"><span class="${muted}">Monthly savings target</span><b class="${strong}">${targetPct}%</b></div><div class="meter"><i style="width:${targetPct}%"></i></div></div>` : `<p class="${muted}">Set a monthly savings target to track it here.</p>`) +
    `<div class="flex justify-between"><span class="${muted}">Savings rate (3 month average)</span><b class="${strong}">${rate === null ? 'Add your income' : rate + '%'}</b></div>` +
    `<div class="flex justify-between"><span class="${muted}">Goals · Reminders · Wallet</span><b class="${strong}">${goals.length} · ${reminders.length} · ${money.format(wallet.balance)}</b></div></div>`;

  const prefs =
    row('Theme', '<button class="btn btn-sm" data-act="theme" type="button">Switch light / dark</button>') +
    row(`Browser reminders <span class="chip ml-1">${notificationState(profile)}</span>`, '<button class="btn btn-sm" data-act="notify-toggle" type="button">Turn on / off</button>') +
    `<p class="pt-2 text-xs ${muted}">Browser reminders show a daily summary when the app is open. They do not run while the browser is closed.</p>`;

  const security =
    row(`App lock <span class="chip ml-1">${hasPin ? 'PIN on' : 'PIN off'}</span>`,
      `<button class="btn btn-sm" data-act="pin-set" type="button">${hasPin ? 'Change PIN' : 'Set PIN'}</button>` +
      (hasPin ? '<button class="btn btn-sm" data-act="lock" type="button">Lock now</button><button class="btn btn-sm" data-act="pin-remove" type="button">Remove PIN</button>' : '')) +
    `<p class="pt-2 text-xs ${muted}">The PIN is stored as a salted hash and the app locks itself after 5 idle minutes. It keeps casual snoopers out, but your data stays in this browser and is not encrypted.</p>`;

  const dataPanel =
    row('Backup', '<button class="btn btn-sm" data-act="export-json" type="button">Download JSON</button><button class="btn btn-sm" data-act="export-csv" type="button">Download CSV</button>') +
    row('Restore', '<label class="btn btn-sm cursor-pointer">Import JSON backup<input data-import type="file" accept=".json,application/json" class="hidden"></label>') +
    `<p class="pt-2 text-xs ${muted}">Everything lives in this browser. Clearing site data deletes it, so download a backup now and then.</p>`;

  const demo = sample
    ? row('Sample data is loaded', '<button class="btn btn-sm" data-act="sample-clear" type="button">Clear sample data</button>') +
      `<p class="pt-2 text-xs ${muted}">Clearing removes all goals, wallet history and reminders. Your profile and PIN stay.</p>`
    : row('Try the app with demo data', `<button class="btn btn-sm" data-act="sample" type="button"${emptyApp ? '' : ' disabled'}>Add sample data</button>`) +
      `<p class="pt-2 text-xs ${muted}">${emptyApp ? 'Everything starts empty. This fills it with demo goals, wallet history and reminders so you can explore.' : 'Available only while the app is empty, so demo money never mixes with your real money.'}</p>`;

  const danger =
    row('Delete everything', '<button class="btn btn-sm" data-act="reset" type="button">Reset all data</button>') +
    `<p class="pt-2 text-xs ${muted}">Removes goals, wallet, reminders, profile and the PIN from this browser, including data saved by older versions. You will be asked to confirm.</p>`;

  return (
    pageHead('Profile', 'Your details, preferences and security.') +
    `<section class="grid grid-cols-12 gap-4">` +
    panel('col-span-12 lg:col-span-7', 'Account', account) +
    panel('col-span-12 lg:col-span-5', 'This month', stats) +
    panel('col-span-12 lg:col-span-6', 'Preferences', prefs) +
    panel('col-span-12 lg:col-span-6', 'Security', security) +
    panel('col-span-12 lg:col-span-6', 'Data and backup', dataPanel) +
    panel('col-span-12 lg:col-span-6', 'Demo data', demo) +
    panel('col-span-12 lg:col-span-6', 'Danger zone', danger) +
    `</section>`
  );
}
