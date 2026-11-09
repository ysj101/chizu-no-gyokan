import { classificationLabels, classificationTags } from './details';
import type { Classification, DetailItem, DetailView, RelatedLink } from './details';
import { perspectiveTitle } from './perspectives';
import type { Perspective } from './perspectives';
import { sourceRegistry } from './domain';
import type { SelectedFeatureId, Source } from './domain';

export function textElement(tag: 'p' | 'dt' | 'dd' | 'h3' | 'span' | 'strong' | 'li', text: string, className = ''): HTMLElement {
  const element = document.createElement(tag); element.textContent = text; if (className) element.className = className; return element;
}
// Short tag pill; `modifier` picks the colour, `title` carries the full label when there is one.
export function tagElement(label: string, modifier: string, title = ''): HTMLElement {
  const tag = textElement('span', label, `tag tag-${modifier}`); if (title) tag.title = title; return tag;
}
function sourceLink(source: Source): HTMLAnchorElement {
  const a = document.createElement('a'); a.textContent = source.title; a.href = source.url; return a;
}
// A short tag carries the classification; its full label stays readable as the title.
function tagged(classification: Classification, text: string): Node[] {
  return [tagElement(classificationTags[classification], classification, classificationLabels[classification]), textElement('span', text)];
}
function itemText(item: DetailItem): string {
  return item.status === 'recorded' ? item.text : `未収録：${item.fields.join('・')}。${item.reason}`;
}
function taggedText(item: DetailItem): Node[] { return tagged(item.classification, itemText(item)); }
export interface DetailTargets { description: HTMLElement; why: HTMLElement; scenario: HTMLElement; related: HTMLElement; relatedStatus: HTMLElement; more: HTMLElement; evidence: HTMLElement }
// Selecting a related place and previewing it on the map are the caller's business.
export interface DetailActions { select(id: SelectedFeatureId): void; preview(id: SelectedFeatureId | null): void }
// The only interactive tier: one button per related place, with delegated listeners on the list.
export function renderRelated(target: HTMLElement, status: HTMLElement, label: string, relatedLinks: readonly RelatedLink[], actions: DetailActions): void {
  const links = document.createElement('ul');
  const byId = new Map(relatedLinks.map(link => [link.id, link]));
  for (const link of relatedLinks) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = link.name;
    button.dataset.relatedId = link.id;
    // The visible name is the accessible name; the list buttons keep their distinct 「〜を選択」 names.
    if (!link.available) button.classList.add('unavailable');
    const hint = link.available ? '' : `（${link.shownIn.join('・')}で表示）`;
    const entry = textElement('li', ''); entry.append(button);
    if (link.reason || hint) entry.append(textElement('span', `${link.reason}${hint}`, 'reason'));
    links.append(entry);
  }
  const linkAt = (event: Event) => byId.get((event.target as HTMLElement).closest('button')?.dataset.relatedId as SelectedFeatureId);
  links.addEventListener('click', event => {
    const link = linkAt(event); if (!link) return;
    // Never switch the condition on the reader's behalf; the note says where the place is shown.
    if (link.available) actions.select(link.id); else status.textContent = link.note;
  });
  for (const type of ['focusin', 'mouseover'] as const) links.addEventListener(type, event => { const link = linkAt(event); actions.preview(link?.available ? link.id : null); });
  for (const type of ['focusout', 'mouseout'] as const) links.addEventListener(type, () => actions.preview(null));
  target.replaceChildren(textElement('p', label, 'related-title'), links);
  status.textContent = '';
}
// No HTML parsing: content and source metadata remain plain text.
export function renderDetail(targets: DetailTargets, view: DetailView, actions: DetailActions): void {
  targets.description.textContent = itemText(view.overview);
  targets.why.replaceChildren(textElement('strong', `${view.why.label}：`), ...taggedText(view.why));
  targets.scenario.replaceChildren(...taggedText(view.scenario));
  renderRelated(targets.related, targets.relatedStatus, view.related.label, view.relatedLinks, actions);
  const list = document.createElement('dl');
  for (const item of view.more) {
    list.append(textElement('dt', item.label));
    const value = textElement('dd', ''); value.append(...taggedText(item)); list.append(value);
  }
  targets.more.replaceChildren(list);
  targets.evidence.replaceChildren();
  for (const { source: id, items } of view.evidence) {
    const source = sourceRegistry[id];
    const section = document.createElement('section');
    const heading = textElement('h3', ''); heading.append(sourceLink(source)); section.append(heading);
    section.append(textElement('p', `対応する項目：${items.join(' / ')}`));
    for (const line of [`確認日（資料参照）：${source.consulted}`, `更新日：${source.updated}`, `対象時点：${source.period}`, `使用範囲：${source.usage}`, `利用条件・権利：${source.rights}`]) section.append(textElement('p', line));
    const rights = document.createElement('a'); rights.textContent = '利用条件の原文'; rights.href = source.rightsUrl; section.append(rights);
    targets.evidence.append(section);
  }
}

export interface PerspectiveTargets { title: HTMLElement; meaning: HTMLElement; statements: HTMLElement }
// The country view's text: a tagged meaning line, then sourced statements with their data period
// (or the source's update date). The focus list is rendered separately because it depends on the condition.
export function renderPerspectiveContent(targets: PerspectiveTargets, view: Perspective): void {
  targets.title.textContent = perspectiveTitle(view);
  targets.meaning.replaceChildren(...tagged(view.meaning.classification, view.meaning.text));
  targets.statements.replaceChildren(...view.statements.map(statement => {
    const item = textElement('li', ''); item.append(...tagged(statement.classification, statement.text));
    const source = textElement('p', '資料：', 'statement-source');
    statement.sources.forEach((id, index) => { if (index) source.append(' / '); source.append(sourceLink(sourceRegistry[id])); });
    source.append(`（${statement.period ?? `更新 ${sourceRegistry[statement.sources[0]].updated}`}）`); item.append(source);
    return item;
  }));
}
