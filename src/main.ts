import { detailItems } from './details';
import { renderDetailPanel } from './detail-panel';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import { features, labels } from './content';
import { parseCountries, sourceRegistry, scenarioDefinition, selectionForScenario, scenarioExplanation, routeStyles } from './domain';
import type { ExplorationFeature, LoadState, SelectedFeatureId, SourceId, Scenario } from './domain';

function element<T extends HTMLElement>(id: string, constructor: { new(...args: never[]): T }): T {
  const value = document.getElementById(id);
  if (!(value instanceof constructor)) throw new Error(`Missing element: ${id}`);
  return value;
}
const mapElement = element('map', HTMLDivElement);
const statusElement = element('load-status', HTMLParagraphElement);
const retry = element('retry', HTMLButtonElement);
let selectedFeatureId: SelectedFeatureId = 'malacca';
let scenario: Scenario = { kind: 'normal' };
let loadState: LoadState = { status: 'loading' };
// Include both candidate straits and complete authored routes even in normal mode.
const initialBounds: L.LatLngBoundsExpression = [[-13, 91], [18.5, 122]];
const map = L.map(mapElement, {
  zoomControl: false, attributionControl: false, minZoom: 4, maxZoom: 7,
  maxBoundsViscosity: 0.8,
  scrollWheelZoom: false, zoomAnimation: false, fadeAnimation: false,
  markerZoomAnimation: false, inertia: false, keyboard: false,
});
function updateExplorationBounds(): void {
  // maxBounds contains the whole viewport, not just its center. At minimum
  // zoom a wide viewport can exceed a fixed geographic envelope and lock pan.
  // Keep the exploration envelope available to the center at every map size.
  const zoom = map.getMinZoom();
  const half = map.getSize().divideBy(2);
  const southWest = map.project([-25, 78], zoom).add([-half.x, half.y]);
  const northEast = map.project([30, 130], zoom).add([half.x, -half.y]);
  map.setMaxBounds(L.latLngBounds(map.unproject(southWest, zoom), map.unproject(northEast, zoom)));
}
updateExplorationBounds();
map.fitBounds(initialBounds, { padding: [15, 15], animate: false });
mapElement.addEventListener('keydown', event => {
  if (event.target !== mapElement) return;
  const offsets: Record<string, L.PointTuple> = {
    ArrowLeft: [-80, 0], ArrowRight: [80, 0], ArrowUp: [0, -80], ArrowDown: [0, 80],
  };
  const offset = offsets[event.key];
  // panTo clamps the destination before moving; panBy would start a second,
  // animated maxBounds rebound from its moveend handler.
  if (offset) map.panTo(map.unproject(map.project(map.getCenter()).add(offset)), { animate: false });
  else if (event.key === '+' || event.key === '=') map.zoomIn(1, { animate: false });
  else if (event.key === '-') map.zoomOut(1, { animate: false });
  else return;
  event.preventDefault();
});
const mapLayers = L.layerGroup().addTo(map);
const scenarioLayers = L.layerGroup().addTo(map);
const selectionLayers = new Map<SelectedFeatureId, L.Path | L.Marker>();

function latLng(coordinate: [number, number]): L.LatLngTuple {
  return [coordinate[1], coordinate[0]];
}
function link(title: string, url: string): HTMLAnchorElement {
  const a = document.createElement('a'); a.textContent = title; a.href = url;
  return a;
}
function sourceText(ids: readonly SourceId[]): void {
  const target = element('selected-source', HTMLParagraphElement);
  target.replaceChildren(document.createTextNode('根拠：'));
  ids.forEach((id, index) => {
    if (index > 0) target.append(document.createTextNode(' / '));
    const source = sourceRegistry[id];
    target.append(link(source.title, source.url));
  });
}
function selectFeature(id: SelectedFeatureId, reveal = false): void {
  const feature = features.find(item => item.id === id);
  if (!feature) return;
  selectedFeatureId = feature.id;
  element('selected-name', HTMLHeadingElement).textContent = feature.name;
  element('selected-kind', HTMLParagraphElement).textContent = feature.classification === 'teaching-model'
    ? '航路 / モデル上の説明' : `${feature.kind === 'strait' ? '海峡' : '関連地点'} / 地理的事実（位置は代表点）`;
  element('selected-description', HTMLParagraphElement).textContent = feature.description;
  element('selected-scenario', HTMLParagraphElement).textContent = scenarioExplanation(feature.id, scenario);
  element('selected-limit', HTMLParagraphElement).textContent = feature.limitation;
  sourceText(feature.sources);
  renderDetailPanel(element('detail-fields', HTMLDivElement), element('detail-evidence', HTMLDivElement), detailItems(feature.id, scenario));
  if (reveal && matchMedia('(max-width: 760px)').matches) {
    element('selection', HTMLElement).scrollIntoView({ block: 'start', behavior: 'instant' });
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-feature-id]')) {
    button.setAttribute('aria-pressed', String(button.dataset.featureId === selectedFeatureId));
  }
  for (const [featureId, layer] of selectionLayers) {
    const selected = featureId === selectedFeatureId;
    if (layer instanceof L.Path) {
      const role = scenarioDefinition(scenario).routeRole[featureId] ?? 'normal';
      layer.setStyle({ color: selected ? '#146d78' : routeStyles[role].color, weight: selected ? 5 : 3 });
    }
    else layer.getElement()?.classList.toggle('selected', selected);
  }
}
const featureList = element('feature-list', HTMLElement);
function visibleFeatures(): readonly ExplorationFeature[] {
  return features.filter(feature => scenarioDefinition(scenario).featureIds.includes(feature.id));
}
function renderFeatureList(): void {
  featureList.replaceChildren();
  for (const feature of visibleFeatures()) {
    const button = document.createElement('button');
    const added = feature.id.startsWith('sunda') || feature.id.startsWith('lombok');
    button.textContent = `${added ? '＋ ' : ''}${feature.kind === 'route' ? '┄' : feature.kind === 'strait' ? '◇' : '●'} ${feature.name}`;
    button.dataset.featureId = feature.id;
    button.setAttribute('aria-label', `${feature.name}を選択`);
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => selectFeature(feature.id, true));
    featureList.append(button);
  }
}
for (const source of Object.values(sourceRegistry)) {
  const section = document.createElement('section');
  const heading = document.createElement('h2'); heading.append(link(source.title, source.url));
  section.append(heading);
  for (const text of [`参照日：${source.consulted}`, `更新日：${source.updated}`, `対象時点：${source.period}`, `使用範囲：${source.usage}`, `利用条件：${source.rights}`]) {
    const p = document.createElement('p'); p.textContent = text; section.append(p);
  }
  section.append(link('利用条件の原文', source.rightsUrl));
  element('source-list', HTMLDivElement).append(section);
}
function isolateMapButton(button: HTMLButtonElement): void {
  L.DomEvent.disableClickPropagation(button);
  // Also stop click itself: Leaflet's touch double-tap synthesizer listens on
  // the map container and would interpret two selections as a zoom gesture.
  L.DomEvent.on(button, 'click', L.DomEvent.stopPropagation);
}
function marker(feature: ExplorationFeature): void {
  if (feature.kind === 'route') {
    const role = scenarioDefinition(scenario).routeRole[feature.id] ?? 'normal';
    const style = routeStyles[role];
    // These bounded authored lines are small: retain their full geometry so
    // panning/zooming does not trim endpoints or restart the dash pattern at
    // the renderer edge. SVG and #map still clip the visible drawing.
    const route = L.polyline(feature.coordinates.map(latLng), { noClip: true, color: style.color, weight: 3, dashArray: style.dashArray, className: `${feature.id} route-${role}`, interactive: false }).addTo(scenarioLayers);
    L.polyline(feature.coordinates.map(latLng), { noClip: true, opacity: 0, weight: 24, className: 'route-hit', bubblingMouseEvents: false })
      .on('click', () => selectFeature(feature.id, true)).addTo(scenarioLayers);
    selectionLayers.set(feature.id, route);
    const routeButton = document.createElement('button');
    routeButton.dataset.featureId = feature.id; routeButton.setAttribute('aria-pressed', 'false');
    isolateMapButton(routeButton);
    routeButton.className = 'route-label'; routeButton.textContent = `${role === 'unavailable' ? '×' : role === 'candidate' ? '＋' : '┄'} ${feature.name}`;
    routeButton.setAttribute('aria-label', `地図上の${feature.name}を選択`);
    routeButton.addEventListener('click', () => selectFeature(feature.id, true));
    L.marker(feature.id === 'sunda-route' ? [-3.5, 108.8] : feature.id === 'lombok-route' ? [-5, 113] : [6.7, 108], { keyboard: false, icon: L.divIcon({ html: routeButton, className: 'feature-icon route-icon', iconSize: [155, 44], iconAnchor: [10, 44] }) }).addTo(scenarioLayers);
    return;
  }
  const button = document.createElement('button');
  button.dataset.featureId = feature.id; button.setAttribute('aria-pressed', 'false');
  isolateMapButton(button);
  button.className = 'map-feature';
  button.setAttribute('aria-label', `地図上の${feature.name}を選択`);
  const symbol = document.createElement('span'); symbol.className = 'feature-symbol';
  symbol.textContent = feature.kind === 'strait' ? (scenario.kind === 'normal' ? '◇' : feature.id === 'malacca' ? '×◇' : '＋◇') : '●';
  const name = document.createElement('span'); name.className = 'feature-name'; name.textContent = feature.name;
  button.append(symbol, name); button.addEventListener('click', () => selectFeature(feature.id, true));
  // The dot stays at the geographic coordinate; a leader connects the separate 44px target.
  const anchor = document.createElement('span'); anchor.className = 'coordinate-dot';
  const leader = document.createElement('span'); leader.className = 'feature-leader';
  const callout = document.createElement('div');
  callout.className = `feature-callout callout-${feature.id}`;
  callout.append(anchor, leader, button);
  const item = L.marker(latLng(feature.coordinate), {
    keyboard: false,
    icon: L.divIcon({ html: callout, className: 'feature-icon', iconSize: [0, 0], iconAnchor: [0, 0] }),
  }).addTo(scenarioLayers);
  selectionLayers.set(feature.id, item);
}
function showState(): void {
  mapElement.setAttribute('aria-busy', String(loadState.status === 'loading'));
  statusElement.textContent = loadState.status === 'loading' ? '地理データを読み込んでいます。'
    : loadState.status === 'ready' ? `地図を読み込みました。${scenarioDefinition(scenario).name}の地図を探索できます。`
      : '地理データを読み込めませんでした。取得先やデータの状態を確認して、再試行してください。';
  retry.hidden = loadState.status !== 'error';
  element('visible-layers', HTMLParagraphElement).textContent = loadState.status === 'ready'
    ? '表示：国境・海岸 / 航路 / 注目地点（常時表示）'
    : '表示予定：国境・海岸 / 航路 / 注目地点（地理データ未表示）';
  element('scenario-summary', HTMLParagraphElement).textContent = scenarioDefinition(scenario).summary
    + (loadState.status === 'ready' ? '' : ' 地理データは未表示です。条件設定のみ反映しています。');
}
async function loadGeography(): Promise<void> {
  loadState = { status: 'loading' }; showState();
  mapLayers.clearLayers(); scenarioLayers.clearLayers(); selectionLayers.clear();
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}data/countries.json`);
    if (!response.ok) throw new Error('Geography HTTP failure');
    const raw: unknown = await response.json();
    const countries = parseCountries(raw);
    L.geoJSON(countries, { interactive: false, style: feature => ({ color: '#81968e', weight: 1, fillColor: '#edf0e5', fillOpacity: 1, className: `country-${String(feature?.properties.code)}` }) }).addTo(mapLayers);
    for (const label of labels) {
      const text = document.createElement('span');
      text.textContent = countries.features.find(country => country.properties.code === label.code)?.properties.name ?? label.name;
      text.className = label.sea ? 'sea-label' : 'country-label';
      L.marker(latLng(label.coordinate), { interactive: false, keyboard: false,
        icon: L.divIcon({ html: text, className: 'geo-label', iconSize: [100, 20], iconAnchor: [50, 10] }) }).addTo(mapLayers);
    }
    loadState = { status: 'ready' }; renderScenario();
  } catch {
    mapLayers.clearLayers(); scenarioLayers.clearLayers(); selectionLayers.clear(); loadState = { status: 'error' };
  }
  showState();
}
function renderScenario(): void {
  const definition = scenarioDefinition(scenario);
  const closed = scenario.kind === 'malacca-closed-assumption';
  selectedFeatureId = selectionForScenario(selectedFeatureId, scenario);
  for (const id of ['current-condition', 'map-condition']) element(id, HTMLElement).textContent = `現在：${definition.name}`;
  element('scenario-normal', HTMLButtonElement).setAttribute('aria-pressed', String(!closed));
  element('scenario-closed', HTMLButtonElement).setAttribute('aria-pressed', String(closed));
  for (const [id, role] of [['normal-legend', closed ? 'unavailable' : 'normal'], ['candidate-legend', 'candidate']] as const) {
    const item = element(id, HTMLLIElement);
    const key = document.createElement('span'); key.className = `key ${role}`;
    item.replaceChildren(key, document.createTextNode(routeStyles[role].label));
    item.hidden = role === 'candidate' && !closed;
  }
  element('point-diff', HTMLParagraphElement).hidden = !closed;
  element('candidate-navigation', HTMLDivElement).hidden = !closed;
  scenarioLayers.clearLayers(); selectionLayers.clear();
  if (loadState.status === 'ready') for (const feature of visibleFeatures()) marker(feature);
  renderFeatureList(); selectFeature(selectedFeatureId); showState();
}
element('scenario-normal', HTMLButtonElement).addEventListener('click', () => { scenario = { kind: 'normal' }; renderScenario(); });
element('scenario-closed', HTMLButtonElement).addEventListener('click', () => { scenario = { kind: 'malacca-closed-assumption' }; renderScenario(); });
for (const id of ['sunda', 'lombok'] as const) {
  element(`go-${id}`, HTMLButtonElement).addEventListener('click', () => {
    const feature = features.find(item => item.id === id);
    if (feature && feature.kind !== 'route') map.setView(latLng(feature.coordinate), 5, { animate: false });
  });
}
retry.addEventListener('click', () => { void loadGeography(); });
element('zoom-in', HTMLButtonElement).addEventListener('click', () => map.zoomIn(1, { animate: false }));
element('zoom-out', HTMLButtonElement).addEventListener('click', () => map.zoomOut(1, { animate: false }));
element('reset', HTMLButtonElement).addEventListener('click', () => map.fitBounds(initialBounds, { padding: [15, 15], animate: false }));
const touchButton = element('touch-mode', HTMLButtonElement);
const coarse = matchMedia('(any-pointer: coarse), (max-width: 760px)');
const touchAvailable = () => navigator.maxTouchPoints > 0 || coarse.matches;
function setTouchMode(enabled: boolean): void {
  touchButton.setAttribute('aria-pressed', String(enabled));
  touchButton.textContent = enabled ? 'タッチ移動を終了' : 'タッチ移動を開始';
  touchButton.hidden = !touchAvailable();
  if (touchAvailable() && !enabled) { map.dragging.disable(); mapElement.style.touchAction = 'pan-y'; }
  else { map.dragging.enable(); mapElement.style.touchAction = 'none'; }
}
touchButton.addEventListener('click', () => setTouchMode(touchButton.getAttribute('aria-pressed') !== 'true'));
coarse.addEventListener('change', () => setTouchMode(touchAvailable() && touchButton.getAttribute('aria-pressed') === 'true'));
setTouchMode(false);
new ResizeObserver(() => {
  map.invalidateSize({ animate: false, pan: false });
  updateExplorationBounds();
}).observe(mapElement);
renderScenario();
void loadGeography();
