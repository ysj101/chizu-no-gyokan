import { deleteNote, loadNotes, notePresentation, saveNote } from './notes';
import type { NoteStorage } from './notes';

// The adapter delays localStorage access so a denied getter is handled by the Result boundary.
const browserStorage: NoteStorage = {
  getItem: key => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
};
export function mountNotes(target: HTMLElement, snapshot: () => unknown, storage: NoteStorage = browserStorage): void {
  const form = target.querySelector('form');
  const input = target.querySelector('textarea');
  const list = target.querySelector('ol');
  const status = target.querySelector<HTMLElement>('#notes-status');
  const warning = target.querySelector<HTMLElement>('#notes-warning');
  const empty = target.querySelector<HTMLElement>('#notes-empty');
  if (!form || !input || !list || !status || !warning || !empty) throw new Error('Missing notes panel');
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
      button.setAttribute('aria-label', `${note.body}（${display.date}）のメモを削除`);
      button.addEventListener('click', () => {
        const buttons = [...list!.querySelectorAll('button')];
        const index = buttons.indexOf(button);
        const result = deleteNote(storage, note.id);
        if (!result.ok) { status!.textContent = `削除できませんでした。${result.error}`; return; }
        render(result);
        status!.textContent = 'メモを削除しました。';
        const remaining = list!.querySelectorAll('button');
        (remaining[Math.min(index, remaining.length - 1)] ?? input!).focus();
      });
      item.append(body, time, paragraph(display.scenario), paragraph(display.layers), paragraph(display.selection), button);
      list!.append(item);
    }
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    input.removeAttribute('aria-invalid');
    if (!input.value.trim()) {
      input.setAttribute('aria-invalid', 'true'); status.textContent = '空白だけのメモは保存できません。本文を入力してください。'; input.focus(); return;
    }
    try {
      const result = saveNote(storage, { id: crypto.randomUUID(), body: input.value, createdAt: new Date().toISOString(), mapState: snapshot() });
      if (!result.ok) { status.textContent = `保存できませんでした。入力は欄に残っています。${result.error}`; return; }
      render(result); input.value = ''; status.textContent = 'メモを保存しました。';
    } catch { status.textContent = '保存できませんでした。入力は欄に残っています。'; }
  });
  render(loadNotes(storage));
}
