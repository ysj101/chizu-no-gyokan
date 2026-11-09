import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import { features, labels } from './content';
import { parseCountries, sourceRegistry } from './domain';
import type { ExplorationFeature, LoadState, SelectedFeatureId, SourceId } from './domain';

function element<T extends HTMLElement>(id: string, constructor: { new(...args: never[]): T }): T {
  const value = document.getElementById(id);
  if (!(value instanceof constructor)) throw new Error(`Missing element: ${id}`);
  return value;
}
const mapElement = element('map', HTMLDivElement);
const statusElement = element('load-status', HTMLParagraphElement);
const retry = element('retry', HTMLButtonElement);
let selectedFeatureId: SelectedFeatureId = 'malacca';
let loadState: LoadState = { status: 'loading' };
const initialBounds: L.LatLngBoundsExpression = [[-3, 91], [18.5, 116]];
const map = L.map(mapElement, {
  zoomControl: false, attributionControl: false, minZoom: 4, maxZoom: 7,
  maxBounds: [[-12, 78], [30, 130]], maxBoundsViscosity: 0.8,
  scrollWheelZoom: false, zoomAnimation: false, fadeAnimation: false,
  markerZoomAnimation: false, inertia: false, keyboard: false,
}).fitBounds(initialBounds, { padding: [15, 15], animate: false });
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
  element('selected-limit', HTMLParagraphElement).textContent = feature.limitation;
  sourceText(feature.sources);
  if (reveal && matchMedia('(max-width: 760px)').matches) {
    element('selection', HTMLElement).scrollIntoView({ block: 'start', behavior: 'instant' });
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-feature-id]')) {
    button.setAttribute('aria-pressed', String(button.dataset.featureId === selectedFeatureId));
  }
  for (const [featureId, layer] of selectionLayers) {
    const selected = featureId === selectedFeatureId;
    if (layer instanceof L.Path) layer.setStyle({ color: selected ? '#146d78' : '#885229', weight: selected ? 5 : 3 });
    else layer.getElement()?.classList.toggle('selected', selected);
  }
}
const featureList = element('feature-list', HTMLElement);
for (const feature of features) {
  const button = document.createElement('button');
  button.textContent = `${feature.kind === 'route' ? '┄' : feature.kind === 'strait' ? '◇' : '●'} ${feature.name}`;
  button.dataset.featureId = feature.id;
  button.setAttribute('aria-label', `${feature.name}を選択`);
  button.setAttribute('aria-pressed', 'false');
  button.addEventListener('click', () => selectFeature(feature.id, true));
  featureList.append(button);
}
for (const source of Object.values(sourceRegistry)) {
  const section = document.createElement('section');
  const heading = document.createElement('h2'); heading.append(link(source.title, source.url));
  section.append(heading);
  for (const text of [`参照日：${source.consulted}`, `対象時点：${source.period}`, `使用範囲：${source.usage}`, `利用条件：${source.rights}`]) {
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
    const route = L.polyline(feature.coordinates.map(latLng), { color: '#885229', weight: 3, dashArray: '9 7', className: 'normal-route', interactive: false }).addTo(mapLayers);
    L.polyline(feature.coordinates.map(latLng), { opacity: 0, weight: 24, className: 'route-hit', bubblingMouseEvents: false })
      .on('click', () => selectFeature(feature.id, true)).addTo(mapLayers);
    selectionLayers.set(feature.id, route);
    const routeButton = document.createElement('button');
    routeButton.dataset.featureId = feature.id; routeButton.setAttribute('aria-pressed', 'false');
    isolateMapButton(routeButton);
    routeButton.className = 'route-label'; routeButton.textContent = '┄ 通常主要航路';
    routeButton.setAttribute('aria-label', '地図上の通常主要航路を選択');
    routeButton.addEventListener('click', () => selectFeature(feature.id, true));
    L.marker([6.7, 108], { keyboard: false, icon: L.divIcon({ html: routeButton, className: 'feature-icon route-icon', iconSize: [155, 44], iconAnchor: [10, 44] }) }).addTo(mapLayers);
    return;
  }
  const button = document.createElement('button');
  button.dataset.featureId = feature.id; button.setAttribute('aria-pressed', 'false');
  isolateMapButton(button);
  button.className = 'map-feature';
  button.setAttribute('aria-label', `地図上の${feature.name}を選択`);
  const symbol = document.createElement('span'); symbol.className = 'feature-symbol';
  symbol.textContent = feature.kind === 'strait' ? '◇' : '●';
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
  }).addTo(mapLayers);
  selectionLayers.set(feature.id, item);
}
function showState(): void {
  mapElement.setAttribute('aria-busy', String(loadState.status === 'loading'));
  statusElement.textContent = loadState.status === 'loading' ? '地理データを読み込んでいます。'
    : loadState.status === 'ready' ? '地図を読み込みました。通常時の地図を探索できます。'
      : '地理データを読み込めませんでした。取得先やデータの状態を確認して、再試行してください。';
  retry.hidden = loadState.status !== 'error';
}
async function loadGeography(): Promise<void> {
  loadState = { status: 'loading' }; showState();
  mapLayers.clearLayers(); selectionLayers.clear();
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
    for (const feature of features) marker(feature);
    loadState = { status: 'ready' }; selectFeature(selectedFeatureId);
  } catch {
    mapLayers.clearLayers(); selectionLayers.clear(); loadState = { status: 'error' };
  }
  showState();
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
new ResizeObserver(() => map.invalidateSize({ animate: false, pan: false })).observe(mapElement);
selectFeature(selectedFeatureId);
void loadGeography();
