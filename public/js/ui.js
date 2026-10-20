import { $ } from './utils.js';

export const openDialog = (id) => {
  const dialog = $('#' + id);
  if (!dialog.open) dialog.showModal();
  return dialog;
};

export const closeDialog = (id) => {
  const dialog = $('#' + id);
  if (dialog.open) dialog.close();
};

let toastTimer = null;
let toastUndo = null;

export function hideToast() {
  $('#toast').classList.add('opacity-0', 'translate-y-6', 'pointer-events-none');
  toastUndo = null;
}

export function toast(message, undo) {
  clearTimeout(toastTimer);
  $('#toastMsg').textContent = message;
  toastUndo = undo || null;
  $('#toastBtn').hidden = !undo;
  $('#toast').classList.remove('opacity-0', 'translate-y-6', 'pointer-events-none');
  toastTimer = setTimeout(hideToast, 7000);
}

export function runToastUndo() {
  if (toastUndo) toastUndo();
  hideToast();
}

export function confirmAction({ title, message, confirmLabel = 'Confirm', requireText = '' }) {
  return new Promise((resolve) => {
    const dialog = $('#confirmDlg');
    const typed = $('#cfType');
    const ok = $('#cfOk');
    $('#cfTitle').textContent = title;
    $('#cfMsg').textContent = message;
    ok.textContent = confirmLabel;
    $('#cfTypeWrap').classList.toggle('hidden', !requireText);
    $('#cfTypeLabel').textContent = requireText ? `Type "${requireText}" to confirm` : '';
    typed.value = '';
    const sync = () => {
      ok.disabled = Boolean(requireText) && typed.value.trim().toLowerCase() !== requireText.toLowerCase();
    };
    typed.oninput = sync;
    sync();
    ok.onclick = () => dialog.close('ok');
    dialog.addEventListener(
      'close',
      () => resolve({ ok: dialog.returnValue === 'ok' }),
      { once: true }
    );
    dialog.returnValue = '';
    dialog.showModal();
    (requireText ? typed : $('#cfCancel')).focus();
  });
}
