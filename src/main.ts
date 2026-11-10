import { restoredMapState } from './note-restore';
import type { DiscoveryNote, NoteMapState, Result } from './notes';
import { mountNoteDrawer, mountNotes } from './notes-panel';
import { describeMapState } from './notes';
import { detailView, relatedLink } from './details';
import { renderDetail, renderPerspectiveContent, renderRelated, sourceSection } from './detail-panel';
import type { DetailActions, DetailTargets } from './detail-panel';
import { setMessage, tagElement, textElement } from './dom';
import { perspectiveIds, perspectives } from './perspectives';
import type { PerspectiveId } from './perspectives';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import { featureById, features, labels } from './content';
import { parseCountries, sourceRegistry, scenarioDefinition, selectionForScenario, routeStyles, layerIds, layerPresentation, featureLayer, hiddenFeatureMessage, hiddenLayerReason, featureSymbol, featureRole, changedFeatureIds, changeLabels, kindGlyph } from './domain';
import type { ExplorationFeature, LoadState, SelectedFeatureId, Scenario, LayerVisibility } from './domain';

function element<T extends HTMLElement>(id: string, constructor: { new(...args: never[]): T }): T {
  const value = document.getElementById(id);
  if (!(value instanceof constructor)) throw new Error(`Missing element: ${id}`);
  return value;
}

// ---- Page state. Every facet lives here; render functions derive the DOM from it and effects stay in handlers.
let selectedFeatureId: SelectedFeatureId | null = 'malacca';
let scenario: Scenario = { kind: 'normal' };
const layerVisibility: LayerVisibility = { borders: true, routes: true, points: true };
let loadState: LoadState = 'loading';
// Page-local like the scenario: a country's view is not saved with notes.
let perspective: PerspectiveId | null = null;
// The first-visit guide: no storage, no overlay. It leaves once the assumption has been chosen.
let introVisible = true;
// Phones scroll the page over the map until the reader turns map dragging on.
let touchDrag = false;
// The explanation of the selection stays folded until the reader selects something or opens it.
let cardOpen = false;
// Re-renders the note drawer's "state to be saved" line; bound once the drawer is mounted below.
let refreshNoteContext: () => void = () => {};

// ---- Map
const mapElement = element('map', HTMLDivElement);
const statusElement = element('load-status', HTMLParagraphElement);
const retry = element('retry', HTMLButtonElement);
const visibleLayersStatus = element('visible-layers', HTMLParagraphElement);
const scenarioSummary = element('scenario-summary', HTMLDivElement);
const layerHelp = element('layer-help', HTMLParagraphElement);
const selectedVisibility = element('selected-visibility', HTMLParagraphElement);
// One phone breakpoint for layout decisions in script; the stylesheet uses the same width.
const phoneWidth = '(max-width: 760px)';
const phone = matchMedia(phoneWidth);
// Include both candidate straits and complete authored routes even in normal mode.
const initialBounds: L.LatLngBoundsExpression = [[-13, 91], [18.5, 122]];
const map = L.map(mapElement, {
  // Quarter steps let the region fill whatever space the screen gives; the buttons still move a whole level.
  zoomSnap: 0.25, zoomControl: false, attributionControl: false, minZoom: 4, maxZoom: 7,
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
// On wide screens the cards lie over the map's left edge and the tools and legend over its foot; fit
// the region into the part they leave free. The foot's room is a fixed allowance (tools plus up to three
// legend lines) so that fitting gives the same view whatever the legend currently shows.
const footRoom = 120;
const cardColumn = element('scenario-controls', HTMLElement);
// The part of the map that lies under the cards (left) and under the tools and legend (bottom).
function mapInsets(): { left: number; bottom: number } {
  if (phone.matches) return { left: 0, bottom: 0 };
  return { left: cardColumn.getBoundingClientRect().right - mapElement.getBoundingClientRect().left, bottom: footRoom };
}
// True while the view is still the fitted region: then a change of the map's size (the menu opening,
// a rotated phone) fits it again instead of cutting it off. Any move ends that. Two orderings matter:
// fitBounds (not animated) fires moveend before the flag is set here, and the resize handler reads the
// flag before invalidateSize fires its own moveend.
let regionFitted = false;
function fitRegion(): void {
  const { left, bottom } = mapInsets();
  map.fitBounds(initialBounds, { paddingTopLeft: [left + 15, 15], paddingBottomRight: [15, bottom + 15], animate: false });
  regionFitted = true;
}
fitRegion();
map.on('moveend', () => { regionFitted = false; });
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
const selectionLayers = new Map<SelectedFeatureId, L.Path | L.Marker>();
function clearScenarioLayers(): void {
  layerGroups.routes.clearLayers(); layerGroups.points.clearLayers(); selectionLayers.clear();
}
function clearGeography(): void { mapLayers.clearLayers(); layerGroups.borders.clearLayers(); clearScenarioLayers(); }
function latLng(coordinate: [number, number]): L.LatLngTuple {
  return [coordinate[1], coordinate[0]];
}
function visibleFeatures(): readonly ExplorationFeature[] {
  const shown = new Set<SelectedFeatureId>(scenarioDefinition(scenario).featureIds);
  return features.filter(feature => shown.has(feature.id));
}
function isolateMapButton(button: HTMLButtonElement): void {
  L.DomEvent.disableClickPropagation(button);
  // Also stop click itself: Leaflet's touch double-tap synthesizer listens on
  // the map container and would interpret two selections as a zoom gesture.
  L.DomEvent.on(button, 'click', L.DomEvent.stopPropagation);
}
// A button that selects a feature, in the list or on the map. Map buttons get a distinct name and
// must not let Leaflet see their clicks.
function featureButton(feature: ExplorationFeature, onMap: boolean): HTMLButtonElement {
  const button = document.createElement('button');
  button.dataset.featureId = feature.id; button.setAttribute('aria-pressed', 'false');
  button.setAttribute('aria-label', `${onMap ? '地図上の' : ''}${feature.name}を選択`);
  button.addEventListener('click', () => selectFeature(feature.id, true));
  if (onMap) isolateMapButton(button);
  return button;
}
function marker(feature: ExplorationFeature): void {
  if (feature.kind === 'route') {
    const role = featureRole(feature.id, scenario) ?? 'normal';
    const style = routeStyles[role];
    const path = feature.coordinates.map(latLng);
    // These bounded authored lines are small: retain their full geometry so
    // panning/zooming does not trim endpoints or restart the dash pattern at
    // the renderer edge. SVG and #map still clip the visible drawing.
    const route = L.polyline(path, { noClip: true, color: style.color, weight: 3, dashArray: style.dashArray, className: `${feature.id} route-${role}`, interactive: false }).addTo(layerGroups.routes);
    L.polyline(path, { noClip: true, opacity: 0, weight: 24, className: 'route-hit', bubblingMouseEvents: false })
      .on('click', () => selectFeature(feature.id, true)).addTo(layerGroups.routes);
    selectionLayers.set(feature.id, route);
    const routeButton = featureButton(feature, true);
    routeButton.className = 'route-label'; routeButton.textContent = `${featureSymbol(feature, scenario)} ${feature.name}`;
    L.marker(feature.id === 'sunda-route' ? [-3.5, 108.8] : feature.id === 'lombok-route' ? [-5, 113] : [6.7, 108], { keyboard: false, icon: L.divIcon({ html: routeButton, className: 'feature-icon route-icon', iconSize: [155, 44], iconAnchor: [10, 44] }) }).addTo(layerGroups.routes);
    return;
  }
  const button = featureButton(feature, true);
  button.className = 'map-feature';
  button.append(textElement('span', featureSymbol(feature, scenario), 'feature-symbol'), textElement('span', feature.name, 'feature-name'));
  // The dot stays at the geographic coordinate; a leader connects the separate 44px target.
  const callout = textElement('div', '', `feature-callout callout-${feature.id}`);
  callout.append(textElement('span', '', 'coordinate-dot'), textElement('span', '', 'feature-leader'), button);
  const item = L.marker(latLng(feature.coordinate), {
    keyboard: false,
    icon: L.divIcon({ html: callout, className: 'feature-icon', iconSize: [0, 0], iconAnchor: [0, 0] }),
  }).addTo(layerGroups.points);
  selectionLayers.set(feature.id, item);
}
// Set a transient attribute on exactly these features' map elements and clear it elsewhere.
// Leaflet recreates icon and path elements when a layer is re-added, so marks are repainted by
// renderLayerVisibility as well as by the handlers that set them.
function markLayers(attribute: string, ids: ReadonlySet<SelectedFeatureId>): void {
  for (const [featureId, layer] of selectionLayers) {
    const target = layer.getElement();
    if (!target) continue;
    if (ids.has(featureId)) target.setAttribute(attribute, ''); else target.removeAttribute(attribute);
  }
}
// Bring a selected target into view with the smallest pan; the condition and zoom stay as they are.
// Points need room for their callout (right and below the anchor) clear of what lies over the map; a line
// counts as visible when it crosses the view.
function revealOnMap(id: SelectedFeatureId): void {
  const layer = selectionLayers.get(id);
  const { left, bottom } = mapInsets();
  if (layer instanceof L.Marker) map.panInside(layer.getLatLng(), { paddingTopLeft: [left + 70, 70], paddingBottomRight: [200, Math.max(90, bottom)], animate: false });
  else if (layer instanceof L.Polyline && !map.getBounds().intersects(layer.getBounds())) map.panTo(layer.getBounds().getCenter(), { animate: false });
}
// A quiet "look here" mark on the map while a related place is focused or hovered.
function previewOnMap(id: SelectedFeatureId | null): void { markLayers('data-related-preview', new Set(id === null ? [] : [id])); }

// ---- Selection
const detailTargets: DetailTargets = {
  description: element('selected-description', HTMLParagraphElement), why: element('selected-why', HTMLParagraphElement),
  scenario: element('selected-scenario', HTMLParagraphElement), related: element('selected-related', HTMLDivElement),
  relatedStatus: element('related-status', HTMLParagraphElement),
  more: element('detail-fields', HTMLDivElement), evidence: element('detail-evidence', HTMLDivElement),
};
// Related links (and a view's focus list) also bring the target into view; list and map clicks leave the view alone.
const detailActions: DetailActions = { select: id => { selectFeature(id, true); revealOnMap(id); }, preview: previewOnMap };
const selectionHeader = { name: element('selected-name', HTMLHeadingElement), kind: element('selected-kind', HTMLParagraphElement) };
const featureList = element('feature-list', HTMLElement);
const cardToggle = element('card-toggle', HTMLButtonElement);
const cardBody = element('card-body', HTMLDivElement);
const noSelection = '選択なし';
function renderCard(): void {
  cardToggle.textContent = selectedFeatureId === null ? noSelection : `${featureById(selectedFeatureId).name}：なぜ重要？`;
  cardToggle.setAttribute('aria-expanded', String(cardOpen));
  cardBody.hidden = !cardOpen;
}
function setCardOpen(open: boolean): void { cardOpen = open; renderCard(); }
cardToggle.addEventListener('click', () => setCardOpen(!cardOpen));
// On phones the map is pinned; the target's scroll-margin-top keeps it below the map.
function showBelowMap(target: HTMLElement): void {
  if (phone.matches) target.scrollIntoView({ block: 'start', behavior: 'instant' });
}
function renderSelection(): void {
  const { name, kind } = selectionHeader;
  renderCard();
  if (selectedFeatureId === null) {
    name.textContent = noSelection; kind.textContent = '';
    for (const target of Object.values(detailTargets)) target.replaceChildren();
    return;
  }
  const feature = featureById(selectedFeatureId);
  name.textContent = feature.name;
  kind.textContent = feature.classification === 'teaching-model'
    ? '航路 / モデル上の説明' : `${feature.kind === 'strait' ? '海峡' : '関連地点'} / 地理的事実（位置は代表点）`;
  renderDetail(detailTargets, detailView(feature.id, scenario), detailActions);
}
function syncSelectionMarks(): void {
  const feature = selectedFeatureId === null ? undefined : featureById(selectedFeatureId);
  setMessage(selectedVisibility, feature ? hiddenFeatureMessage(feature, layerVisibility) : '');
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
function selectFeature(id: SelectedFeatureId | null, reveal = false): void {
  selectedFeatureId = id;
  // Selecting is asking about the place: the explanation opens with it.
  if (reveal && id !== null) cardOpen = true;
  // Narrow path: the status, legend and focus list do not depend on the selection, and rebuilding
  // the focus list would drop keyboard focus from the button that was just pressed.
  renderSelection(); syncSelectionMarks(); refreshNoteContext();
  if (reveal && id !== null) showBelowMap(element('selection-card', HTMLElement));
}
function renderFeatureList(): void {
  featureList.replaceChildren();
  for (const feature of visibleFeatures()) {
    const button = featureButton(feature, false);
    button.textContent = `${featureSymbol(feature, scenario)} ${feature.name}`;
    const layer = featureLayer(feature);
    const visibility = textElement('span', layerVisibility[layer] ? '' : `（地図上で非表示：${hiddenLayerReason(layer)}）`, 'feature-visibility');
    visibility.id = `feature-visibility-${feature.id}`;
    button.setAttribute('aria-describedby', visibility.id);
    button.append(visibility);
    // Visibility and the view's focus are part of the list's state, not patched in afterwards.
    if (perspective !== null && perspectives[perspective].focus.includes(feature.id)) button.append(textElement('span', '（視点の焦点）', 'focus-note'));
    featureList.append(button);
  }
}
for (const source of Object.values(sourceRegistry)) element('source-list', HTMLDivElement).append(sourceSection(source, 'h2'));

// ---- Status and scenario summary
let summaryKey = '';
function renderStatus(presentation = layerPresentation(layerVisibility, scenario)): void {
  const ready = loadState === 'ready';
  mapElement.setAttribute('aria-busy', String(loadState === 'loading'));
  statusElement.textContent = loadState === 'loading' ? '地理データを読み込んでいます。'
    : ready ? `地図を読み込みました。${scenarioDefinition(scenario).name}の地図を探索できます。`
      : '地理データを読み込めませんでした。取得先やデータの状態を確認して、再試行してください。';
  retry.hidden = loadState !== 'error';
  // Once the map is there it speaks for itself; the line stays for assistive technology.
  statusElement.classList.toggle('sr-only', ready);
  visibleLayersStatus.textContent = `表示レイヤー${ready ? '' : '（予定）'}：${presentation.status}${ready ? '' : '（地理データ未表示）'}`;
  const summary = presentation.scenarioSummary;
  const notes = [...summary.notes, ...(ready ? [] : ['地理データは未表示です。条件設定のみ反映しています。'])];
  // Skip identical updates: the region is live, and re-announcing an unchanged summary is noise.
  // The normal condition has nothing to report on screen; the summary appears with a change or a hidden layer.
  scenarioSummary.classList.toggle('sr-only', scenario.kind === 'normal' && notes.length === 0);
  const key = [summary.title, ...summary.changes.map(change => change.kind + change.text), ...notes].join('\n');
  if (key === summaryKey) return;
  summaryKey = key;
  const list = document.createElement('ul');
  for (const change of summary.changes) {
    const item = textElement('li', '');
    item.append(tagElement(changeLabels[change.kind], `change-${change.kind}`), document.createTextNode(change.text)); list.append(item);
  }
  scenarioSummary.replaceChildren(textElement('p', summary.title, 'summary-title'), list, ...notes.map(text => textElement('p', text, 'summary-note')));
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

// ---- Geography and scenario rendering
async function loadGeography(): Promise<void> {
  loadState = 'loading'; renderStatus();
  clearGeography();
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}data/countries.json`);
    if (!response.ok) throw new Error('Geography HTTP failure');
    const raw: unknown = await response.json();
    const countries = parseCountries(raw);
    L.geoJSON(countries, { interactive: false, style: feature => ({ stroke: false, fillColor: '#edf0e5', fillOpacity: 1, className: `country-${String(feature?.properties.code)}` }) }).addTo(mapLayers);
    L.geoJSON(countries, { interactive: false, style: feature => ({ color: '#81968e', weight: 1, fill: false, className: `border-country-${String(feature?.properties.code)}` }) }).addTo(layerGroups.borders);
    for (const label of labels) {
      const text = textElement('span', countries.features.find(country => country.properties.code === label.code)?.properties.name ?? label.name, label.sea ? 'sea-label' : 'country-label');
      L.marker(latLng(label.coordinate), { interactive: false, keyboard: false,
        icon: L.divIcon({ html: text, className: 'geo-label', iconSize: [100, 20], iconAnchor: [50, 10] }) }).addTo(label.sea ? mapLayers : layerGroups.borders);
    }
    loadState = 'ready'; renderScenario();
  } catch {
    clearGeography(); loadState = 'error'; renderStatus();
  }
}
function renderScenario(): void {
  const definition = scenarioDefinition(scenario);
  const closed = scenario.kind === 'malacca-closed-assumption';
  for (const id of ['current-condition', 'map-condition']) element(id, HTMLElement).textContent = `現在の条件：${definition.name}`;
  element('scenario-normal', HTMLButtonElement).setAttribute('aria-pressed', String(!closed));
  element('scenario-closed', HTMLButtonElement).setAttribute('aria-pressed', String(closed));
  element('candidate-navigation', HTMLDivElement).hidden = !closed;
  clearScenarioLayers();
  if (loadState === 'ready') for (const feature of visibleFeatures()) marker(feature);
  renderFeatureList(); renderSelection(); renderLayerVisibility();
}
// Everything derived from more than one state facet, and everything painted onto map elements
// (which Leaflet recreates when a layer group is re-added): selection marks, the view's focus marks,
// the status lines and the note drawer's context line.
function renderDerived(presentation = layerPresentation(layerVisibility, scenario)): void {
  syncSelectionMarks(); renderPerspectiveFocus(); renderStatus(presentation); refreshNoteContext();
}
// Layer visibility and legend, then the list (its hidden-layer notes) and the derived views.
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
  setMessage(layerHelp, presentation.explanation);
  const closed = scenario.kind !== 'normal';
  for (const [key, id, symbol] of [
    ['borders', 'border-legend', 'border'], ['normal', 'normal-legend', closed ? 'unavailable' : 'normal'],
    ['candidate', 'candidate-legend', 'candidate'], ['strait', 'strait-legend', 'strait'], ['place', 'place-legend', 'point'],
  ] as const) {
    const item = element(id, HTMLLIElement);
    const legend = presentation.legends[key];
    const swatch = textElement('span', symbol === 'strait' ? kindGlyph.strait : symbol === 'point' ? kindGlyph.place : '', `key ${symbol}`);
    item.replaceChildren(swatch, document.createTextNode(legend.text));
    item.hidden = legend.hidden;
    item.classList.toggle('layer-off', legend.off);
  }
  renderFeatureList();
  renderDerived(presentation);
}
for (const id of layerIds) {
  element(`layer-${id}`, HTMLButtonElement).addEventListener('click', () => {
    layerVisibility[id] = !layerVisibility[id]; renderLayerVisibility();
  });
}
// Changing the condition: normalise the selection, let the first-visit guide go, re-render, then mark what changed.
function setScenario(kind: Scenario['kind']): void {
  const from = scenario; scenario = { kind };
  if (selectedFeatureId !== null) selectedFeatureId = selectionForScenario(selectedFeatureId, scenario);
  if (kind === 'malacca-closed-assumption') introVisible = false;
  renderIntro(); renderScenario(); highlightChanges(from);
}

// ---- Country view. Its text depends only on the chosen country; the focus list and the map marks also
// depend on the current condition, so they are re-rendered with the scenario and the layers.
const perspectiveButtons = [null, ...perspectiveIds].map(id => [id, element(`perspective-${id ?? 'none'}`, HTMLButtonElement)] as const);
const perspectivePanel = element('perspective-view', HTMLElement);
const perspectiveTargets = {
  title: element('perspective-title', HTMLHeadingElement), meaning: element('perspective-meaning', HTMLParagraphElement),
  statements: element('perspective-statements', HTMLUListElement),
  focus: element('perspective-focus', HTMLElement), focusStatus: element('perspective-focus-status', HTMLParagraphElement),
};
function renderPerspectiveText(): void {
  for (const [id, button] of perspectiveButtons) button.setAttribute('aria-pressed', String(id === perspective));
  perspectivePanel.hidden = perspective === null;
  if (perspective !== null) renderPerspectiveContent(perspectiveTargets, perspectives[perspective]);
}
// The focus list depends on the condition and the map marks on the (recreated) map elements.
function renderPerspectiveFocus(): void {
  const view = perspective === null ? null : perspectives[perspective];
  if (view) renderRelated(perspectiveTargets.focus, perspectiveTargets.focusStatus, '注目する対象', view.focus.map(id => relatedLink(id, '', scenario)), detailActions);
  markLayers('data-perspective-focus', new Set(view?.focus ?? []));
}
for (const [id, button] of perspectiveButtons) {
  button.addEventListener('click', () => { perspective = id; renderPerspectiveText(); renderFeatureList(); renderPerspectiveFocus(); });
}

// ---- Menu: settings, the list of places, sources and saved notes. A disclosure whose only state is
// whether it is shown; focus moves into it when it opens and back to its button when it closes.
const menu = element('menu', HTMLElement);
const menuOpener = element('menu-open', HTMLButtonElement);
function setMenuOpen(open: boolean): void {
  menu.hidden = !open; menuOpener.setAttribute('aria-expanded', String(open));
  if (!open) { menuOpener.focus(); return; }
  element('menu-title', HTMLElement).focus({ preventScroll: phone.matches }); showBelowMap(menu);
}
menuOpener.addEventListener('click', () => setMenuOpen(menu.hidden));
element('menu-close', HTMLButtonElement).addEventListener('click', () => setMenuOpen(false));
menu.addEventListener('keydown', event => { if (event.key === 'Escape') setMenuOpen(false); });

// ---- First-visit guide
function renderIntro(): void {
  element('intro', HTMLElement).hidden = !introVisible; element('intro-reopen', HTMLButtonElement).hidden = introVisible;
}
element('try-closed', HTMLButtonElement).addEventListener('click', () => {
  setScenario('malacca-closed-assumption'); element('scenario-closed', HTMLButtonElement).focus();
});
element('intro-close', HTMLButtonElement).addEventListener('click', () => { introVisible = false; renderIntro(); element('intro-reopen', HTMLButtonElement).focus(); });
element('intro-reopen', HTMLButtonElement).addEventListener('click', () => { introVisible = true; renderIntro(); element('try-closed', HTMLButtonElement).focus(); });
element('scenario-normal', HTMLButtonElement).addEventListener('click', () => setScenario('normal'));
element('scenario-closed', HTMLButtonElement).addEventListener('click', () => setScenario('malacca-closed-assumption'));
for (const id of ['sunda', 'lombok'] as const) {
  element(`go-${id}`, HTMLButtonElement).addEventListener('click', () => {
    const feature = featureById(id);
    if (feature.kind !== 'route') map.setView(latLng(feature.coordinate), 5, { animate: false });
  });
}
retry.addEventListener('click', () => { void loadGeography(); });
element('zoom-in', HTMLButtonElement).addEventListener('click', () => map.zoomIn(1, { animate: false }));
element('zoom-out', HTMLButtonElement).addEventListener('click', () => map.zoomOut(1, { animate: false }));
element('reset', HTMLButtonElement).addEventListener('click', fitRegion);

// ---- Touch mode. The label stays the same; aria-pressed carries the state and the hint says what a finger does now.
const touchButton = element('touch-mode', HTMLButtonElement);
const touchHint = element('map-hint', HTMLParagraphElement);
const coarse = matchMedia(`(any-pointer: coarse), ${phoneWidth}`);
const touchAvailable = () => navigator.maxTouchPoints > 0 || coarse.matches;
isolateMapButton(touchButton);
const touchHints = {
  on: '指でなぞると地図が動きます。ページをスクロールするには地図の外をなぞります。',
  off: `指でなぞるとページがスクロールします。地図を動かすには「${touchButton.textContent}」をオンにします。`,
};
function renderTouchMode(): void {
  const available = touchAvailable();
  const dragging = available && touchDrag;
  touchButton.setAttribute('aria-pressed', String(dragging));
  touchButton.hidden = !available;
  setMessage(touchHint, available ? touchHints[dragging ? 'on' : 'off'] : '');
  if (available && !dragging) { map.dragging.disable(); mapElement.style.touchAction = 'pan-y'; }
  else { map.dragging.enable(); mapElement.style.touchAction = 'none'; }
}
touchButton.addEventListener('click', () => { touchDrag = !touchDrag; renderTouchMode(); });
coarse.addEventListener('change', renderTouchMode);
renderTouchMode();
new ResizeObserver(() => {
  const fitted = regionFitted; const size = map.getSize();
  map.invalidateSize({ animate: false, pan: false });
  // The observer also reports once when it starts; nothing changed then.
  if (map.getSize().equals(size)) return;
  updateExplorationBounds();
  if (fitted) fitRegion();
}).observe(mapElement);
renderIntro();
renderScenario();
void loadGeography();

// ---- Notes
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
  Object.assign(layerVisibility, state.layers);
  selectedFeatureId = state.selectedFeatureId;
  // A restored condition is also a change the reader may not remember; setScenario marks it the same way.
  setScenario(state.scenarioId);
  map.setView([state.viewport.latitude, state.viewport.longitude], state.viewport.zoom, { animate: false });
  return { ok: true, value: { adjusted: result.value.adjusted } };
}
const noteForm = element('note-form', HTMLFormElement);
const drawer = mountNoteDrawer({ opener: element('note-open', HTMLButtonElement), form: noteForm, closer: element('note-close', HTMLButtonElement), context: element('note-context', HTMLParagraphElement), describe: () => describeMapState(snapshot()) });
refreshNoteContext = drawer.refresh;
mountNotes({ list: element('notes', HTMLElement), form: noteForm, snapshot, restore: applyNote, focusWhenEmpty: () => { setCardOpen(true); drawer.focus(); } });
