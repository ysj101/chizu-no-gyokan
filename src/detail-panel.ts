import { classificationLabels, classificationTags } from './details';
import type { DetailItem, DetailView } from './details';
import { sourceRegistry } from './domain';
import type { Source } from './domain';

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
function classificationTag(item: DetailItem): HTMLElement {
  return tagElement(classificationTags[item.classification], item.classification, classificationLabels[item.classification]);
}
function itemText(item: DetailItem): string {
  return item.status === 'recorded' ? item.text : `未収録：${item.fields.join('・')}。${item.reason}`;
}
function taggedText(item: DetailItem): Node[] {
  return [classificationTag(item), textElement('span', itemText(item))];
}
export interface DetailTargets { description: HTMLElement; why: HTMLElement; scenario: HTMLElement; related: HTMLElement; more: HTMLElement; evidence: HTMLElement }
// No HTML parsing: content and source metadata remain plain text.
export function renderDetail(targets: DetailTargets, view: DetailView): void {
  targets.description.textContent = itemText(view.overview);
  targets.why.replaceChildren(textElement('strong', `${view.why.label}：`), ...taggedText(view.why));
  targets.scenario.replaceChildren(...taggedText(view.scenario));
  targets.related.replaceChildren(textElement('strong', `${view.related.label}：`), document.createTextNode(itemText(view.related)));
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
