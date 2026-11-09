import { classificationLabels } from './details';
import type { DetailItem } from './details';
import { sourceRegistry } from './domain';
import type { Source, SourceId } from './domain';

function textElement(tag: 'p' | 'dt' | 'dd' | 'h3' | 'span', text: string): HTMLElement {
  const element = document.createElement(tag); element.textContent = text; return element;
}
function sourceLink(source: Source): HTMLAnchorElement {
  const a = document.createElement('a'); a.textContent = source.title; a.href = source.url; return a;
}
// No HTML parsing: content and source metadata remain plain text.
export function renderDetailPanel(target: HTMLElement, evidence: HTMLElement, items: readonly DetailItem[]): void {
  const list = document.createElement('dl');
  const ids = new Set<SourceId>();
  for (const item of items) {
    list.append(textElement('dt', item.label));
    const value = textElement('dd', '');
    value.append(textElement('span', `[${classificationLabels[item.classification]}] ${item.status === 'recorded' ? item.text : `未収録：${item.reason}`}`));
    const sources = textElement('p', '根拠：');
    item.sources.forEach((id, index) => {
      ids.add(id);
      if (index) sources.append(document.createTextNode(' / '));
      sources.append(sourceLink(sourceRegistry[id]));
    });
    value.append(sources); list.append(value);
  }
  target.replaceChildren(list);
  evidence.replaceChildren();
  for (const id of ids) {
    const source = sourceRegistry[id];
    const section = document.createElement('section');
    const heading = textElement('h3', ''); heading.append(sourceLink(source)); section.append(heading);
    for (const line of [`確認日（資料参照）：${source.consulted}`, `更新日：${source.updated}`, `対象時点：${source.period}`, `使用範囲：${source.usage}`, `利用条件・権利：${source.rights}`]) section.append(textElement('p', line));
    const rights = document.createElement('a'); rights.textContent = '利用条件の原文'; rights.href = source.rightsUrl; section.append(rights);
    evidence.append(section);
  }
}
