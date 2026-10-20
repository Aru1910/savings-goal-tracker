import { esc, money, fmtDay } from '../utils.js';
import { isDone, monthlyNeed } from '../analytics.js';
import { muted, strong, icon, panel, kpi, pageHead, listRow, feed, amountText } from '../components.js';

const LABEL = {
  topup: 'Money added',
  spend: 'Spent or withdrawn',
  allocate: 'Moved into goal',
  release: 'Taken back from goal',
  refund: 'Refund from cancelled goal',
  complete: 'Withdrawn from completed goal'
};
const SIGN = { topup: '+', release: '+', refund: '+', complete: '+', spend: '−', allocate: '−' };

export function renderWallet(data) {
  const { wallet, goals } = data;
  const sum = (type) => wallet.ledger.filter((e) => e.type === type).reduce((s, e) => s + e.amount, 0);
  const added = sum('topup');
  const spent = sum('spend');
  const inGoals = goals.reduce((s, g) => s + g.saved, 0);
  const balanced = added - spent + wallet.opening === wallet.balance + inGoals;

  const ready = goals.filter(isDone).map((g) =>
    listRow(`${icon(g.category)} ${esc(g.name)}`, `100% reached · ${money.format(g.saved)} ready`,
      `<button class="btn btn-primary btn-sm" data-act="complete" data-id="${esc(g.id)}" type="button">Withdraw &amp; complete</button>`)
  );
  const open = goals.filter((g) => !isDone(g)).map((g) => {
    const remaining = g.target - g.saved;
    const need = Math.min(monthlyNeed(g) ?? remaining, remaining);
    const amount = Math.max(0, Math.min(need, wallet.balance));
    return listRow(`${icon(g.category)} ${esc(g.name)}`, `${g.priority} priority · needs ${money.format(remaining)} more`,
      `<button class="btn btn-primary btn-sm" data-act="pay" data-id="${esc(g.id)}" data-amount="${amount || ''}" type="button">Put money</button>`);
  });
  const ledger = wallet.ledger.slice(0, 40).map((e) =>
    listRow(LABEL[e.type] + (e.goal ? ' · ' + esc(e.goal) : ''), fmtDay(e.date.slice(0, 10)) + (e.note ? ' · ' + esc(e.note) : ''), amountText(SIGN[e.type], e.amount))
  );

  return (
    pageHead('Wallet', 'All money flows through here: add money, move it into goals, get it back.',
      '<button class="btn btn-primary" data-act="wallet-add" type="button">Add money</button><button class="btn" data-act="wallet-spend" type="button">Spend / withdraw</button>') +
    `<section class="grid grid-cols-2 gap-4 lg:grid-cols-4">` +
    kpi('Wallet balance', money.format(wallet.balance)) +
    kpi('Currently in goals', money.format(inGoals)) +
    kpi('Total added', money.format(added)) +
    kpi('Spent or withdrawn', money.format(spent)) +
    `</section>` +
    `<p class="mt-3 text-xs ${muted}">${balanced ? '✓' : '⚠'} Check: added ${money.format(added)} − spent ${money.format(spent)} = wallet ${money.format(wallet.balance)} + in goals ${money.format(inGoals)}</p>` +
    `<section class="mt-4 grid grid-cols-12 gap-4">` +
    panel('col-span-12 lg:col-span-6', 'Put wallet money into a goal',
      feed([...ready, ...open], goals.length ? 'Nothing to do here.' : 'Create a goal first.') +
      (wallet.balance === 0 && open.length ? `<p class="mt-3 text-sm ${strong}">Your wallet is empty. Add money first.</p>` : '')) +
    panel('col-span-12 lg:col-span-6', 'Wallet history', feed(ledger, 'No wallet activity yet.')) +
    `</section>`
  );
}
