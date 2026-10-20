import { uid, toInt, monthKey, todayIso, addDays, addMonths, readStorage, writeStorage, removeStorage } from './utils.js';

export const CATEGORIES = [
  ['Travel', '✈️'],
  ['Emergency', '🛡️'],
  ['Gadget', '💻'],
  ['Education', '🎓'],
  ['Home', '🏠'],
  ['Vehicle', '🚗'],
  ['Wedding', '💍'],
  ['Other', '🎯']
];
export const PRIORITIES = ['High', 'Medium', 'Low'];
export const FREQUENCIES = ['once', 'weekly', 'monthly'];
export const MAX_AMOUNT = 100000000;

const KEY = 'sgt:data:v4';
const OLD_KEYS = ['sgt:data:v3', 'sgt:goals:v2', 'sgt:goals:v1'];
const SIGN = { topup: 1, release: 1, refund: 1, complete: 1, spend: -1, allocate: -1 };
const LEDGER_MAX = 5000;

const nowIso = () => new Date().toISOString();
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
const text = (v, n) => String(v || '').trim().slice(0, n);
const cleanAmount = (v) => {
  const n = toInt(v);
  return n >= 0 && n <= MAX_AMOUNT ? n : NaN;
};
const rupees = (n) => '₹' + n.toLocaleString('en-IN');
const netOf = (entries) => entries.reduce((s, e) => s + SIGN[e.type] * e.amount, 0);
const historyNet = (history) => history.reduce((s, h) => s + (h.type === 'deposit' ? h.amount : -h.amount), 0);
const byDateDesc = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

const blank = () => ({
  version: 4,
  sample: false,
  goals: [],
  wallet: { opening: 0, balance: 0, ledger: [] },
  reminders: [],
  profile: {
    name: '',
    income: 0,
    savingsTarget: 0,
    notify: false,
    lastNotified: '',
    pinHash: '',
    pinSalt: '',
    createdAt: nowIso()
  }
});

let data = blank();
let onSaveError = () => {};
const listeners = new Set();

export const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const setSaveErrorHandler = (fn) => {
  onSaveError = fn;
};

function reconcile() {
  for (const g of data.goals) g.saved = historyNet(g.history);
  data.wallet.balance = data.wallet.opening + netOf(data.wallet.ledger);
}

const emit = () => listeners.forEach((fn) => fn(data));
const commit = () => {
  reconcile();
  if (!writeStorage(KEY, JSON.stringify(data))) onSaveError();
  emit();
};

export const getData = () => data;
export const getGoals = () => data.goals;
export const getWallet = () => data.wallet;
export const getReminders = () => data.reminders;
export const getProfile = () => data.profile;
export const findGoal = (id) => data.goals.find((g) => g.id === id) || null;
export const findReminder = (id) => data.reminders.find((r) => r.id === id) || null;
export const isEmptyApp = () => !data.goals.length && !data.wallet.ledger.length && !data.reminders.length;

const snapshotUndo = () => {
  const snap = JSON.stringify(data);
  return () => {
    data = JSON.parse(snap);
    commit();
  };
};

function pushLedger(type, amount, note, goal, date = nowIso()) {
  const ledger = data.wallet.ledger;
  ledger.unshift({ id: uid(), type, amount, note: text(note, 80), goal: goal || '', date });
  if (ledger.length > LEDGER_MAX) data.wallet.opening += netOf(ledger.splice(LEDGER_MAX));
}

export function sanitizeGoals(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const g of list) {
    if (!g || typeof g !== 'object') continue;
    const target = cleanAmount(g.target);
    if (!text(g.name, 60) || !(target > 0)) continue;
    const history = (Array.isArray(g.history) ? g.history : [])
      .filter((h) => h && typeof h === 'object' && cleanAmount(h.amount) > 0)
      .map((h) => ({
        id: String(h.id || uid()),
        type: h.type === 'withdraw' ? 'withdraw' : 'deposit',
        amount: cleanAmount(h.amount),
        note: text(h.note, 80),
        date: String(h.date || nowIso())
      }));
    const saved = historyNet(history);
    if (saved < 0) continue;
    out.push({
      id: String(g.id || uid()),
      name: text(g.name, 60),
      category: CATEGORIES.some(([n]) => n === g.category) ? g.category : 'Other',
      priority: PRIORITIES.includes(g.priority) ? g.priority : 'Medium',
      target,
      saved,
      deadline: isDate(g.deadline) ? g.deadline : '',
      monthly: cleanAmount(g.monthly) || 0,
      autoMissed: Math.min(99, Math.max(0, toInt(g.autoMissed) || 0)),
      lastAuto: /^\d{4}-\d{2}$/.test(g.lastAuto || '') ? g.lastAuto : monthKey(new Date()),
      createdAt: String(g.createdAt || nowIso()),
      history
    });
  }
  return out;
}

function sanitizeWallet(w) {
  const ledger = (Array.isArray(w?.ledger) ? w.ledger : [])
    .filter((e) => e && typeof e === 'object' && e.type in SIGN && cleanAmount(e.amount) > 0)
    .slice(0, LEDGER_MAX)
    .map((e) => ({
      id: String(e.id || uid()),
      type: e.type,
      amount: cleanAmount(e.amount),
      note: text(e.note, 80),
      goal: text(e.goal, 60),
      date: String(e.date || nowIso())
    }));
  const opening = toInt(w?.opening);
  return { opening: Number.isFinite(opening) && Math.abs(opening) <= 1e13 ? opening : 0, balance: 0, ledger };
}

function sanitizeReminders(list) {
  const out = [];
  for (const r of list) {
    if (!r || typeof r !== 'object' || !text(r.title, 80) || !isDate(r.due)) continue;
    out.push({
      id: String(r.id || uid()),
      title: text(r.title, 80),
      goalId: String(r.goalId || ''),
      amount: cleanAmount(r.amount) || 0,
      frequency: FREQUENCIES.includes(r.frequency) ? r.frequency : 'once',
      due: r.due,
      done: Boolean(r.done),
      lastDone: isDate(r.lastDone) ? r.lastDone : '',
      createdAt: String(r.createdAt || nowIso())
    });
  }
  return out;
}

function sanitizeProfile(p, keepPin) {
  const base = blank().profile;
  if (!p || typeof p !== 'object') return base;
  return {
    name: text(p.name, 40),
    income: cleanAmount(p.income) || 0,
    savingsTarget: cleanAmount(p.savingsTarget) || 0,
    notify: Boolean(p.notify),
    lastNotified: isDate(p.lastNotified) ? p.lastNotified : '',
    pinHash: keepPin ? String(p.pinHash || '') : '',
    pinSalt: keepPin ? String(p.pinSalt || '') : '',
    createdAt: String(p.createdAt || base.createdAt)
  };
}

export function sanitizeData(input, keepPin = false) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.goals) || !input.wallet) return null;
  return {
    goals: sanitizeGoals(input.goals),
    wallet: sanitizeWallet(input.wallet),
    reminders: Array.isArray(input.reminders) ? sanitizeReminders(input.reminders) : [],
    profile: sanitizeProfile(input.profile, keepPin),
    sample: Boolean(input.sample)
  };
}

function load() {
  const base = blank();
  const raw = readStorage(KEY);
  if (!raw) return base;
  try {
    const clean = sanitizeData(JSON.parse(raw), true);
    if (!clean) return base;
    const shortfall = clean.wallet.opening + netOf(clean.wallet.ledger);
    if (shortfall < 0) clean.wallet.opening -= shortfall;
    return { ...base, ...clean };
  } catch {
    return base;
  }
}

function applyRecurring() {
  const current = monthKey(new Date());
  let changed = false;
  for (const g of data.goals) {
    if (!g.monthly) {
      g.lastAuto = current;
      continue;
    }
    let guard = 0;
    while (g.lastAuto < current && guard++ < 36) {
      const [y, m] = g.lastAuto.split('-').map(Number);
      const next = new Date(y, m, 1);
      g.lastAuto = monthKey(next);
      const room = g.target - historyNet(g.history);
      if (room <= 0) continue;
      const amount = Math.min(g.monthly, room);
      const date = next.toISOString();
      if (data.wallet.opening + netOf(data.wallet.ledger) >= amount) {
        g.history.unshift({ id: uid(), type: 'deposit', amount, note: 'Auto monthly plan', date });
        pushLedger('allocate', amount, 'Auto monthly plan', g.name, date);
        changed = true;
      } else {
        g.autoMissed = Math.min(99, (g.autoMissed || 0) + 1);
      }
    }
    g.history.sort(byDateDesc);
  }
  if (changed) data.wallet.ledger.sort(byDateDesc);
}

export function init() {
  data = load();
  applyRecurring();
  commit();
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key !== KEY) return;
      data = load();
      emit();
    });
  }
}

export function validateGoal({ name, target, monthly = 0 }) {
  if (!name) return 'Enter a name for your goal.';
  if (!(target > 0)) return 'Target must be at least ₹1.';
  if (target > MAX_AMOUNT) return `Target cannot be more than ${rupees(MAX_AMOUNT)}.`;
  if (!(monthly >= 0) || monthly > MAX_AMOUNT) return 'Enter a valid monthly plan.';
  return '';
}

export function addGoal(input) {
  const error = validateGoal(input);
  if (error) return { ok: false, error };
  const goal = {
    id: uid(),
    name: text(input.name, 60),
    category: input.category,
    priority: input.priority,
    target: input.target,
    saved: 0,
    deadline: input.deadline || '',
    monthly: input.monthly || 0,
    autoMissed: 0,
    lastAuto: monthKey(new Date()),
    createdAt: nowIso(),
    history: []
  };
  data.goals.push(goal);
  commit();
  return { ok: true, goal };
}

export function updateGoal(id, patch) {
  const goal = findGoal(id);
  if (!goal) return { ok: false, error: 'Goal not found.' };
  const error = validateGoal(patch);
  if (error) return { ok: false, error };
  if (patch.target < goal.saved) {
    return { ok: false, error: `Target cannot be less than the ${rupees(goal.saved)} already saved in this goal. Withdraw some money first.` };
  }
  Object.assign(goal, { ...patch, name: text(patch.name, 60) });
  commit();
  return { ok: true };
}

export function removeGoal(id) {
  const index = data.goals.findIndex((g) => g.id === id);
  if (index < 0) return { ok: false };
  const undo = snapshotUndo();
  const [removed] = data.goals.splice(index, 1);
  const refunded = historyNet(removed.history);
  data.reminders = data.reminders.filter((r) => r.goalId !== id);
  if (refunded > 0) pushLedger('refund', refunded, 'Goal cancelled', removed.name);
  commit();
  return { ok: true, undo, removed, refunded };
}

export function completeGoal(id) {
  const goal = findGoal(id);
  if (!goal) return { ok: false, error: 'Goal not found.' };
  const saved = historyNet(goal.history);
  if (saved < goal.target) return { ok: false, error: 'This goal has not reached 100% yet.' };
  const undo = snapshotUndo();
  data.goals = data.goals.filter((g) => g.id !== id);
  data.reminders = data.reminders.filter((r) => r.goalId !== id);
  pushLedger('complete', saved, 'Goal completed', goal.name);
  commit();
  return { ok: true, undo, amount: saved, name: goal.name };
}

export function addTransaction(id, { type, amount, note }) {
  const goal = findGoal(id);
  if (!goal) return { ok: false, error: 'Goal not found.' };
  if (!Number.isInteger(amount) || amount < 1) return { ok: false, error: 'Enter a whole amount of at least ₹1.' };
  if (amount > MAX_AMOUNT) return { ok: false, error: `Amount cannot be more than ${rupees(MAX_AMOUNT)}.` };
  const saved = historyNet(goal.history);
  if (type === 'withdraw') {
    if (amount > saved) return { ok: false, error: `You can withdraw at most ${rupees(saved)} from this goal.` };
    goal.history.unshift({ id: uid(), type, amount, note: text(note, 80), date: nowIso() });
    pushLedger('release', amount, note, goal.name);
    commit();
    return { ok: true, completed: false };
  }
  const remaining = goal.target - saved;
  if (remaining <= 0) return { ok: false, error: 'This goal is already complete. Use Withdraw & complete.' };
  if (amount > remaining) return { ok: false, error: `This goal needs only ${rupees(remaining)} more.` };
  const balance = data.wallet.opening + netOf(data.wallet.ledger);
  if (amount > balance) {
    return { ok: false, error: `Your wallet has ${rupees(balance)}. Add ${rupees(amount - balance)} to your wallet first.`, shortfall: amount - balance };
  }
  goal.history.unshift({ id: uid(), type, amount, note: text(note, 80), date: nowIso() });
  goal.autoMissed = 0;
  pushLedger('allocate', amount, note, goal.name);
  commit();
  return { ok: true, completed: saved + amount >= goal.target };
}

export function walletEntry({ type, amount, note }) {
  if (!['topup', 'spend'].includes(type)) return { ok: false, error: 'Unknown wallet action.' };
  if (!Number.isInteger(amount) || amount < 1) return { ok: false, error: 'Enter a whole amount of at least ₹1.' };
  if (amount > MAX_AMOUNT) return { ok: false, error: `Amount cannot be more than ${rupees(MAX_AMOUNT)}.` };
  const balance = data.wallet.opening + netOf(data.wallet.ledger);
  if (type === 'spend' && amount > balance) return { ok: false, error: `Your wallet has only ${rupees(balance)}.` };
  pushLedger(type, amount, note, '');
  commit();
  return { ok: true };
}

export function validateReminder({ title, due, amount }) {
  if (!text(title, 80)) return 'Enter a title for the reminder.';
  if (!isDate(due)) return 'Pick a due date.';
  if (!(amount >= 0) || amount > MAX_AMOUNT) return 'Enter a valid amount.';
  return '';
}

export function saveReminder(id, input) {
  const error = validateReminder(input);
  if (error) return { ok: false, error };
  const clean = {
    title: text(input.title, 80),
    goalId: input.goalId || '',
    amount: input.amount || 0,
    frequency: FREQUENCIES.includes(input.frequency) ? input.frequency : 'once',
    due: input.due
  };
  const existing = id ? findReminder(id) : null;
  if (existing) Object.assign(existing, clean, { done: false });
  else data.reminders.push({ id: uid(), ...clean, done: false, lastDone: '', createdAt: nowIso() });
  commit();
  return { ok: true };
}

export function removeReminder(id) {
  const undo = snapshotUndo();
  data.reminders = data.reminders.filter((r) => r.id !== id);
  commit();
  return { ok: true, undo };
}

export function completeReminder(id) {
  const r = findReminder(id);
  if (!r) return;
  r.lastDone = todayIso();
  if (r.frequency === 'once') {
    r.done = true;
  } else {
    const step = (d) => (r.frequency === 'weekly' ? addDays(d, 7) : addMonths(d, 1));
    let next = step(r.due);
    let guard = 0;
    while (next <= todayIso() && guard++ < 120) next = step(next);
    r.due = next;
  }
  commit();
}

export function updateProfile(patch) {
  const name = text(patch.name ?? data.profile.name, 40);
  const income = patch.income === undefined ? data.profile.income : cleanAmount(patch.income);
  const savingsTarget = patch.savingsTarget === undefined ? data.profile.savingsTarget : cleanAmount(patch.savingsTarget);
  if (!(income >= 0)) return { ok: false, error: 'Enter a valid monthly income.' };
  if (!(savingsTarget >= 0)) return { ok: false, error: 'Enter a valid monthly savings target.' };
  Object.assign(data.profile, patch, { name, income, savingsTarget });
  commit();
  return { ok: true };
}

export function setPinData(hash, salt) {
  data.profile.pinHash = hash;
  data.profile.pinSalt = salt;
  commit();
}

export function clearPinData() {
  data.profile.pinHash = '';
  data.profile.pinSalt = '';
  commit();
}

export function exportData() {
  const { pinHash, pinSalt, lastNotified, ...profile } = data.profile;
  return {
    app: 'savings-goal-tracker',
    version: 4,
    exportedAt: nowIso(),
    goals: data.goals,
    wallet: { opening: data.wallet.opening, ledger: data.wallet.ledger },
    reminders: data.reminders,
    profile
  };
}

export function readBackup(textValue) {
  let parsed;
  try {
    parsed = JSON.parse(textValue);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }
  if (!parsed || parsed.version !== 4) {
    return { ok: false, error: 'This backup was made by an older version, where money was not tracked through the wallet. It cannot be imported safely.' };
  }
  const clean = sanitizeData(parsed, false);
  if (!clean) return { ok: false, error: 'That file does not look like a savings backup.' };
  if (clean.wallet.opening + netOf(clean.wallet.ledger) < 0) {
    return { ok: false, error: 'This backup is inconsistent: its wallet history adds up to a negative balance.' };
  }
  return { ok: true, clean, counts: { goals: clean.goals.length, reminders: clean.reminders.length } };
}

export function applyBackup(clean) {
  const undo = snapshotUndo();
  data.goals = clean.goals;
  data.wallet = clean.wallet;
  data.reminders = clean.reminders;
  data.sample = false;
  data.profile = { ...clean.profile, pinHash: data.profile.pinHash, pinSalt: data.profile.pinSalt, lastNotified: data.profile.lastNotified };
  commit();
  return { ok: true, undo };
}

export function loadSampleData(bundle) {
  if (!isEmptyApp()) {
    return { ok: false, error: 'Sample data can only be added while the app is empty, so it never mixes with your real money.' };
  }
  data.goals = bundle.goals;
  data.wallet = { opening: 0, balance: 0, ledger: bundle.ledger.sort(byDateDesc) };
  data.reminders = bundle.reminders;
  data.sample = true;
  commit();
  return { ok: true };
}

export function clearMoneyData() {
  const undo = snapshotUndo();
  data.goals = [];
  data.wallet = { opening: 0, balance: 0, ledger: [] };
  data.reminders = [];
  data.sample = false;
  commit();
  return { ok: true, undo };
}

export function resetAll() {
  data = blank();
  for (const key of OLD_KEYS) removeStorage(key);
  commit();
}
