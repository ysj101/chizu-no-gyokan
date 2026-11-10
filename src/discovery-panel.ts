import { addDiscovery, discoveries, discoveryNodes, loadDiscoveries, removeDiscovery } from './discoveries';
import type { DiscoveryCollection, DiscoveryId, DiscoveryNodeId } from './discoveries';
import { sourceLine, tagged } from './detail-panel';
import { textElement } from './dom';
import { browserStorage } from './notes-panel';
import type { NoteStorage, Result } from './notes';

const svgNs = 'http://www.w3.org/2000/svg';
function svg<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number>): SVGElementTagNameMap[K] {
  const element = document.createElementNS(svgNs, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  return element;
}
export interface DiscoveryPanelMount {
  add: HTMLButtonElement;      // on the chain card: adds what the chain shows now
  addTitle: HTMLElement;       // names that relation; the button's description
  addStatus: HTMLElement;
  view: HTMLElement;           // the drawn network
  list: HTMLOListElement;
  empty: HTMLElement;
  status: HTMLElement;
  storage?: NoteStorage;
}
export interface DiscoveryPanel { setCurrent(id: DiscoveryId): void }
// The add button and the menu's discovery map. Storage is read on each action so another tab's
// additions are not overwritten; a failure leaves the map as it was and says so.
export function mountDiscoveryPanel({ add, addTitle, addStatus, view, list, empty, status, storage = browserStorage }: DiscoveryPanelMount): DiscoveryPanel {
  let current: DiscoveryId = 'malacca-japan';
  let found: DiscoveryCollection['found'] = [];
  function renderAdd(): void {
    const has = found.some(entry => entry.id === current);
    add.disabled = has; add.textContent = has ? '発見マップに追加済み' : '発見マップに追加';
    addTitle.textContent = discoveries[current].title;
  }
  function renderMap(): void {
    const ids = new Set(found.map(entry => entry.id));
    const reached = new Set<DiscoveryNodeId>(found.flatMap(entry => discoveries[entry.id].edges.flat()));
    const drawing = svg('svg', { viewBox: '0 0 320 150', class: 'discovery-network', 'aria-hidden': 'true' });
    for (const id of ids) for (const [from, to] of discoveries[id].edges) {
      const a = discoveryNodes[from]; const b = discoveryNodes[to];
      drawing.append(svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: `discovery-edge edge-${discoveries[id].classification}` }));
    }
    for (const [id, node] of Object.entries(discoveryNodes)) {
      const group = svg('g', { class: `discovery-node${reached.has(id as DiscoveryNodeId) ? ' reached' : ''}` });
      group.append(svg('circle', { cx: node.x, cy: node.y, r: 7 }));
      const label = svg('text', { x: node.x, y: node.y - 12, 'text-anchor': 'middle' }); label.textContent = node.name;
      group.append(label); drawing.append(group);
    }
    view.replaceChildren(drawing);
    empty.hidden = found.length > 0;
    list.replaceChildren(...found.map(entry => {
      const discovery = discoveries[entry.id];
      const item = textElement('li', '');
      item.append(textElement('p', discovery.title, 'discovery-title'));
      const text = textElement('p', ''); text.append(...tagged(discovery.classification, discovery.text)); item.append(text);
      const sources = sourceLine(discovery.sources);
      const when = document.createElement('time'); when.dateTime = entry.addedAt; when.className = 'discovery-date';
      when.textContent = `見つけた日：${new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(entry.addedAt))}`;
      const remove = textElement('button', 'この発見を外す'); remove.type = 'button';
      remove.setAttribute('aria-label', `${discovery.title}を発見マップから外す`);
      remove.addEventListener('click', () => {
        if (apply(removeDiscovery(storage, entry.id))) status.textContent = `${discovery.title}を外しました。`;
        (list.querySelector('button') ?? add).focus();
      });
      item.append(sources, when, remove);
      return item;
    }));
  }
  function apply(result: Result<DiscoveryCollection>): boolean {
    if (!result.ok) { status.textContent = result.error; addStatus.textContent = result.error; return false; }
    found = result.value.found;
    if (result.value.unreadable) status.textContent = `読み込めない記録が${result.value.unreadable}件あります。`;
    renderAdd(); renderMap();
    return true;
  }
  add.addEventListener('click', () => {
    const discovery = discoveries[current];
    if (apply(addDiscovery(storage, current, new Date()))) addStatus.textContent = `「${discovery.title}」を発見マップに追加しました。メニューの「発見マップ」で見返せます。`;
  });
  apply(loadDiscoveries(storage));
  return { setCurrent(id) { if (id === current) return; current = id; addStatus.textContent = ''; renderAdd(); } };
}
