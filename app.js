/* =========================================================
   Constants
   ========================================================= */
const STORAGE_KEY = 'tripItineraryData.v1';
const THEME_KEY = 'tripItineraryTheme';

const CATEGORIES = {
  flight:    { icon: '✈️', label: 'Flight',        color: 'var(--cat-flight)' },
  train:     { icon: '🚆', label: 'Train / transit', color: 'var(--cat-train)' },
  hotel:     { icon: '🏨', label: 'Hotel',          color: 'var(--cat-hotel)' },
  food:      { icon: '🍴', label: 'Food',           color: 'var(--cat-food)' },
  activity:  { icon: '🎟️', label: 'Activity',       color: 'var(--cat-activity)' },
  transport: { icon: '🚗', label: 'Transport',      color: 'var(--cat-transport)' },
  other:     { icon: '📍', label: 'Other',          color: 'var(--cat-other)' },
};

/* =========================================================
   Small helpers
   ========================================================= */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function uid() {
  return 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function todayLocalISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function formatDateLong(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatDateShort(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function money(amount, symbol) {
  const n = Number(amount) || 0;
  return `${symbol || '$'}${n.toFixed(2)}`;
}

function hasCoords(lat, lon) {
  return lat !== null && lat !== undefined && lat !== '' && !isNaN(lat) &&
         lon !== null && lon !== undefined && lon !== '' && !isNaN(lon);
}

function dayColor(index) {
  return `hsl(${(index * 63) % 360}, 55%, 45%)`;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/* =========================================================
   Sample data (first run demo)
   ========================================================= */
function sampleTrip() {
  const start = todayLocalISO();
  const end = addDays(start, 1);
  return {
    tripName: 'Tokyo Long Weekend',
    currency: '$',
    startDate: start,
    endDate: end,
    events: [
      {
        id: uid(), name: 'Flight to Tokyo (Narita)', category: 'flight',
        date: start, startTime: '10:15', endTime: '14:40',
        depName: 'San Francisco Intl (SFO)', depLat: 37.6213, depLon: -122.3790,
        arrName: 'Narita Airport (NRT)', arrLat: 35.7719, arrLon: 140.3929,
        cost: 780, attire: '', notes: 'Terminal 2, seat 24A. Confirmation ABC123.',
      },
      {
        id: uid(), name: 'Check in — Park Hyatt Tokyo', category: 'hotel',
        date: start, startTime: '16:30', endTime: '',
        depName: 'Park Hyatt Tokyo', depLat: 35.6938, depLon: 139.6897,
        arrName: 'Park Hyatt Tokyo', arrLat: 35.6938, arrLon: 139.6897,
        cost: 420, attire: '', notes: 'Ask for a room on a high floor.',
      },
      {
        id: uid(), name: 'Dinner at Gonpachi Nishiazabu', category: 'food',
        date: start, startTime: '19:30', endTime: '21:00',
        depName: 'Gonpachi Nishiazabu', depLat: 35.6586, depLon: 139.7280,
        arrName: 'Gonpachi Nishiazabu', arrLat: 35.6586, arrLon: 139.7280,
        cost: 90, attire: 'Smart casual', notes: 'Reservation under trip name.',
      },
      {
        id: uid(), name: 'Shibuya Sky observation deck', category: 'activity',
        date: end, startTime: '10:00', endTime: '12:00',
        depName: 'Shibuya Sky', depLat: 35.6595, depLon: 139.7005,
        arrName: 'Shibuya Sky', arrLat: 35.6595, arrLon: 139.7005,
        cost: 22, attire: '', notes: 'Book timed-entry tickets in advance.',
      },
      {
        id: uid(), name: 'Flight home (Haneda)', category: 'flight',
        date: end, startTime: '18:00', endTime: '',
        depName: 'Haneda Airport (HND)', depLat: 35.5494, depLon: 139.7798,
        arrName: 'San Francisco Intl (SFO)', arrLat: 37.6213, arrLon: -122.3790,
        cost: 780, attire: '', notes: 'Arrive 3 hours early for international check-in.',
      },
    ],
  };
}

function emptyTrip() {
  const t = todayLocalISO();
  return { tripName: 'New Trip', currency: '$', startDate: t, endDate: t, events: [] };
}

/* =========================================================
   State + persistence
   ========================================================= */
const state = {
  trip: null,
  selectedDate: null,
  dayMap: null,
  tripMap: null,
  dayMapLayer: null,
  tripMapLayer: null,
  mapsInited: { day: false, trip: false },
  editingId: null,
  pickerMap: null,
  pickerMarkers: { dep: null, arr: null },
};

function loadTrip() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.events)) return parsed;
    }
  } catch (e) {
    console.warn('Could not read saved trip, starting fresh.', e);
  }
  return sampleTrip();
}

function saveTrip() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.trip));
  } catch (e) {
    console.warn('Could not save trip to this browser.', e);
  }
}

/* =========================================================
   Day list / cost helpers
   ========================================================= */
function getDayList() {
  const t = state.trip;
  const dates = new Set();
  if (t.startDate && t.endDate) {
    let cur = t.startDate;
    let guard = 0;
    while (cur <= t.endDate && guard < 366) {
      dates.add(cur);
      cur = addDays(cur, 1);
      guard++;
    }
  }
  t.events.forEach((e) => { if (e.date) dates.add(e.date); });
  return Array.from(dates).sort();
}

function eventsForDay(date) {
  return state.trip.events.filter((e) => e.date === date);
}

function sortedEventsForDay(date) {
  const evs = eventsForDay(date);
  const timed = evs.filter((e) => e.startTime).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const untimed = evs.filter((e) => !e.startTime).sort((a, b) => a.name.localeCompare(b.name));
  return [...timed, ...untimed];
}

function dayTotalCost(date) {
  return eventsForDay(date).reduce((sum, e) => sum + (Number(e.cost) || 0), 0);
}

function tripTotalCost() {
  return state.trip.events.reduce((sum, e) => sum + (Number(e.cost) || 0), 0);
}

/* =========================================================
   Rendering — header
   ========================================================= */
function renderHeader() {
  const t = state.trip;
  $('#tripTitle').textContent = t.tripName || 'Trip';
  const days = getDayList();
  if (days.length) {
    $('#tripDatesLabel').textContent = days.length === 1
      ? formatDateShort(days[0])
      : `${formatDateShort(days[0])} – ${formatDateShort(days[days.length - 1])}`;
  } else {
    $('#tripDatesLabel').textContent = '—';
  }
  $('#tripTotalCost').textContent = money(tripTotalCost(), t.currency);
}

/* =========================================================
   Rendering — day selectors (shared by itinerary + day map)
   ========================================================= */
function renderDaySelectors() {
  const days = getDayList();
  if (!days.includes(state.selectedDate)) {
    state.selectedDate = days[0] || todayLocalISO();
  }
  const today = todayLocalISO();

  [$('#daySelectorItinerary'), $('#daySelectorMap')].forEach((container) => {
    if (!container) return;
    container.innerHTML = '';
    days.forEach((date, i) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'day-chip' + (date === state.selectedDate ? ' is-selected' : '') + (date === today ? ' is-today' : '');
      chip.innerHTML = `<span class="day-num">Day ${i + 1}</span><span class="day-date">${formatDateShort(date)}</span>`;
      chip.addEventListener('click', () => {
        state.selectedDate = date;
        renderDaySelectors();
        renderItineraryView();
        if (state.mapsInited.day) updateDayMap();
      });
      container.appendChild(chip);
    });
    if (!days.length) {
      container.innerHTML = '<p class="panel-note">Set trip dates in Summary, or add an event, to get started.</p>';
    }
  });
}

/* =========================================================
   Rendering — itinerary (list) view
   ========================================================= */
function renderItineraryView() {
  const container = $('#dayContent');
  const date = state.selectedDate;
  if (!date) {
    container.innerHTML = '<div class="empty-state"><span class="empty-emoji">🧳</span>No days yet. Add an event to begin.</div>';
    return;
  }
  const events = sortedEventsForDay(date);

  let html = `<div class="day-heading"><h2>${formatDateLong(date)}</h2><span class="day-total">${money(dayTotalCost(date), state.trip.currency)}</span></div>`;

  if (!events.length) {
    html += '<div class="empty-state"><span class="empty-emoji">🌤️</span>Nothing planned yet for this day.</div>';
  } else {
    events.forEach((e) => { html += eventCardHtml(e); });
  }
  container.innerHTML = html;

  $$('.event-card', container).forEach((card) => {
    card.addEventListener('click', () => openModal(card.dataset.id));
  });
}

function eventCardHtml(e) {
  const cat = CATEGORIES[e.category] || CATEGORIES.other;
  const isTransfer = e.arrName && e.arrName !== e.depName;
  const locationLine = isTransfer
    ? `${escapeHtml(e.depName || 'Departure')} → ${escapeHtml(e.arrName)}`
    : escapeHtml(e.depName || 'No location set');

  const timeLine = e.startTime
    ? (e.endTime ? `${formatTime(e.startTime)}<br>${formatTime(e.endTime)}` : formatTime(e.startTime))
    : 'Anytime';

  let meta = '';
  if (e.cost) meta += `<span class="chip chip-cost">${money(e.cost, state.trip.currency)}</span>`;
  if (e.attire) meta += `<span class="chip">👔 ${escapeHtml(e.attire)}</span>`;

  return `
    <div class="event-card" data-id="${e.id}">
      <div class="event-stub">
        <div class="cat-dot" style="background:${cat.color}">${cat.icon}</div>
        <div class="event-time">${timeLine}</div>
      </div>
      <div class="event-body">
        <div class="event-name">${escapeHtml(e.name)}</div>
        <div class="event-location">📍 ${locationLine}</div>
        ${meta ? `<div class="event-meta-row">${meta}</div>` : ''}
        ${e.notes ? `<div class="event-notes">${escapeHtml(e.notes)}</div>` : ''}
      </div>
    </div>`;
}

/* =========================================================
   Maps — day map
   ========================================================= */
function initDayMap() {
  state.dayMap = L.map('dayMap', { scrollWheelZoom: false });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(state.dayMap);
  state.dayMapLayer = L.layerGroup().addTo(state.dayMap);
  state.mapsInited.day = true;
  updateDayMap();
}

function pinIcon(color, emoji) {
  return L.divIcon({
    className: 'custom-pin',
    html: `<div class="pin-inner" style="background:${color}">${emoji}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function updateDayMap() {
  if (!state.mapsInited.day) return;
  state.dayMapLayer.clearLayers();
  const events = sortedEventsForDay(state.selectedDate);
  const points = [];

  events.forEach((e) => {
    const cat = CATEGORIES[e.category] || CATEGORIES.other;
    if (hasCoords(e.depLat, e.depLon)) {
      const p = [Number(e.depLat), Number(e.depLon)];
      points.push(p);
      L.marker(p, { icon: pinIcon(cat.color, cat.icon) })
        .bindPopup(`<b>${escapeHtml(e.name)}</b><br>${escapeHtml(e.depName || '')}${e.startTime ? '<br>' + formatTime(e.startTime) : ''}`)
        .addTo(state.dayMapLayer);
    }
    const isTransfer = e.arrName && (e.arrLat !== e.depLat || e.arrLon !== e.depLon);
    if (isTransfer && hasCoords(e.arrLat, e.arrLon)) {
      const p2 = [Number(e.arrLat), Number(e.arrLon)];
      points.push(p2);
      L.marker(p2, { icon: pinIcon(cat.color, cat.icon) })
        .bindPopup(`<b>${escapeHtml(e.name)}</b><br>${escapeHtml(e.arrName || '')}${e.endTime ? '<br>' + formatTime(e.endTime) : ''}`)
        .addTo(state.dayMapLayer);
    }
  });

  if (points.length > 1) {
    L.polyline(points, { color: '#2F8F97', weight: 3, dashArray: '6 6', opacity: 0.85 }).addTo(state.dayMapLayer);
  }

  if (points.length) {
    state.dayMap.fitBounds(points, { padding: [30, 30], maxZoom: 15 });
  } else {
    state.dayMap.setView([20, 0], 2);
  }
}

/* =========================================================
   Maps — trip map (all days, color coded)
   ========================================================= */
function initTripMap() {
  state.tripMap = L.map('tripMap', { scrollWheelZoom: false });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(state.tripMap);
  state.tripMapLayer = L.layerGroup().addTo(state.tripMap);
  state.mapsInited.trip = true;
  updateTripMap();
}

function updateTripMap() {
  if (!state.mapsInited.trip) return;
  state.tripMapLayer.clearLayers();
  const days = getDayList();
  const allPoints = [];
  const legend = $('#tripMapLegend');
  legend.innerHTML = '';

  days.forEach((date, i) => {
    const color = dayColor(i);
    const events = sortedEventsForDay(date);
    const dayPoints = [];
    let hasAny = false;

    events.forEach((e) => {
      if (hasCoords(e.depLat, e.depLon)) {
        const p = [Number(e.depLat), Number(e.depLon)];
        dayPoints.push(p); allPoints.push(p); hasAny = true;
        L.circleMarker(p, { radius: 7, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 })
          .bindPopup(`<b>${escapeHtml(e.name)}</b><br>Day ${i + 1} · ${escapeHtml(e.depName || '')}`)
          .addTo(state.tripMapLayer);
      }
      const isTransfer = e.arrName && (e.arrLat !== e.depLat || e.arrLon !== e.depLon);
      if (isTransfer && hasCoords(e.arrLat, e.arrLon)) {
        const p2 = [Number(e.arrLat), Number(e.arrLon)];
        dayPoints.push(p2); allPoints.push(p2); hasAny = true;
        L.circleMarker(p2, { radius: 7, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 })
          .bindPopup(`<b>${escapeHtml(e.name)}</b><br>Day ${i + 1} · ${escapeHtml(e.arrName || '')}`)
          .addTo(state.tripMapLayer);
      }
    });

    if (dayPoints.length > 1) {
      L.polyline(dayPoints, { color, weight: 2.5, opacity: 0.7 }).addTo(state.tripMapLayer);
    }
    if (hasAny) {
      const item = document.createElement('div');
      item.className = 'legend-item';
      item.innerHTML = `<span class="legend-dot" style="background:${color}"></span>Day ${i + 1} · ${formatDateShort(date)}`;
      legend.appendChild(item);
    }
  });

  if (allPoints.length) {
    state.tripMap.fitBounds(allPoints, { padding: [30, 30], maxZoom: 14 });
  } else {
    state.tripMap.setView([20, 0], 2);
  }
}

/* =========================================================
   Summary view
   ========================================================= */
function renderSummaryView() {
  const t = state.trip;
  $('#inputTripName').value = t.tripName || '';
  $('#inputCurrency').value = t.currency || '$';
  $('#inputStartDate').value = t.startDate || '';
  $('#inputEndDate').value = t.endDate || '';

  const days = getDayList();
  const box = $('#costBreakdown');
  if (!days.length) {
    box.innerHTML = '<p class="panel-note">No days yet.</p>';
  } else {
    let html = '';
    days.forEach((date, i) => {
      html += `<div class="cost-row"><span>Day ${i + 1} · ${formatDateShort(date)}</span><span class="amount">${money(dayTotalCost(date), t.currency)}</span></div>`;
    });
    html += `<div class="cost-row cost-total"><span>Trip total</span><span class="amount">${money(tripTotalCost(), t.currency)}</span></div>`;
    box.innerHTML = html;
  }
}

function bindSummaryInputs() {
  const onChange = () => {
    state.trip.tripName = $('#inputTripName').value.trim() || 'Trip';
    state.trip.currency = $('#inputCurrency').value.trim() || '$';
    state.trip.startDate = $('#inputStartDate').value || state.trip.startDate;
    state.trip.endDate = $('#inputEndDate').value || state.trip.endDate;
    saveTrip();
    renderHeader();
    renderDaySelectors();
    renderItineraryView();
    renderSummaryView();
    if (state.mapsInited.trip) updateTripMap();
  };
  ['inputTripName', 'inputCurrency', 'inputStartDate', 'inputEndDate'].forEach((id) => {
    $('#' + id).addEventListener('change', onChange);
  });
}

/* =========================================================
   Tabs
   ========================================================= */
function switchView(name) {
  $$('.view').forEach((v) => v.classList.remove('is-active'));
  $$('.tab-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.view === name));
  $('#view-' + name).classList.add('is-active');

  if (name === 'daymap') {
    if (!state.mapsInited.day) initDayMap();
    setTimeout(() => { state.dayMap.invalidateSize(); updateDayMap(); }, 50);
  }
  if (name === 'tripmap') {
    if (!state.mapsInited.trip) initTripMap();
    setTimeout(() => { state.tripMap.invalidateSize(); updateTripMap(); }, 50);
  }
  if (name === 'summary') renderSummaryView();
}

function bindTabs() {
  $$('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
}

/* =========================================================
   Event modal
   ========================================================= */
function populateCategorySelect() {
  const sel = $('#eventCategory');
  sel.innerHTML = Object.entries(CATEGORIES)
    .map(([key, c]) => `<option value="${key}">${c.icon} ${c.label}</option>`)
    .join('');
}

function openModal(eventId) {
  state.editingId = eventId || null;
  const form = $('#eventForm');
  form.reset();
  $('#geocodeResults').innerHTML = '';
  $('#arrivalFields').classList.add('is-hidden');
  $('#hasArrival').checked = false;
  $('#arrTargetLabel').classList.add('is-hidden');
  form.locateTarget.value = 'dep';

  if (eventId) {
    const e = state.trip.events.find((x) => x.id === eventId);
    $('#modalTitle').textContent = 'Edit event';
    $('#deleteEventBtn').classList.remove('is-hidden');
    $('#eventId').value = e.id;
    $('#eventName').value = e.name || '';
    $('#eventCategory').value = e.category || 'other';
    $('#eventDate').value = e.date || state.selectedDate;
    $('#eventStart').value = e.startTime || '';
    $('#eventEnd').value = e.endTime || '';
    $('#depName').value = e.depName || '';
    $('#depLat').value = e.depLat ?? '';
    $('#depLon').value = e.depLon ?? '';
    $('#eventCost').value = e.cost ?? '';
    $('#eventAttire').value = e.attire || '';
    $('#eventNotes').value = e.notes || '';
    const isTransfer = e.arrName && (e.arrLat !== e.depLat || e.arrLon !== e.depLon);
    if (isTransfer) {
      $('#hasArrival').checked = true;
      $('#arrivalFields').classList.remove('is-hidden');
      $('#arrTargetLabel').classList.remove('is-hidden');
      $('#arrName').value = e.arrName || '';
      $('#arrLat').value = e.arrLat ?? '';
      $('#arrLon').value = e.arrLon ?? '';
    }
  } else {
    $('#modalTitle').textContent = 'Add event';
    $('#deleteEventBtn').classList.add('is-hidden');
    $('#eventId').value = '';
    $('#eventDate').value = state.selectedDate || todayLocalISO();
    $('#eventCategory').value = 'activity';
  }

  $('#eventModal').classList.remove('is-hidden');
  setTimeout(initOrResetPickerMap, 50);
}

function closeModal() {
  $('#eventModal').classList.add('is-hidden');
}

function initOrResetPickerMap() {
  if (!state.pickerMap) {
    state.pickerMap = L.map('pickerMap', { scrollWheelZoom: false }).setView([35.68, 139.76], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
    }).addTo(state.pickerMap);
    state.pickerMap.on('click', (ev) => {
      const target = $('input[name="locateTarget"]:checked').value;
      setPickerPoint(target, ev.latlng.lat, ev.latlng.lng);
    });
  }
  state.pickerMap.invalidateSize();

  [state.pickerMarkers.dep, state.pickerMarkers.arr].forEach((m) => { if (m) state.pickerMap.removeLayer(m); });
  state.pickerMarkers.dep = null;
  state.pickerMarkers.arr = null;

  const depLat = parseFloat($('#depLat').value), depLon = parseFloat($('#depLon').value);
  const arrLat = parseFloat($('#arrLat').value), arrLon = parseFloat($('#arrLon').value);
  if (isFinite(depLat) && isFinite(depLon)) placePickerMarker('dep', depLat, depLon);
  if (isFinite(arrLat) && isFinite(arrLon)) placePickerMarker('arr', arrLat, arrLon);

  const pts = [state.pickerMarkers.dep, state.pickerMarkers.arr].filter(Boolean).map((m) => m.getLatLng());
  if (pts.length) state.pickerMap.fitBounds(pts.length > 1 ? pts : [pts[0]], { maxZoom: 12, padding: [20, 20] });
}

function placePickerMarker(target, lat, lon) {
  const color = target === 'dep' ? '#3B6FB6' : '#B85C3E';
  if (state.pickerMarkers[target]) state.pickerMap.removeLayer(state.pickerMarkers[target]);
  const icon = L.divIcon({ className: 'custom-pin', html: `<div class="pin-dot" style="background:${color}"></div>`, iconSize: [16, 16], iconAnchor: [8, 8] });
  state.pickerMarkers[target] = L.marker([lat, lon], { icon }).addTo(state.pickerMap);
}

function setPickerPoint(target, lat, lon) {
  placePickerMarker(target, lat, lon);
  if (target === 'dep') {
    $('#depLat').value = lat.toFixed(5);
    $('#depLon').value = lon.toFixed(5);
  } else {
    $('#arrLat').value = lat.toFixed(5);
    $('#arrLon').value = lon.toFixed(5);
  }
}

function bindArrivalToggle() {
  $('#hasArrival').addEventListener('change', (e) => {
    const on = e.target.checked;
    $('#arrivalFields').classList.toggle('is-hidden', !on);
    $('#arrTargetLabel').classList.toggle('is-hidden', !on);
    if (!on) $('input[name="locateTarget"][value="dep"]').checked = true;
  });
}

async function runGeocodeSearch() {
  const q = $('#geocodeQuery').value.trim();
  const list = $('#geocodeResults');
  if (!q) return;
  list.innerHTML = '<li>Searching…</li>';
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}`);
    const results = await res.json();
    if (!results.length) { list.innerHTML = '<li>No matches found</li>'; return; }
    list.innerHTML = '';
    results.forEach((r) => {
      const li = document.createElement('li');
      li.textContent = r.display_name;
      li.addEventListener('click', () => {
        const target = $('input[name="locateTarget"]:checked').value;
        const lat = parseFloat(r.lat), lon = parseFloat(r.lon);
        const shortName = r.display_name.split(',')[0];
        if (target === 'dep') { $('#depName').value = shortName; }
        else { $('#arrName').value = shortName; }
        setPickerPoint(target, lat, lon);
        if (state.pickerMap) state.pickerMap.setView([lat, lon], 14);
        list.innerHTML = '';
        $('#geocodeQuery').value = '';
      });
      list.appendChild(li);
    });
  } catch (err) {
    list.innerHTML = '<li>Search needs an internet connection.</li>';
  }
}

function bindGeocode() {
  $('#geocodeBtn').addEventListener('click', runGeocodeSearch);
  $('#geocodeQuery').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); runGeocodeSearch(); }
  });
}

function handleFormSubmit(ev) {
  ev.preventDefault();
  const hasArrival = $('#hasArrival').checked;
  const depName = $('#depName').value.trim();
  const depLat = $('#depLat').value === '' ? null : parseFloat($('#depLat').value);
  const depLon = $('#depLon').value === '' ? null : parseFloat($('#depLon').value);

  const event = {
    id: $('#eventId').value || uid(),
    name: $('#eventName').value.trim() || 'Untitled event',
    category: $('#eventCategory').value,
    date: $('#eventDate').value || todayLocalISO(),
    startTime: $('#eventStart').value,
    endTime: $('#eventEnd').value,
    depName, depLat, depLon,
    arrName: hasArrival ? ($('#arrName').value.trim() || depName) : depName,
    arrLat: hasArrival && $('#arrLat').value !== '' ? parseFloat($('#arrLat').value) : depLat,
    arrLon: hasArrival && $('#arrLon').value !== '' ? parseFloat($('#arrLon').value) : depLon,
    cost: $('#eventCost').value === '' ? 0 : parseFloat($('#eventCost').value),
    attire: $('#eventAttire').value.trim(),
    notes: $('#eventNotes').value.trim(),
  };

  const idx = state.trip.events.findIndex((x) => x.id === event.id);
  if (idx >= 0) state.trip.events[idx] = event; else state.trip.events.push(event);

  extendTripRangeIfNeeded(event.date);
  saveTrip();
  closeModal();
  refreshAll();
}

function extendTripRangeIfNeeded(date) {
  const t = state.trip;
  if (!t.startDate || date < t.startDate) t.startDate = date;
  if (!t.endDate || date > t.endDate) t.endDate = date;
}

function handleDelete() {
  const id = $('#eventId').value;
  if (!id) return;
  if (!confirm('Delete this event?')) return;
  state.trip.events = state.trip.events.filter((x) => x.id !== id);
  saveTrip();
  closeModal();
  refreshAll();
}

/* =========================================================
   Import / export / clear / print
   ========================================================= */
function exportTrip() {
  const blob = new Blob([JSON.stringify(state.trip, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const slug = (state.trip.tripName || 'trip').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  a.href = url;
  a.download = `${slug || 'trip'}-itinerary.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importTripFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.events)) throw new Error('Missing events array');
      state.trip = {
        tripName: data.tripName || 'Imported trip',
        currency: data.currency || '$',
        startDate: data.startDate || todayLocalISO(),
        endDate: data.endDate || todayLocalISO(),
        events: data.events,
      };
      saveTrip();
      refreshAll();
      alert('Itinerary imported.');
    } catch (e) {
      alert('That file could not be read as a trip itinerary JSON.');
    }
  };
  reader.readAsText(file);
}

function clearAllData() {
  if (!confirm('This clears all events and trip details from this browser. Export a backup first if you want to keep them. Continue?')) return;
  state.trip = emptyTrip();
  saveTrip();
  refreshAll();
}

function buildPrintView() {
  const t = state.trip;
  const days = getDayList();
  let html = `<h1>${escapeHtml(t.tripName)}</h1>`;
  html += `<div class="print-sub">${days.length ? formatDateLong(days[0]) + ' – ' + formatDateLong(days[days.length - 1]) : ''} · Total ${money(tripTotalCost(), t.currency)}</div>`;

  days.forEach((date, i) => {
    const events = sortedEventsForDay(date);
    html += `<div class="print-day"><h2>Day ${i + 1} — ${formatDateLong(date)} · ${money(dayTotalCost(date), t.currency)}</h2>`;
    if (!events.length) html += '<div class="print-event">Nothing planned.</div>';
    events.forEach((e) => {
      const cat = CATEGORIES[e.category] || CATEGORIES.other;
      const isTransfer = e.arrName && e.arrName !== e.depName;
      const loc = isTransfer ? `${e.depName || ''} to ${e.arrName || ''}` : (e.depName || '');
      const time = e.startTime ? formatTime(e.startTime) + (e.endTime ? ' – ' + formatTime(e.endTime) : '') : 'Anytime';
      html += `<div class="print-event">
        <span class="pe-title">${cat.icon} ${escapeHtml(e.name)}</span> —
        <span class="pe-meta">${time} · ${escapeHtml(loc)}${e.cost ? ' · ' + money(e.cost, t.currency) : ''}${e.attire ? ' · Attire: ' + escapeHtml(e.attire) : ''}</span>
        ${e.notes ? `<div class="pe-meta">${escapeHtml(e.notes)}</div>` : ''}
      </div>`;
    });
    html += '</div>';
  });
  $('#printView').innerHTML = html;
}

/* =========================================================
   Theme
   ========================================================= */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved) { applyTheme(saved); return; }
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(prefersDark ? 'dark' : 'light');
}

function bindThemeToggle() {
  $('#themeToggle').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    applyTheme(cur === 'dark' ? 'light' : 'dark');
  });
}

/* =========================================================
   PWA install prompt
   ========================================================= */
let deferredInstallPrompt = null;
function bindInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    $('#installBtn').hidden = false;
  });
  $('#installBtn').addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    $('#installBtn').hidden = true;
  });
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
}

/* =========================================================
   Refresh everything (after data changes)
   ========================================================= */
function refreshAll() {
  renderHeader();
  renderDaySelectors();
  renderItineraryView();
  renderSummaryView();
  if (state.mapsInited.day) updateDayMap();
  if (state.mapsInited.trip) updateTripMap();
}

/* =========================================================
   Init
   ========================================================= */
function init() {
  initTheme();
  state.trip = loadTrip();
  state.selectedDate = getDayList()[0] || todayLocalISO();

  populateCategorySelect();
  bindTabs();
  bindThemeToggle();
  bindSummaryInputs();
  bindArrivalToggle();
  bindGeocode();
  bindInstall();

  $('#addEventBtn').addEventListener('click', () => openModal(null));
  $('#closeModalBtn').addEventListener('click', closeModal);
  $('#cancelModalBtn').addEventListener('click', closeModal);
  $('#eventModal').addEventListener('click', (e) => { if (e.target.id === 'eventModal') closeModal(); });
  $('#eventForm').addEventListener('submit', handleFormSubmit);
  $('#deleteEventBtn').addEventListener('click', handleDelete);

  $('#exportBtn').addEventListener('click', exportTrip);
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', (e) => {
    if (e.target.files[0]) importTripFile(e.target.files[0]);
    e.target.value = '';
  });
  $('#printBtn').addEventListener('click', () => { buildPrintView(); window.print(); });
  $('#clearBtn').addEventListener('click', clearAllData);

  refreshAll();
  registerServiceWorker();
}

document.addEventListener('DOMContentLoaded', init);
