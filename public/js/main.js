import { $ } from './utils.js';
import { init, subscribe, getData, getGoals, getReminders, getProfile, setSaveErrorHandler } from './store.js';
import { attentionCount } from './analytics.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderGoals, renderGoalGrid } from './pages/goals.js';
import { renderWallet } from './pages/wallet.js';
import { renderReminders } from './pages/reminders.js';
import { renderProfile } from './pages/profile.js';
import { closeDialog, toast, runToastUndo } from './ui.js';
import { actions, fillSelects, submitGoal, submitTx, submitWallet, submitReminder, submitPin, saveProfileForm, importFile, onTxTypeChange, topupShortfall } from './actions.js';
import { verifyPin, lockApp, unlockApp, isLocked, armIdleLock } from './security.js';
import { maybeNotify } from './notify.js';

const ROUTES = {
  dashboard: { label: 'Dashboard', icon: '📊', render: renderDashboard },
  goals: { label: 'Goals', icon: '🎯', render: renderGoals },
  wallet: { label: 'Wallet', icon: '👛', render: renderWallet },
  reminders: { label: 'Reminders', icon: '🔔', render: renderReminders },
  profile: { label: 'Profile', icon: '👤', render: renderProfile }
};

const filters = { q: '', filter: 'all', priority: 'all', sort: 'recent' };
const view = $('#view');

const currentRoute = () => {
  const name = location.hash.replace(/^#\/?/, '');
  return ROUTES[name] ? name : 'dashboard';
};

const go = (name) => {
  location.hash = '#/' + name;
};

function renderNav(route, count) {
  const badge = (key) => (key === 'reminders' && count ? `<span class="ml-auto rounded-full bg-green-600 px-2 text-xs font-bold text-white dark:bg-green-400 dark:text-green-950">${count}</span>` : '');
  const tabBadge = (key) => (key === 'reminders' && count ? `<span class="absolute right-3 top-1 rounded-full bg-green-600 px-1.5 text-[10px] font-bold text-white dark:bg-green-400 dark:text-green-950">${count}</span>` : '');
  $('#sideNav').innerHTML = Object.entries(ROUTES)
    .map(([key, r]) => `<a href="#/${key}" class="nav-link ${key === route ? 'active' : ''}" ${key === route ? 'aria-current="page"' : ''}><span aria-hidden="true">${r.icon}</span><span>${r.label}</span>${badge(key)}</a>`)
    .join('');
  $('#tabNav').innerHTML = Object.entries(ROUTES)
    .map(([key, r]) => `<a href="#/${key}" class="nav-tab relative ${key === route ? 'active' : ''}" ${key === route ? 'aria-current="page"' : ''}><span class="text-lg" aria-hidden="true">${r.icon}</span><span>${r.label}</span>${tabBadge(key)}</a>`)
    .join('');
  $('#bellCount').textContent = count ? String(count) : '';
  $('#bellCount').classList.toggle('hidden', !count);
}

function render() {
  if (isLocked()) return;
  const route = currentRoute();
  const data = getData();
  view.innerHTML = ROUTES[route].render(data, filters);
  renderNav(route, attentionCount(data.goals, data.reminders));
  $('#pageTitle').textContent = ROUTES[route].label;
  document.title = `${ROUTES[route].label} · Savings Goal Tracker`;
}

function lockNow() {
  lockApp();
}

let idleBound = false;
function bindIdle() {
  if (idleBound) return;
  idleBound = true;
  const reset = () => armIdleLock(Boolean(getProfile().pinHash), lockNow);
  for (const type of ['pointerdown', 'keydown', 'touchstart', 'scroll']) document.addEventListener(type, reset, { passive: true });
  reset();
}

function bindEvents() {
  window.addEventListener('hashchange', () => {
    render();
    window.scrollTo(0, 0);
  });

  view.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const handler = actions[el.dataset.act];
    if (handler) handler(el);
  });

  view.addEventListener('input', (e) => {
    const key = e.target.dataset.filter;
    if (!key) return;
    filters[key] = e.target.value;
    $('#goalGrid').innerHTML = renderGoalGrid(getGoals(), filters);
  });

  view.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-form="profile"]');
    if (!form) return;
    e.preventDefault();
    saveProfileForm(form);
  });

  view.addEventListener('change', (e) => {
    if (!e.target.matches('[data-import]')) return;
    const file = e.target.files[0];
    e.target.value = '';
    if (file) importFile(file);
  });

  $('#goalForm').addEventListener('submit', (e) => { e.preventDefault(); submitGoal(); });
  $('#txForm').addEventListener('submit', (e) => { e.preventDefault(); submitTx(); });
  $('#walletForm').addEventListener('submit', (e) => { e.preventDefault(); submitWallet(); });
  $('#reminderForm').addEventListener('submit', (e) => { e.preventDefault(); submitReminder(); });
  $('#pinForm').addEventListener('submit', (e) => { e.preventDefault(); submitPin(); });
  $('#txTopup').addEventListener('click', topupShortfall);
  $('#txForm').addEventListener('change', (e) => { if (e.target.name === 'txType') onTxTypeChange(); });

  $('#lockForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const result = await verifyPin($('#lockPin').value, getProfile());
    if (!result.ok) {
      $('#lockErr').textContent = result.error;
      $('#lockPin').value = '';
      return;
    }
    unlockApp();
    render();
    bindIdle();
  });

  document.addEventListener('click', (e) => {
    const closer = e.target.closest('[data-close]');
    if (closer) return closeDialog(closer.closest('dialog').id);
    if (e.target.tagName === 'DIALOG') closeDialog(e.target.id);
  });

  $('#toastBtn').addEventListener('click', runToastUndo);
  $('#themeBtn').addEventListener('click', actions.theme);
  $('#lockBtn').addEventListener('click', () => (getProfile().pinHash ? lockNow() : go('profile')));
  $('#bellBtn').addEventListener('click', () => go('reminders'));

  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
    if (typing || isLocked() || document.querySelector('dialog[open]') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      actions.new();
    } else if (e.key === '/') {
      e.preventDefault();
      if (currentRoute() !== 'goals') go('goals');
      setTimeout(() => $('#search')?.focus(), 30);
    }
  });
}

function boot() {
  setSaveErrorHandler(() => toast('Could not save. Your browser storage may be full or blocked.'));
  fillSelects();
  bindEvents();
  subscribe(render);
  init();
  if (getProfile().pinHash) {
    lockApp();
  } else {
    render();
    bindIdle();
  }
  setInterval(() => !isLocked() && maybeNotify(), 30 * 60 * 1000);
  setTimeout(() => !isLocked() && maybeNotify(), 2000);
}

boot();
