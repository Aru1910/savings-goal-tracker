import { esc, money, fmtDay } from '../utils.js';
import { pct, daysLeft, totals, buckets, categoryTotals, insights, activity, upcoming, smartReminders, reminderStatus } from '../analytics.js';
import { lineChart, barChart, donut } from '../charts.js';
import { muted, strong, icon, panel, kpi, pageHead, listRow, feed, amountText, emptyState } from '../components.js';

function insightRows(goals, months) {
  const i = insights(goals, months);
  const projection = i.remaining === 0
    ? 'Nothing left to save'
    : i.projection
      ? i.projection.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
      : 'Save more to project';
  const rows = [
    ['Average monthly saving', money.format(i.avg)],
    ['Remaining across open goals', money.format(i.remaining)],
    ['Projected to finish all goals', projection],
    ['Best month for deposits', i.best.dep ? `${i.best.label} · ${money.format(i.best.dep)}` : 'No deposits yet'],
    ['Closest to finishing', i.closest ? `${esc(i.closest.name)} · ${pct(i.closest)}%` : 'All goals complete'],
    ['On track · Behind · Overdue', `${i.onTrack} · ${i.behind} · ${i.overdue}`]
  ];
  return `<div class="space-y-2">${rows
    .map(([l, v]) => `<div class="flex justify-between gap-3 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm dark:border-green-900 dark:bg-green-950"><span class="${muted}">${l}</span><b class="text-right ${strong}">${v}</b></div>`)
    .join('')}</div>`;
}

function progressList(goals) {
  const list = [...goals].sort((a, b) => pct(b) - pct(a)).slice(0, 6);
  return `<div class="space-y-3">${list
    .map((g) => `<div><div class="mb-1 flex justify-between text-sm"><span class="truncate font-semibold">${icon(g.category)} ${esc(g.name)}</span><span class="${muted}">${pct(g)}%</span></div><div class="meter"><i style="width:${pct(g)}%"></i></div></div>`)
    .join('')}</div>`;
}

function attention(data) {
  const rows = [];
  for (const s of smartReminders(data.goals).slice(0, 3)) {
    rows.push(listRow(esc(s.title), s.detail, `<button class="btn btn-primary btn-sm" data-act="pay" data-id="${esc(s.goalId)}" data-amount="${s.amount}" type="button">Add ${money.format(s.amount)}</button>`));
  }
  for (const r of data.reminders) {
    const status = reminderStatus(r);
    if (!['overdue', 'today', 'soon'].includes(status) || rows.length >= 5) continue;
    rows.push(listRow(esc(r.title), `${status === 'overdue' ? 'Overdue since' : 'Due'} ${fmtDay(r.due)}`, `<button class="btn btn-sm" data-act="rem-done" data-id="${esc(r.id)}" type="button">Done</button>`));
  }
  return feed(rows, 'You are all caught up. Nothing needs your attention right now.');
}

export function renderDashboard(data) {
  const { goals, wallet, profile } = data;
  const banner = data.sample
    ? `<div class="card mb-4 flex flex-wrap items-center justify-between gap-3 border-dashed"><p class="text-sm">You are viewing <b>sample data</b>. Nothing here is real money.</p><button class="btn btn-sm" data-act="sample-clear" type="button">Clear sample data</button></div>`
    : '';
  const hello = profile.name ? `Hi ${esc(profile.name.split(' ')[0])}, here is your progress` : 'Your savings at a glance';
  if (!goals.length) {
    return pageHead('Dashboard', hello) + banner + `<div class="grid grid-cols-1">${emptyState('Start your first goal', 'Pick something you want, set a target, and track every rupee you set aside.',
      '<button class="btn btn-primary" data-act="new" type="button">Create a goal</button><button class="btn" data-act="sample" type="button">Try sample data</button>')}</div>`;
  }
  const t = totals(goals);
  const months = buckets(goals);
  const thisMonth = months[months.length - 1];
  const recent = activity(goals, 6).map(({ goal, tx }) =>
    listRow(esc(goal.name), fmtDay(tx.date.slice(0, 10)) + (tx.note ? ' · ' + esc(tx.note) : ''), amountText(tx.type === 'deposit' ? '+' : '−', tx.amount)));
  const due = upcoming(goals, 5).map((g) => {
    const d = daysLeft(g);
    return listRow(esc(g.name), `${fmtDay(g.deadline)} · ${pct(g)}% done`, `<b class="whitespace-nowrap ${strong}">${d < 0 ? `Overdue by ${Math.abs(d)}d` : d === 0 ? 'Due today' : `${d} days left`}</b>`);
  });
  return (
    pageHead('Dashboard', hello, '<button class="btn btn-primary" data-act="new" type="button">New goal</button>') +
    banner +
    `<section class="grid grid-cols-2 gap-4 lg:grid-cols-5" aria-live="polite">` +
    kpi('Total saved', money.format(t.saved)) +
    kpi('Total target', money.format(t.target)) +
    kpi('Overall progress', t.overall + '%', `<div class="meter mt-2"><i style="width:${t.overall}%"></i></div>`) +
    kpi('Saved this month', money.format(thisMonth.dep - thisMonth.wd)) +
    kpi('Wallet balance', money.format(wallet.balance)) +
    `</section><section class="mt-4 grid grid-cols-12 gap-4">` +
    panel('col-span-12 lg:col-span-7', 'Savings growth', lineChart(months)) +
    panel('col-span-12 lg:col-span-5', 'Savings by category', donut(categoryTotals(goals))) +
    panel('col-span-12 lg:col-span-7', 'Monthly deposits and withdrawals', barChart(months)) +
    panel('col-span-12 lg:col-span-5', 'Insights', insightRows(goals, months)) +
    panel('col-span-12 lg:col-span-6', 'Needs your attention', attention(data)) +
    panel('col-span-12 lg:col-span-6', 'Goal progress', progressList(goals)) +
    panel('col-span-12 lg:col-span-6', 'Recent activity', feed(recent, 'No transactions yet.')) +
    panel('col-span-12 lg:col-span-6', 'Upcoming deadlines', feed(due, 'No open goals have a deadline.')) +
    `</section>`
  );
}
