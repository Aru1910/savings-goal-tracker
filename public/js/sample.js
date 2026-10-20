import { uid, isoDaysAgo, dateIn, monthKey, todayIso } from './utils.js';

const SPECS = [
  ['Goa trip', 'Travel', 'High', 60000, 25, 0, [[165, 8000, 'Savings'], [135, 7000, ''], [100, 9000, 'Bonus'], [62, 6000, ''], [33, 8000, ''], [6, 7000, '']]],
  ['New laptop', 'Gadget', 'Medium', 90000, 120, 10000, [[150, 12000, ''], [118, 10000, ''], [85, 15000, 'Freelance'], [40, -5000, 'Phone repair'], [12, 12000, '']]],
  ['Emergency fund', 'Emergency', 'High', 200000, 300, 15000, [[170, 20000, ''], [140, 15000, ''], [105, 15000, ''], [70, 20000, ''], [35, 15000, ''], [8, 20000, 'Salary']]],
  ['Course fees', 'Education', 'Low', 40000, 20, 0, [[90, 10000, ''], [55, 10000, ''], [25, 12000, ''], [9, 8000, 'Gift']]]
];

const later = (iso, seconds) => new Date(Date.parse(iso) + seconds * 1000).toISOString();

export function sampleBundle() {
  const goals = [];
  const ledger = [];
  const entry = (type, amount, note, goal, date) => ledger.push({ id: uid(), type, amount, note, goal, date });

  for (const [name, category, priority, target, deadlineDays, monthly, txs] of SPECS) {
    const goal = {
      id: uid(),
      name,
      category,
      priority,
      target,
      saved: 0,
      deadline: dateIn(deadlineDays),
      monthly,
      autoMissed: 0,
      lastAuto: monthKey(new Date()),
      createdAt: isoDaysAgo(txs[0][0]),
      history: []
    };
    for (const [daysAgo, amount, note] of txs) {
      const date = isoDaysAgo(daysAgo);
      const amt = Math.abs(amount);
      if (amount > 0) {
        entry('topup', amt, note || 'Added to wallet', '', date);
        entry('allocate', amt, note, name, later(date, 1));
        goal.history.unshift({ id: uid(), type: 'deposit', amount: amt, note, date: later(date, 1) });
      } else {
        entry('release', amt, note, name, date);
        entry('spend', amt, note, '', later(date, 1));
        goal.history.unshift({ id: uid(), type: 'withdraw', amount: amt, note, date });
      }
    }
    goals.push(goal);
  }

  entry('topup', 25000, 'Salary', '', isoDaysAgo(2));

  const reminders = [
    { id: uid(), title: 'Monthly top-up for laptop', goalId: goals[1].id, amount: 10000, frequency: 'monthly', due: todayIso(), done: false, lastDone: '', createdAt: new Date().toISOString() },
    { id: uid(), title: 'Put money in Goa trip', goalId: goals[0].id, amount: 5000, frequency: 'weekly', due: dateIn(3), done: false, lastDone: '', createdAt: new Date().toISOString() }
  ];

  return { goals, ledger, reminders };
}
