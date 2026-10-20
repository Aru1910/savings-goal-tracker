import { esc, money, fmtDay } from '../utils.js';
import { smartReminders, reminderStatus, sortedReminders } from '../analytics.js';
import { muted, panel, pageHead, listRow, feed } from '../components.js';

const LEVEL = { urgent: '🔴', warn: '🟠', normal: '🟢' };
const STATUS_TEXT = { overdue: 'Overdue', today: 'Due today', soon: 'Due soon', later: 'Upcoming', done: 'Done' };
const FREQ_TEXT = { once: 'One time', weekly: 'Every week', monthly: 'Every month' };

export function renderReminders(data) {
  const byId = Object.fromEntries(data.goals.map((g) => [g.id, g]));
  const smart = smartReminders(data.goals).map((s) =>
    listRow(
      `${LEVEL[s.level]} ${esc(s.title)}`,
      s.detail,
      `<div class="flex flex-col items-end gap-1.5"><b>${money.format(s.amount)}</b><button class="btn btn-primary btn-sm" data-act="pay" data-id="${esc(s.goalId)}" data-amount="${s.amount}" type="button">Add money</button></div>`
    )
  );
  const custom = sortedReminders(data.reminders).map((r) => {
    const status = reminderStatus(r);
    const goal = byId[r.goalId];
    const chip = `<span class="chip ${['overdue', 'today'].includes(status) ? 'chip-strong' : ''}">${STATUS_TEXT[status]}</span>`;
    const buttons =
      (status !== 'done' ? `<button class="btn btn-sm" data-act="rem-done" data-id="${esc(r.id)}" type="button">Done</button>` : '') +
      (goal && status !== 'done' ? `<button class="btn btn-primary btn-sm" data-act="pay" data-id="${esc(goal.id)}" data-amount="${r.amount || ''}" type="button">Add money</button>` : '') +
      `<button class="btn btn-sm" data-act="rem-edit" data-id="${esc(r.id)}" type="button">Edit</button>` +
      `<button class="btn btn-sm" data-act="rem-del" data-id="${esc(r.id)}" type="button">Delete</button>`;
    return listRow(
      esc(r.title),
      `${fmtDay(r.due)} · ${FREQ_TEXT[r.frequency]}${goal ? ' · ' + esc(goal.name) : ''}${r.amount ? ' · ' + money.format(r.amount) : ''}`,
      `<div class="flex flex-col items-end gap-1.5">${chip}<div class="flex flex-wrap justify-end gap-1.5">${buttons}</div></div>`
    );
  });
  return (
    pageHead('Reminders', 'Never miss a deposit. Smart reminders update by themselves.', '<button class="btn btn-primary" data-act="rem-new" type="button">New reminder</button>') +
    `<section class="grid grid-cols-12 gap-4">` +
    panel('col-span-12 lg:col-span-5', 'Smart reminders', feed(smart, 'Nothing is due. Every open goal has a deposit this month.') +
      `<p class="mt-3 text-xs ${muted}">Built from your goals: deadlines, monthly needs and this month's deposits.</p>`) +
    panel('col-span-12 lg:col-span-7', 'Your reminders', feed(custom, 'No reminders yet. Create one to remind yourself to put money into a goal.')) +
    `</section>`
  );
}
