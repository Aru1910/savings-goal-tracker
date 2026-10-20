import { todayIso } from './utils.js';
import { getGoals, getReminders, getProfile, updateProfile } from './store.js';
import { attentionCount } from './analytics.js';

export const notificationsSupported = () => typeof Notification !== 'undefined';

export async function requestPermission() {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.requestPermission();
}

export function maybeNotify(force = false) {
  const profile = getProfile();
  if (!notificationsSupported() || Notification.permission !== 'granted') return false;
  if (!force && (!profile.notify || profile.lastNotified === todayIso())) return false;
  const count = attentionCount(getGoals(), getReminders());
  if (!count && !force) return false;
  new Notification('Savings Goal Tracker', {
    body: count ? `${count} reminder${count === 1 ? '' : 's'} need your attention today.` : 'Reminders are on. You are all caught up.'
  });
  if (!force) updateProfile({ lastNotified: todayIso() });
  return true;
}
