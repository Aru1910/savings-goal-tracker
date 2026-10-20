import { $, readStorage, writeStorage, removeStorage } from './utils.js';

const LOCK_KEY = 'sgt:lockout:v1';
const IDLE_MS = 5 * 60 * 1000;
const encoder = new TextEncoder();
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => new Uint8Array(hex.match(/../g).map((h) => parseInt(h, 16)));

export const isValidPin = (pin) => /^\d{4,8}$/.test(pin);

async function derive(pin, saltHex) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations: 150000 },
    key,
    256
  );
  return toHex(bits);
}

function equalConstant(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createPin(pin) {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  return { hash: await derive(pin, salt), salt };
}

function readLockout() {
  try {
    return JSON.parse(readStorage(LOCK_KEY)) || { fails: 0, until: 0 };
  } catch {
    return { fails: 0, until: 0 };
  }
}

export async function verifyPin(pin, profile) {
  const state = readLockout();
  const now = Date.now();
  if (state.until > now) {
    return { ok: false, error: `Too many attempts. Try again in ${Math.ceil((state.until - now) / 1000)} seconds.` };
  }
  const match = equalConstant(await derive(pin, profile.pinSalt), profile.pinHash);
  if (match) {
    removeStorage(LOCK_KEY);
    return { ok: true };
  }
  const fails = state.fails + 1;
  const until = fails >= 5 ? now + Math.min(300000, 30000 * 2 ** (fails - 5)) : 0;
  writeStorage(LOCK_KEY, JSON.stringify({ fails, until }));
  return {
    ok: false,
    error: fails >= 5 ? 'Too many attempts. The app is locked for a while.' : `Wrong PIN. ${5 - fails} attempt${5 - fails === 1 ? '' : 's'} left before a lockout.`
  };
}

export const clearLockout = () => removeStorage(LOCK_KEY);

let locked = false;
export const isLocked = () => locked;

export function lockApp() {
  locked = true;
  $('#lock').classList.remove('hidden');
  $('#app').setAttribute('inert', '');
  $('#view').innerHTML = '';
  $('#lockPin').value = '';
  $('#lockErr').textContent = '';
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  setTimeout(() => $('#lockPin').focus(), 50);
}

export function unlockApp() {
  locked = false;
  $('#lock').classList.add('hidden');
  $('#app').removeAttribute('inert');
}

let idleTimer = null;
export function armIdleLock(hasPin, onLock) {
  clearTimeout(idleTimer);
  if (!hasPin || locked) return;
  idleTimer = setTimeout(onLock, IDLE_MS);
}
