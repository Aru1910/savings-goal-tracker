import { $, toInt, download, esc, money, todayIso, dateIn, writeStorage } from './utils.js';
import {
  CATEGORIES, PRIORITIES, FREQUENCIES, getGoals, getWallet, getProfile, findGoal, findReminder,
  addGoal, updateGoal, removeGoal, completeGoal, addTransaction, walletEntry, saveReminder, removeReminder,
  completeReminder, updateProfile, setPinData, clearPinData, exportData, readBackup, applyBackup,
  loadSampleData, clearMoneyData, resetAll
} from './store.js';
import { sampleBundle } from './sample.js';
import { renderHistory } from './components.js';
import { openDialog, closeDialog, toast, confirmAction } from './ui.js';
import { createPin, verifyPin, isValidPin, clearLockout, lockApp } from './security.js';
import { requestPermission, maybeNotify } from './notify.js';

const ctx = { goalId: null, txGoalId: null, walletType: 'topup', reminderId: null, pinMode: 'set', shortfall: 0 };

export function fillSelects() {
  $('#gCat').innerHTML = CATEGORIES.map(([n, i]) => `<option value="${n}">${i} ${n}</option>`).join('');
  $('#gPri').innerHTML = PRIORITIES.map((p) => `<option value="${p}">${p}</option>`).join('');
  $('#rFreq').innerHTML = FREQUENCIES.map((f) => `<option value="${f}">${{ once: 'One time', weekly: 'Every week', monthly: 'Every month' }[f]}</option>`).join('');
}

function openGoalForm(id) {
  ctx.goalId = id || null;
  const g = id ? findGoal(id) : null;
  $('#goalTitle').textContent = g ? 'Edit goal' : 'New goal';
  $('#gName').value = g ? g.name : '';
  $('#gCat').value = g ? g.category : 'Travel';
  $('#gPri').value = g ? g.priority : 'Medium';
  $('#gTarget').value = g ? g.target : '';
  $('#gDate').value = g ? g.deadline : '';
  $('#gMonthly').value = g ? g.monthly : 0;
  $('#goalErr').textContent = '';
  openDialog('goalDlg');
  $('#gName').focus();
}

export function submitGoal() {
  const input = {
    name: $('#gName').value.trim(),
    category: $('#gCat').value,
    priority: $('#gPri').value,
    target: toInt($('#gTarget').value),
    deadline: $('#gDate').value,
    monthly: toInt($('#gMonthly').value || 0)
  };
  const editing = Boolean(ctx.goalId);
  const result = editing ? updateGoal(ctx.goalId, input) : addGoal(input);
  if (!result.ok) return void ($('#goalErr').textContent = result.error);
  closeDialog('goalDlg');
  toast(editing ? 'Goal updated' : 'Goal created. Move money into it from your wallet.');
}

function syncTxHint() {
  const g = findGoal(ctx.txGoalId);
  if (!g) return;
  const type = document.querySelector('input[name="txType"]:checked').value;
  $('#txHint').textContent =
    type === 'deposit'
      ? `Money comes from your wallet (${money.format(getWallet().balance)} available). This goal needs ${money.format(Math.max(0, g.target - g.saved))} more.`
      : `Money goes back to your wallet. This goal holds ${money.format(g.saved)}.`;
}

export function onTxTypeChange() {
  $('#txErr').textContent = '';
  $('#txTopup').classList.add('hidden');
  syncTxHint();
}

function openTx(id, amount = '') {
  const g = findGoal(id);
  if (!g) return toast('That goal no longer exists.');
  ctx.txGoalId = id;
  $('#txTitle').textContent = g.name;
  $('#txAmt').value = amount || '';
  $('#txNote').value = '';
  $('#txErr').textContent = '';
  $('#txTopup').classList.add('hidden');
  document.querySelector('input[name="txType"][value="deposit"]').checked = true;
  syncTxHint();
  openDialog('txDlg');
  $('#txAmt').focus();
}

export async function submitTx() {
  const g = findGoal(ctx.txGoalId);
  if (!g) return;
  const type = document.querySelector('input[name="txType"]:checked').value;
  const amount = toInt($('#txAmt').value);
  if (type === 'withdraw' && amount > 0 && amount <= g.saved && amount >= g.saved / 2) {
    const answer = await confirmAction({
      title: 'Take back a large amount?',
      message: `You are taking ${money.format(amount)} out of "${g.name}" (${Math.round((amount / g.saved) * 100)}% of what it holds). It goes back to your wallet.`,
      confirmLabel: 'Take it back'
    });
    if (!answer.ok) return;
  }
  const result = addTransaction(ctx.txGoalId, { type, amount, note: $('#txNote').value });
  if (!result.ok) {
    $('#txErr').textContent = result.error;
    ctx.shortfall = result.shortfall || 0;
    $('#txTopup').textContent = `Add ${money.format(ctx.shortfall)} to wallet`;
    $('#txTopup').classList.toggle('hidden', !ctx.shortfall);
    return;
  }
  closeDialog('txDlg');
  toast(result.completed ? 'Goal reached 🎉 Use "Withdraw & complete" to collect it.' : type === 'deposit' ? 'Moved from wallet into the goal' : 'Moved back to your wallet');
}

export function topupShortfall() {
  const g = findGoal(ctx.txGoalId);
  closeDialog('txDlg');
  openWallet('topup');
  $('#wAmt').value = ctx.shortfall || '';
  $('#wNote').value = g ? `For ${g.name}` : '';
}

async function cancelGoal(id) {
  const g = findGoal(id);
  if (!g) return;
  const hasMoney = g.saved > 0;
  const answer = await confirmAction({
    title: `Cancel "${g.name}"?`,
    message: hasMoney
      ? `${money.format(g.saved)} saved in this goal will be refunded to your wallet right away. The goal and its reminders will be removed. You can undo for a few seconds afterwards.`
      : 'This goal has no money in it. It will be removed along with its reminders. You can undo for a few seconds afterwards.',
    confirmLabel: hasMoney ? 'Cancel goal and refund' : 'Cancel goal',
    requireText: hasMoney ? g.name : ''
  });
  if (!answer.ok) return;
  const result = removeGoal(id);
  if (result.ok) toast(hasMoney ? `Goal cancelled. ${money.format(result.refunded)} refunded to your wallet.` : 'Goal cancelled', result.undo);
}

async function finishGoal(id) {
  const g = findGoal(id);
  if (!g) return;
  const answer = await confirmAction({
    title: `Withdraw and complete "${g.name}"?`,
    message: `${money.format(g.saved)} will move to your wallet, and this goal will be closed and removed from your list. Your wallet history keeps a record of it. You can undo for a few seconds afterwards.`,
    confirmLabel: 'Withdraw and complete'
  });
  if (!answer.ok) return;
  const result = completeGoal(id);
  if (!result.ok) return toast(result.error);
  toast(`Goal completed 🎉 ${money.format(result.amount)} added to your wallet.`, result.undo);
}

function openWallet(type) {
  ctx.walletType = type;
  $('#wTitle').textContent = type === 'topup' ? 'Add money to wallet' : 'Spend or withdraw';
  $('#wHint').textContent = type === 'topup' ? 'Money you add here can then be moved into your goals.' : `Money leaves the app. Your wallet has ${money.format(getWallet().balance)}.`;
  $('#wAmt').value = '';
  $('#wNote').value = '';
  $('#wErr').textContent = '';
  openDialog('walletDlg');
  $('#wAmt').focus();
}

export function submitWallet() {
  const result = walletEntry({ type: ctx.walletType, amount: toInt($('#wAmt').value), note: $('#wNote').value });
  if (!result.ok) return void ($('#wErr').textContent = result.error);
  closeDialog('walletDlg');
  toast(ctx.walletType === 'topup' ? 'Money added to wallet' : 'Wallet updated');
}

function openReminder(id) {
  ctx.reminderId = id || null;
  const r = id ? findReminder(id) : null;
  $('#remTitle').textContent = r ? 'Edit reminder' : 'New reminder';
  $('#rTitle').value = r ? r.title : '';
  $('#rGoal').innerHTML = '<option value="">No specific goal</option>' + getGoals().map((g) => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('');
  $('#rGoal').value = r ? r.goalId : '';
  $('#rAmt').value = r && r.amount ? r.amount : '';
  $('#rFreq').value = r ? r.frequency : 'monthly';
  $('#rDue').value = r ? r.due : dateIn(1);
  $('#remErr').textContent = '';
  openDialog('reminderDlg');
  $('#rTitle').focus();
}

export function submitReminder() {
  const result = saveReminder(ctx.reminderId, {
    title: $('#rTitle').value,
    goalId: $('#rGoal').value,
    amount: toInt($('#rAmt').value || 0),
    frequency: $('#rFreq').value,
    due: $('#rDue').value
  });
  if (!result.ok) return void ($('#remErr').textContent = result.error);
  closeDialog('reminderDlg');
  toast('Reminder saved');
}

async function deleteReminder(id) {
  const r = findReminder(id);
  if (!r) return;
  const answer = await confirmAction({ title: 'Delete this reminder?', message: `"${r.title}" will be removed. You can undo for a few seconds afterwards.`, confirmLabel: 'Delete reminder' });
  if (!answer.ok) return;
  toast('Reminder deleted', removeReminder(id).undo);
}

export function saveProfileForm(form) {
  const f = new FormData(form);
  const result = updateProfile({ name: String(f.get('name')), income: toInt(f.get('income') || 0), savingsTarget: toInt(f.get('savingsTarget') || 0) });
  if (!result.ok) return void ($('[data-error="profile"]').textContent = result.error);
  toast('Profile saved');
}

function openPin(mode) {
  ctx.pinMode = mode;
  const hasPin = Boolean(getProfile().pinHash);
  $('#pinTitle').textContent = mode === 'remove' ? 'Remove PIN' : hasPin ? 'Change PIN' : 'Set a PIN';
  $('#pinOldWrap').classList.toggle('hidden', !hasPin);
  $('#pinNewWrap').classList.toggle('hidden', mode === 'remove');
  for (const id of ['pinOld', 'pinNew', 'pinNew2']) $('#' + id).value = '';
  $('#pinErr').textContent = '';
  openDialog('pinDlg');
  (hasPin ? $('#pinOld') : $('#pinNew')).focus();
}

export async function submitPin() {
  const profile = getProfile();
  const error = $('#pinErr');
  if (profile.pinHash) {
    const check = await verifyPin($('#pinOld').value, profile);
    if (!check.ok) return void (error.textContent = check.error);
  }
  if (ctx.pinMode === 'remove') {
    clearPinData();
    clearLockout();
    closeDialog('pinDlg');
    return toast('PIN removed');
  }
  const next = $('#pinNew').value;
  if (!isValidPin(next)) return void (error.textContent = 'Use 4 to 8 digits.');
  if (next !== $('#pinNew2').value) return void (error.textContent = 'The two PINs do not match.');
  const { hash, salt } = await createPin(next);
  setPinData(hash, salt);
  clearLockout();
  closeDialog('pinDlg');
  toast('PIN saved. The app will ask for it next time.');
}

function toCsv() {
  const cell = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [['Source', 'Goal', 'Type', 'Amount', 'Note', 'Date']];
  for (const g of getGoals()) for (const h of g.history) rows.push(['Goal', g.name, h.type, h.amount, h.note, h.date]);
  for (const e of getWallet().ledger) rows.push(['Wallet', e.goal, e.type, e.amount, e.note, e.date]);
  return rows.map((r) => r.map(cell).join(',')).join('\n');
}

export async function importFile(file) {
  if (file.size > 5 * 1024 * 1024) return toast('That file is too large to be a backup.');
  const result = readBackup(await file.text());
  if (!result.ok) return toast(result.error);
  const answer = await confirmAction({
    title: 'Replace your data with this backup?',
    message: `The backup has ${result.counts.goals} goal${result.counts.goals === 1 ? '' : 's'} and ${result.counts.reminders} reminder${result.counts.reminders === 1 ? '' : 's'}, plus its wallet history. Your current goals, wallet and reminders will be replaced. You can undo for a few seconds afterwards.`,
    confirmLabel: 'Replace data'
  });
  if (!answer.ok) return;
  toast('Backup restored', applyBackup(result.clean).undo);
}

function addSample() {
  const result = loadSampleData(sampleBundle());
  toast(result.ok ? 'Sample data added' : result.error);
}

async function clearSample() {
  const answer = await confirmAction({
    title: 'Clear sample data?',
    message: 'This removes all goals, wallet history and reminders, including anything you added after loading the sample. Your profile and PIN stay. You can undo for a few seconds afterwards.',
    confirmLabel: 'Clear everything'
  });
  if (!answer.ok) return;
  toast('Sample data cleared', clearMoneyData().undo);
}

async function resetEverything() {
  const answer = await confirmAction({
    title: 'Reset all data?',
    message: 'This permanently deletes every goal, wallet entry, reminder, your profile and the PIN from this browser, including data from older versions. This cannot be undone.',
    confirmLabel: 'Delete everything',
    requireText: 'RESET'
  });
  if (!answer.ok) return;
  resetAll();
  clearLockout();
  toast('All data was reset');
}

async function toggleNotify() {
  if (getProfile().notify) {
    updateProfile({ notify: false });
    return toast('Browser reminders are off');
  }
  const permission = await requestPermission();
  if (permission === 'granted') {
    updateProfile({ notify: true });
    maybeNotify(true);
    return toast('Browser reminders are on');
  }
  toast(permission === 'unsupported' ? 'This browser does not support notifications.' : 'Notifications are blocked. Allow them in your browser settings.');
}

function toggleTheme() {
  const dark = !document.documentElement.classList.contains('dark');
  document.documentElement.classList.toggle('dark', dark);
  writeStorage('sgt:theme:v1', dark ? 'dark' : 'light');
}

const goalId = (el) => el.dataset.id || el.closest('[data-id]').dataset.id;

export const actions = {
  new: () => openGoalForm(),
  sample: addSample,
  'sample-clear': clearSample,
  tx: (el) => openTx(goalId(el)),
  pay: (el) => openTx(goalId(el), Number(el.dataset.amount) || ''),
  complete: (el) => finishGoal(goalId(el)),
  hist: (el) => {
    const g = findGoal(goalId(el));
    if (!g) return;
    $('#histTitle').textContent = `${g.name} · history`;
    $('#histList').innerHTML = renderHistory(g);
    openDialog('histDlg');
  },
  edit: (el) => openGoalForm(goalId(el)),
  del: (el) => cancelGoal(goalId(el)),
  'wallet-add': () => openWallet('topup'),
  'wallet-spend': () => openWallet('spend'),
  'rem-new': () => openReminder(),
  'rem-edit': (el) => openReminder(el.dataset.id),
  'rem-del': (el) => deleteReminder(el.dataset.id),
  'rem-done': (el) => {
    completeReminder(el.dataset.id);
    toast('Reminder marked done');
  },
  theme: toggleTheme,
  'notify-toggle': toggleNotify,
  'pin-set': () => openPin('set'),
  'pin-remove': () => openPin('remove'),
  lock: () => lockApp(),
  'export-json': () => download('savings-backup.json', JSON.stringify(exportData(), null, 2), 'application/json'),
  'export-csv': () => download('savings-transactions.csv', toCsv(), 'text/csv'),
  reset: resetEverything
};
