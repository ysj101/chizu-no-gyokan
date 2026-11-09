import { restoredMapState } from './note-restore';
import type { DiscoveryNote, NoteMapState, Result } from './notes';
import { mountNoteDrawer, mountNotes } from './notes-panel';
import { describeMapState } from './notes';
import { detailView } from './details';
import { renderDetail, tagElement, textElement } from './detail-panel';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import { featureById, features, labels } from './content';
import { parseCountries, sourceRegistry, scenarioDefinition, selectionForScenario, routeStyles, layerIds, layerPresentation, featureLayer, hiddenFeatureMessage, hiddenLayerReason, featureSymbol, featureRole, changedFeatureIds, changeLabels } from './domain';
import type { ExplorationFeature, LoadState, SelectedFeatureId, Scenario, LayerVisibility } from './domain';

function element<T extends HTMLElement>(id: string, constructor: { new(...args: never[]): T }): T {
  const value = document.getElementById(id);
  if (!(value instanceof constructor)) throw new Error(`Missing element: ${id}`);
  return value;
}
const mapElement = element('map', HTMLDivElement);
const statusElement = element('load-status', HTMLParagraphElement);
const retry = element('retry', HTMLButtonElement);
let selectedFeatureId: SelectedFeatureId | null = 'malacca';
let scenario: Scenario = { kind: 'normal' };
const layerVisibility: LayerVisibility = { borders: true, routes: true, points: true };
let loadState: LoadState = { status: 'loading' };
// Re-renders the note drawer's "state to be saved" line; bound once the drawer is mounted below.
let refreshNoteContext: () => void = () => {};
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
const layerGroups = {
  borders: L.layerGroup().addTo(map),
  routes: L.layerGroup().addTo(map),
  points: L.layerGroup().addTo(map),
};
function clearScenarioLayers(): void {
  layerGroups.routes.clearLayers(); layerGroups.points.clearLayers(); selectionLayers.clear();
}
const selectionLayers = new Map<SelectedFeatureId, L.Path | L.Marker>();

function latLng(coordinate: [number, number]): L.LatLngTuple {
  return [coordinate[1], coordinate[0]];
}
function link(title: string, url: string): HTMLAnchorElement {
  const a = document.createElement('a'); a.textContent = title; a.href = url;
  return a;
}
function selectFeature(id: SelectedFeatureId | null, reveal = false): void {
  if (id === null) {
    selectedFeatureId = null;
    element('selected-name', HTMLHeadingElement).textContent = '選択なし';
    for (const key of ['selected-kind', 'selected-description', 'selected-why', 'selected-scenario', 'selected-related', 'related-status', 'detail-fields', 'detail-evidence']) {
      element(key, HTMLElement).replaceChildren();
    }
    updateSelectedVisibility(); updateSelectionAppearance(); return;
  }
  const feature = featureById(id);
  selectedFeatureId = feature.id;
  element('selected-name', HTMLHeadingElement).textContent = feature.name;
  element('selected-kind', HTMLParagraphElement).textContent = feature.classification === 'teaching-model'
    ? '航路 / モデル上の説明' : `${feature.kind === 'strait' ? '海峡' : '関連地点'} / 地理的事実（位置は代表点）`;
  renderDetail({
    description: element('selected-description', HTMLParagraphElement), why: element('selected-why', HTMLParagraphElement),
    scenario: element('selected-scenario', HTMLParagraphElement), related: element('selected-related', HTMLDivElement),
    relatedStatus: element('related-status', HTMLParagraphElement),
    more: element('detail-fields', HTMLDivElement), evidence: element('detail-evidence', HTMLDivElement),
  }, detailView(feature.id, scenario), {
    // Related links also bring the target into view; list and map clicks leave the view alone.
    select: target => { selectFeature(target, true); revealOnMap(target); },
    preview: previewOnMap,
  });
  if (reveal && matchMedia('(max-width: 760px)').matches) {
    // On phones the map is pinned; #selection's scroll-margin-top keeps the explanation below it.
    element('selection', HTMLElement).scrollIntoView({ block: 'start', behavior: 'instant' });
  }
  updateSelectedVisibility();
  updateSelectionAppearance();
  refreshNoteContext();
}
// Bring a selected target into view with the smallest pan; the condition and zoom stay as they are.
// Points need room for their callout (right and below the anchor); a line counts as visible when it crosses the view.
function revealOnMap(id: SelectedFeatureId): void {
  const layer = selectionLayers.get(id);
  if (layer instanceof L.Marker) map.panInside(layer.getLatLng(), { paddingTopLeft: [70, 70], paddingBottomRight: [200, 90], animate: false });
  else if (layer instanceof L.Polyline && !map.getBounds().intersects(layer.getBounds())) map.panTo(layer.getBounds().getCenter(), { animate: false });
}
// A quiet "look here" mark on the map while a related place is focused or hovered.
function previewOnMap(id: SelectedFeatureId | null): void { markLayers('data-related-preview', new Set(id === null ? [] : [id])); }
function updateSelectedVisibility(): void {
  const feature = features.find(item => item.id === selectedFeatureId);
  const message = feature ? hiddenFeatureMessage(feature, layerVisibility) : '';
  const target = element('selected-visibility', HTMLParagraphElement);
  target.textContent = message; target.hidden = !message;
}
function updateSelectionAppearance(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-feature-id]')) {
    button.setAttribute('aria-pressed', String(button.dataset.featureId === selectedFeatureId));
  }
  for (const [featureId, layer] of selectionLayers) {
    const selected = featureId === selectedFeatureId;
    if (layer instanceof L.Path) {
      const role = featureRole(featureId, scenario) ?? 'normal';
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
    button.textContent = `${featureSymbol(feature, scenario)} ${feature.name}`;
    button.dataset.featureId = feature.id;
    button.setAttribute('aria-label', `${feature.name}を選択`);
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => selectFeature(feature.id, true));
    const visibility = document.createElement('span'); visibility.className = 'feature-visibility';
    visibility.id = `feature-visibility-${feature.id}`;
    button.setAttribute('aria-describedby', visibility.id);
    button.append(visibility);
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
    const role = featureRole(feature.id, scenario) ?? 'normal';
    const style = routeStyles[role];
    // These bounded authored lines are small: retain their full geometry so
    // panning/zooming does not trim endpoints or restart the dash pattern at
    // the renderer edge. SVG and #map still clip the visible drawing.
    const route = L.polyline(feature.coordinates.map(latLng), { noClip: true, color: style.color, weight: 3, dashArray: style.dashArray, className: `${feature.id} route-${role}`, interactive: false }).addTo(layerGroups.routes);
    L.polyline(feature.coordinates.map(latLng), { noClip: true, opacity: 0, weight: 24, className: 'route-hit', bubblingMouseEvents: false })
      .on('click', () => selectFeature(feature.id, true)).addTo(layerGroups.routes);
    selectionLayers.set(feature.id, route);
    const routeButton = document.createElement('button');
    routeButton.dataset.featureId = feature.id; routeButton.setAttribute('aria-pressed', 'false');
    isolateMapButton(routeButton);
    routeButton.className = 'route-label'; routeButton.textContent = `${featureSymbol(feature, scenario)} ${feature.name}`;
    routeButton.setAttribute('aria-label', `地図上の${feature.name}を選択`);
    routeButton.addEventListener('click', () => selectFeature(feature.id, true));
    L.marker(feature.id === 'sunda-route' ? [-3.5, 108.8] : feature.id === 'lombok-route' ? [-5, 113] : [6.7, 108], { keyboard: false, icon: L.divIcon({ html: routeButton, className: 'feature-icon route-icon', iconSize: [155, 44], iconAnchor: [10, 44] }) }).addTo(layerGroups.routes);
    return;
  }
  const button = document.createElement('button');
  button.dataset.featureId = feature.id; button.setAttribute('aria-pressed', 'false');
  isolateMapButton(button);
  button.className = 'map-feature';
  button.setAttribute('aria-label', `地図上の${feature.name}を選択`);
  const symbol = document.createElement('span'); symbol.className = 'feature-symbol';
  symbol.textContent = featureSymbol(feature, scenario);
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
  }).addTo(layerGroups.points);
  selectionLayers.set(feature.id, item);
}
function showState(): void {
  mapElement.setAttribute('aria-busy', String(loadState.status === 'loading'));
  statusElement.textContent = loadState.status === 'loading' ? '地理データを読み込んでいます。'
    : loadState.status === 'ready' ? `地図を読み込みました。${scenarioDefinition(scenario).name}の地図を探索できます。`
      : '地理データを読み込めませんでした。取得先やデータの状態を確認して、再試行してください。';
  retry.hidden = loadState.status !== 'error';
  const presentation = layerPresentation(layerVisibility, scenario);
  element('visible-layers', HTMLParagraphElement).textContent = `表示レイヤー${loadState.status === 'ready' ? '' : '（予定）'}：${presentation.status}`
    + (loadState.status === 'ready' ? '' : '（地理データ未表示）');
  const summary = presentation.scenarioSummary;
  const notes = [...summary.notes, ...(loadState.status === 'ready' ? [] : ['地理データは未表示です。条件設定のみ反映しています。'])];
  const list = document.createElement('ul');
  for (const change of summary.changes) {
    const item = textElement('li', '');
    item.append(tagElement(changeLabels[change.kind], `change-${change.kind}`), document.createTextNode(change.text)); list.append(item);
  }
  const target = element('scenario-summary', HTMLDivElement);
  const next = [textElement('p', summary.title, 'summary-title'), list, ...notes.map(text => textElement('p', text, 'summary-note'))];
  // Skip identical updates: the region is live, and re-announcing an unchanged summary is noise.
  if (target.innerText !== next.map(node => node.innerText).join('\n')) target.replaceChildren(...next);
}
// Briefly mark the features whose role differs from the previous condition, so the change can be
// seen without remembering the earlier map. Reduced motion keeps the mark static. This is a
// transient effect applied after a render; a rebuild within the window simply clears it.
let highlightTimer: ReturnType<typeof setTimeout> | undefined;
function highlightChanges(from: Scenario): void {
  if (from.kind === scenario.kind) return;
  clearTimeout(highlightTimer);
  markLayers('data-just-changed', new Set(changedFeatureIds(from, scenario, features)));
  highlightTimer = setTimeout(() => markLayers('data-just-changed', new Set()), 2500);
}
// Set a transient attribute on exactly these features' map elements and clear it elsewhere.
function markLayers(attribute: string, ids: ReadonlySet<SelectedFeatureId>): void {
  for (const [featureId, layer] of selectionLayers) {
    const target = layer.getElement();
    if (!target) continue;
    if (ids.has(featureId)) target.setAttribute(attribute, ''); else target.removeAttribute(attribute);
  }
}
async function loadGeography(): Promise<void> {
  loadState = { status: 'loading' }; showState();
  mapLayers.clearLayers(); layerGroups.borders.clearLayers(); clearScenarioLayers();
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}data/countries.json`);
    if (!response.ok) throw new Error('Geography HTTP failure');
    const raw: unknown = await response.json();
    const countries = parseCountries(raw);
    L.geoJSON(countries, { interactive: false, style: feature => ({ stroke: false, fillColor: '#edf0e5', fillOpacity: 1, className: `country-${String(feature?.properties.code)}` }) }).addTo(mapLayers);
    L.geoJSON(countries, { interactive: false, style: feature => ({ color: '#81968e', weight: 1, fill: false, className: `border-country-${String(feature?.properties.code)}` }) }).addTo(layerGroups.borders);
    for (const label of labels) {
      const text = document.createElement('span');
      text.textContent = countries.features.find(country => country.properties.code === label.code)?.properties.name ?? label.name;
      text.className = label.sea ? 'sea-label' : 'country-label';
      L.marker(latLng(label.coordinate), { interactive: false, keyboard: false,
        icon: L.divIcon({ html: text, className: 'geo-label', iconSize: [100, 20], iconAnchor: [50, 10] }) }).addTo(label.sea ? mapLayers : layerGroups.borders);
    }
    loadState = { status: 'ready' }; renderScenario();
  } catch {
    mapLayers.clearLayers(); layerGroups.borders.clearLayers(); clearScenarioLayers(); loadState = { status: 'error' };
  }
  showState();
}
function renderScenario(): void {
  const definition = scenarioDefinition(scenario);
  const closed = scenario.kind === 'malacca-closed-assumption';
  if (selectedFeatureId !== null) selectedFeatureId = selectionForScenario(selectedFeatureId, scenario);
  for (const id of ['current-condition', 'map-condition']) element(id, HTMLElement).textContent = `現在の条件：${definition.name}`;
  element('scenario-normal', HTMLButtonElement).setAttribute('aria-pressed', String(!closed));
  element('scenario-closed', HTMLButtonElement).setAttribute('aria-pressed', String(closed));
  element('candidate-navigation', HTMLDivElement).hidden = !closed;
  if (closed) showIntro(false);
  clearScenarioLayers();
  if (loadState.status === 'ready') for (const feature of visibleFeatures()) marker(feature);
  renderFeatureList(); selectFeature(selectedFeatureId); renderLayerVisibility();
}
function renderLayerVisibility(): void {
  const presentation = layerPresentation(layerVisibility, scenario);
  for (const id of layerIds) {
    const button = element(`layer-${id}`, HTMLButtonElement);
    button.setAttribute('aria-pressed', String(layerVisibility[id]));
    // The mark is decorative; aria-pressed is the single state channel for assistive tech.
    const mark = button.querySelector('.mark'); if (mark) mark.textContent = layerVisibility[id] ? '☑' : '☐';
    if (layerVisibility[id]) layerGroups[id].addTo(map);
    else map.removeLayer(layerGroups[id]);
  }
  const help = element('layer-help', HTMLParagraphElement);
  help.textContent = presentation.explanation; help.hidden = !presentation.explanation;
  const closed = scenario.kind !== 'normal';
  for (const [key, id, symbol] of [
    ['borders', 'border-legend', 'border'], ['normal', 'normal-legend', closed ? 'unavailable' : 'normal'],
    ['candidate', 'candidate-legend', 'candidate'], ['strait', 'strait-legend', 'strait'], ['place', 'place-legend', 'point'],
  ] as const) {
    const item = element(id, HTMLLIElement);
    const legend = presentation.legends[key];
    const swatch = document.createElement('span'); swatch.className = `key ${symbol}`;
    swatch.textContent = symbol === 'strait' ? '◇' : symbol === 'point' ? '●' : '';
    item.replaceChildren(swatch, document.createTextNode(legend.text));
    item.hidden = legend.hidden;
    item.classList.toggle('layer-off', legend.off);
  }
  for (const feature of visibleFeatures()) {
    const label = featureList.querySelector(`[data-feature-id="${feature.id}"] .feature-visibility`);
    if (label) label.textContent = layerVisibility[featureLayer(feature)] ? '' : `（地図上で非表示：${hiddenLayerReason(featureLayer(feature))}）`;
  }
  updateSelectedVisibility(); updateSelectionAppearance(); showState(); refreshNoteContext();
}
for (const id of layerIds) {
  element(`layer-${id}`, HTMLButtonElement).addEventListener('click', () => {
    layerVisibility[id] = !layerVisibility[id]; renderLayerVisibility();
  });
}
function setScenario(kind: Scenario['kind']): void {
  const from = scenario; scenario = { kind }; renderScenario(); highlightChanges(from);
}
// The first-visit guide is page-local: no storage, no overlay. It leaves once the
// assumption has been seen (see renderScenario) and can be reopened at any time.
function showIntro(visible: boolean): void {
  element('intro', HTMLElement).hidden = !visible; element('intro-reopen', HTMLButtonElement).hidden = visible;
}
element('try-closed', HTMLButtonElement).addEventListener('click', () => {
  setScenario('malacca-closed-assumption'); element('scenario-closed', HTMLButtonElement).focus();
});
element('intro-close', HTMLButtonElement).addEventListener('click', () => { showIntro(false); element('intro-reopen', HTMLButtonElement).focus(); });
element('intro-reopen', HTMLButtonElement).addEventListener('click', () => { showIntro(true); element('try-closed', HTMLButtonElement).focus(); });
element('scenario-normal', HTMLButtonElement).addEventListener('click', () => setScenario('normal'));
element('scenario-closed', HTMLButtonElement).addEventListener('click', () => setScenario('malacca-closed-assumption'));
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
const touchHint = element('map-hint', HTMLParagraphElement);
isolateMapButton(touchButton);
const touchHints = {
  on: '指でなぞると地図が動きます。ページをスクロールするには地図の外をなぞります。',
  off: `指でなぞるとページがスクロールします。地図を動かすには「${touchButton.textContent}」をオンにします。`,
};
// The label stays the same; aria-pressed carries the state and the hint says what a finger does now.
function setTouchMode(enabled: boolean): void {
  const available = touchAvailable();
  touchButton.setAttribute('aria-pressed', String(enabled));
  touchButton.hidden = !available;
  const hint = available ? touchHints[enabled ? 'on' : 'off'] : '';
  touchHint.textContent = hint; touchHint.hidden = !hint;
  if (available && !enabled) { map.dragging.disable(); mapElement.style.touchAction = 'pan-y'; }
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

function snapshot(): NoteMapState {
  const center = map.getCenter();
  return {
    scenarioId: scenario.kind, layers: { ...layerVisibility }, selectedFeatureId,
    viewport: { longitude: center.lng, latitude: center.lat, zoom: map.getZoom() },
  };
}

// One synchronous application, using the existing rendering paths and map instance.
function applyNote(note: DiscoveryNote): Result<{ adjusted: boolean }> {
  const zoom = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), note.mapState.viewport.zoom));
  const configured = map.options.maxBounds!;
  const bounds = configured instanceof L.LatLngBounds ? configured : L.latLngBounds(configured);
  const half = map.getSize().divideBy(2);
  const sw = map.unproject(map.project(bounds.getSouthWest(), zoom).add([half.x, -half.y]), zoom);
  const ne = map.unproject(map.project(bounds.getNorthEast(), zoom).add([-half.x, half.y]), zoom);
  const result = restoredMapState(note.mapState, snapshot(), {
    west: sw.lng, east: ne.lng, south: sw.lat, north: ne.lat, minZoom: map.getMinZoom(), maxZoom: map.getMaxZoom(),
  });
  if (!result.ok) return result;
  const state = result.value.state;
  const from = scenario;
  scenario = { kind: state.scenarioId };
  Object.assign(layerVisibility, state.layers);
  selectedFeatureId = state.selectedFeatureId;
  renderScenario();
  // A restored condition is also a change the reader may not remember; mark it the same way.
  highlightChanges(from);
  map.setView([state.viewport.latitude, state.viewport.longitude], state.viewport.zoom, { animate: false });
  return { ok: true, value: { adjusted: result.value.adjusted } };
}
const noteForm = element('note-form', HTMLFormElement);
const drawer = mountNoteDrawer(element('note-open', HTMLButtonElement), noteForm, element('note-close', HTMLButtonElement), element('note-context', HTMLParagraphElement), () => describeMapState(snapshot()));
refreshNoteContext = drawer.refresh; refreshNoteContext();
mountNotes({ list: element('notes', HTMLElement), form: noteForm, snapshot, restore: applyNote, focusWhenEmpty: drawer.focus });
