// Tiny DOM helpers shared by the renderers. Everything is built with createElement and textContent:
// no HTML strings are parsed anywhere in the app.
export function textElement<K extends keyof HTMLElementTagNameMap>(tag: K, text: string, className = ''): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag); element.textContent = text; if (className) element.className = className; return element;
}
// Short tag pill; `modifier` picks the colour, `title` carries the full label when there is one.
export function tagElement(label: string, modifier: string, title = ''): HTMLElement {
  const tag = textElement('span', label, `tag tag-${modifier}`); if (title) tag.title = title; return tag;
}
// A message element that disappears when there is nothing to say.
export function setMessage(target: HTMLElement, text: string): void { target.textContent = text; target.hidden = !text; }
export function link(text: string, href: string): HTMLAnchorElement {
  const a = textElement('a', text); a.href = href; return a;
}
