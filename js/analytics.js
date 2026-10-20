import { monthKey, todayIso, addDays } from './utils.js';

export const isDone = (g) => g.saved >= g.target;
export const pct = (g) => Math.min(100, Math.round((g.saved / g.target) * 100));

export function daysLeft(g) {
  if (!g.deadline) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(g.deadline + 'T00:00:00') - today) / 86400000);
}

export function monthlyNeed(g) {
  const d = daysLeft(g);
  if (d === null || d < 0 || isDone(g)) return null;
  return Math.ceil((g.target - g.saved) / Math.max(1, Math.ceil(d / 30.44)));
}

export function health(g) {
  if (isDone(g)) return 'Done';
  const d = daysLeft(g);
  if (d === null) return 'Open';
  if (d < 0) return 'Overdue';
  const start = new Date(g.createdAt).getTime();
  const span = new Date(g.deadline + 'T00:00:00').getTime() - start;
  if (span <= 0) return 'Behind';
  const expected = Math.min(1, Math.max(0, (Date.now() - start) / span));
  return g.saved / g.target >= expected - 0.1 ? 'On track' : 'Behind';
}

const PRIORITY_RANK = { High: 0, Medium: 1, Low: 2 };

export function query(goals, { q, filter, priority, sort }) {
  const needle = q.trim().toLowerCase();
  return goals
    .filter((g) => {
      if (filter === 'active' && isDone(g)) return false;
      if (filter === 'done' && !isDone(g)) return false;
      if (priority !== 'all' && g.priority !== priority) return false;
      return !needle || `${g.name} ${g.category}`.toLowerCase().includes(needle);
    })
    .sort((a, b) => {
      if (sort === 'progress') return pct(b) - pct(a);
      if (sort === 'target') return b.target - a.target;
      if (sort === 'priority') return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (sort === 'deadline') {
        if (!a.deadline && !b.deadline) return 0;
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return a.deadline < b.deadline ? -1 : 1;
      }
      return a.createdAt < b.createdAt ? 1 : -1;
    });
}

export function totals(goals) {
  const saved = goals.reduce((s, g) => s + g.saved, 0);
  const target = goals.reduce((s, g) => s + g.target, 0);
  return {
    saved,
    target,
    overall: target ? Math.min(100, Math.round((saved / target) * 100)) : 0,
    done: goals.filter(isDone).length,
    count: goals.length
  };
}

export function buckets(goals) {
  const now = new Date();
  const list = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    list.push({ key: monthKey(d), label: d.toLocaleDateString('en-IN', { month: 'short' }), dep: 0, wd: 0, bal: 0 });
  }
  for (const g of goals) {
    for (const h of g.history) {
      const b = list.find((x) => x.key === monthKey(new Date(h.date)));
      if (!b) continue;
      if (h.type === 'deposit') b.dep += h.amount;
      else b.wd += h.amount;
    }
  }
  let bal = goals.reduce((s, g) => s + g.saved, 0);
  for (let i = list.length - 1; i >= 0; i--) {
    list[i].bal = bal;
    bal -= list[i].dep - list[i].wd;
  }
  return list;
}

export function categoryTotals(goals) {
  const map = {};
  for (const g of goals) map[g.category] = (map[g.category] || 0) + g.saved;
  return Object.entries(map)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
}

export function insights(goals, months) {
  const recent = months.slice(3);
  const avg = Math.round(recent.reduce((s, x) => s + x.dep - x.wd, 0) / recent.length);
  const open = goals.filter((g) => !isDone(g));
  const remaining = open.reduce((s, g) => s + (g.target - g.saved), 0);
  let projection = null;
  if (remaining > 0 && avg > 0) {
    projection = new Date();
    projection.setMonth(projection.getMonth() + Math.ceil(remaining / avg));
  }
  const best = months.reduce((a, x) => (x.dep > a.dep ? x : a), months[0]);
  const closest = [...open].sort((a, b) => pct(b) - pct(a))[0] || null;
  const states = goals.map(health);
  return {
    avg,
    remaining,
    projection,
    best,
    closest,
    overdue: states.filter((s) => s === 'Overdue').length,
    behind: states.filter((s) => s === 'Behind').length,
    onTrack: states.filter((s) => s === 'On track').length
  };
}

export function activity(goals, limit) {
  const all = [];
  for (const g of goals) for (const h of g.history) all.push({ goal: g, tx: h });
  return all.sort((a, b) => (a.tx.date < b.tx.date ? 1 : -1)).slice(0, limit);
}

export function upcoming(goals, limit) {
  return goals
    .filter((g) => !isDone(g) && g.deadline)
    .sort((a, b) => (a.deadline < b.deadline ? -1 : 1))
    .slice(0, limit);
}

export const depositedThisMonth = (g) => {
  const key = monthKey(new Date());
  return g.history.some((h) => h.type === 'deposit' && monthKey(new Date(h.date)) === key);
};

const LEVEL_RANK = { urgent: 0, warn: 1, normal: 2 };

export function smartReminders(goals) {
  const out = [];
  for (const g of goals) {
    if (isDone(g)) continue;
    const state = health(g);
    const need = monthlyNeed(g);
    if (g.autoMissed > 0) {
      out.push({
        goalId: g.id,
        level: 'warn',
        title: `Auto plan skipped for ${g.name}`,
        detail: `Your wallet was short for ${g.autoMissed} month${g.autoMissed === 1 ? '' : 's'}. Add money to your wallet, then add to the goal.`,
        amount: Math.min(g.monthly || g.target - g.saved, g.target - g.saved)
      });
    }
    if (state === 'Overdue') {
      out.push({ goalId: g.id, level: 'urgent', title: `${g.name} is past its deadline`, detail: 'Add what you can, or move the deadline.', amount: g.target - g.saved });
    } else if (need !== null && !depositedThisMonth(g)) {
      out.push({
        goalId: g.id,
        level: state === 'Behind' ? 'warn' : 'normal',
        title: `Add money to ${g.name}`,
        detail: state === 'Behind' ? 'You are behind schedule for this goal.' : 'No deposit yet this month.',
        amount: need
      });
    }
  }
  return out.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level]);
}

export function reminderStatus(r) {
  if (r.done) return 'done';
  const today = todayIso();
  if (r.due < today) return 'overdue';
  if (r.due === today) return 'today';
  return r.due <= addDays(today, 3) ? 'soon' : 'later';
}

const STATUS_RANK = { overdue: 0, today: 1, soon: 2, later: 3, done: 4 };

export const sortedReminders = (reminders) =>
  [...reminders].sort((a, b) => {
    const diff = STATUS_RANK[reminderStatus(a)] - STATUS_RANK[reminderStatus(b)];
    return diff || (a.due < b.due ? -1 : 1);
  });

export const attentionCount = (goals, reminders) =>
  smartReminders(goals).length + reminders.filter((r) => ['overdue', 'today'].includes(reminderStatus(r))).length;
