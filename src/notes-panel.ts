import { deleteNote, loadNotes, notePresentation, saveNote } from './notes';
import type { DiscoveryNote, NoteStorage, Result } from './notes';

// The adapter delays localStorage access so a denied getter is handled by the Result boundary.
const browserStorage: NoteStorage = {
  getItem: key => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
};
export interface NotesMount {
  list: HTMLElement;            // holds the saved list, its status and warnings
  form: HTMLFormElement;        // the input drawer, which may live elsewhere on the page
  snapshot: () => unknown;      // map state recorded with a new note
  restore: (note: DiscoveryNote) => Result<{ adjusted: boolean }>;
  focusWhenEmpty: () => void;   // where focus goes after the last note is deleted
  storage?: NoteStorage;
}
export function mountNotes({ list: target, form, snapshot, restore, focusWhenEmpty, storage = browserStorage }: NotesMount): void {
  const input = form.querySelector('textarea');
  const saveStatus = form.querySelector<HTMLElement>('#note-save-status');
  const list = target.querySelector('ol');
  const status = target.querySelector<HTMLElement>('#notes-status');
  const warning = target.querySelector<HTMLElement>('#notes-warning');
  const empty = target.querySelector<HTMLElement>('#notes-empty');
  if (!input || !saveStatus || !list || !status || !warning || !empty) throw new Error('Missing notes panel');
  const paragraph = (text: string, className = '') => {
    const p = document.createElement('p'); p.textContent = text; p.className = className; return p;
  };
  function render(result: ReturnType<typeof loadNotes>): void {
    if (!result.ok) { warning!.textContent = result.error; empty!.hidden = true; return; }
    warning!.textContent = result.value.unreadable ? `読み込めない記録が${result.value.unreadable}件あります。` : '';
    empty!.hidden = result.value.notes.length > 0;
    list!.replaceChildren();
    for (const note of result.value.notes) {
      const item = document.createElement('li');
      const display = notePresentation(note);
      const body = paragraph(note.body, 'note-body');
      const time = document.createElement('time'); time.dateTime = note.createdAt; time.textContent = display.date;
      const button = document.createElement('button'); button.type = 'button'; button.textContent = 'このメモを削除';
      button.dataset.action = 'delete';
      button.setAttribute('aria-label', `${note.body}（${display.date}）のメモを削除`);
      button.addEventListener('click', () => {
        const buttons = [...list!.querySelectorAll<HTMLButtonElement>('[data-action=delete]')];
        const index = buttons.indexOf(button);
        const result = deleteNote(storage, note.id);
        if (!result.ok) { status!.textContent = `削除できませんでした。${result.error}`; return; }
        render(result);
        status!.textContent = 'メモを削除しました。';
        const remaining = list!.querySelectorAll<HTMLButtonElement>('[data-action=delete]');
        const next = remaining[Math.min(index, remaining.length - 1)];
        if (next) next.focus(); else focusWhenEmpty();
      });
      const restoreButton = document.createElement('button');
      restoreButton.type = 'button'; restoreButton.textContent = 'このメモの地図状態に戻す';
      restoreButton.dataset.action = 'restore';
      restoreButton.setAttribute('aria-label', `${note.body}（${display.date}）：このメモの地図状態に戻す`);
      restoreButton.addEventListener('click', () => {
        const position = { left: window.scrollX, top: window.scrollY };
        const fail = (message: string) => {
          // A shorter result must not shrink the page and clamp scrollY when
          // the action is near the bottom of the list.
          status!.style.minHeight = `${status!.getBoundingClientRect().height}px`;
          status!.textContent = message;
          // A taller live result can move the browser's scroll anchor in the
          // note list. Keep the position at activation, after any user scroll.
          window.scrollTo({ ...position, behavior: 'instant' });
        };
        const loaded = loadNotes(storage);
        const fresh = loaded.ok ? loaded.value.notes.find(item => item.id === note.id) : undefined;
        if (!fresh) {
          fail('地図状態に戻せませんでした。記録が消えたか、読み込めない状態です。地図は変更していません。');
          return;
        }
        const result = restore(fresh);
        if (!result.ok) { fail(`地図状態に戻せませんでした。${result.error}`); return; }
        const summary = notePresentation(fresh);
        status!.textContent = `${summary.date}のメモの状態に戻しました：${summary.scenario}／${summary.layers}／${summary.selection}。`
          + (result.value.adjusted ? '表示範囲を現在の地図の制約内に調整しました。' : '');
        // Keep focus at the action and the live result, including on mobile.
        restoreButton.focus({ preventScroll: true });
      });
      item.append(body, time, paragraph(display.scenario), paragraph(display.layers), paragraph(display.selection), restoreButton, button);
      list!.append(item);
    }
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    input.removeAttribute('aria-invalid');
    if (!input.value.trim()) {
      input.setAttribute('aria-invalid', 'true'); saveStatus.textContent = '空白だけのメモは保存できません。本文を入力してください。'; input.focus(); return;
    }
    try {
      const result = saveNote(storage, { id: crypto.randomUUID(), body: input.value, createdAt: new Date().toISOString(), mapState: snapshot() });
      if (!result.ok) { saveStatus.textContent = `保存できませんでした。入力は欄に残っています。${result.error}`; return; }
      render(result); input.value = ''; saveStatus.textContent = 'メモを保存しました。';
    } catch { saveStatus.textContent = '保存できませんでした。入力は欄に残っています。'; }
  });
  render(loadNotes(storage));
}

// The input drawer sits by the selected place. Closing keeps the draft in the field and says so on
// the opener, so nothing typed is lost; `describe` renders the map state that a save would record.
export interface NoteDrawer { refresh(): void; focus(): void }
export function mountNoteDrawer(opener: HTMLButtonElement, form: HTMLFormElement, closer: HTMLButtonElement, context: HTMLElement, describe: () => string): NoteDrawer {
  const input = form.querySelector('textarea');
  if (!input) throw new Error('Missing note drawer');
  const refresh = () => {
    const open = !form.hidden;
    opener.setAttribute('aria-expanded', String(open));
    const label = `この発見をメモする${!open && input.value.trim() ? '（下書きあり）' : ''}`;
    if (opener.textContent !== label) opener.textContent = label;
    if (open) context.textContent = `保存する状態：${describe()}`;
  };
  // Focus goes to the field when open, otherwise to the opener (also used after the last note is deleted).
  const focus = () => (form.hidden ? opener : input).focus();
  const setOpen = (open: boolean) => { form.hidden = !open; refresh(); focus(); };
  opener.addEventListener('click', () => setOpen(true));
  closer.addEventListener('click', () => setOpen(false));
  refresh();
  return { refresh, focus };
}
