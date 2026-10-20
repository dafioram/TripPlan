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

// Calendar dates ('YYYY-MM-DD') are handled in UTC so the math is the same no
// matter what time zone the device is in.
function isoToUTCDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function addDays(iso, n) {
  const d = isoToUTCDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromIso, toIso) {
  return Math.round((isoToUTCDate(toIso) - isoToUTCDate(fromIso)) / 86400000);
}

function formatDateLong(iso) {
  if (!iso) return '';
  return isoToUTCDate(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function formatDateShort(iso) {
  return isoToUTCDate(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function formatWeekday(iso) {
  return isoToUTCDate(iso).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' });
}

function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function formatDuration(ms) {
  const mins = Math.round(ms / 60000);
  const h = Math.floor(mins / 60), m = mins % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

/* =========================================================
   Time zones
   Events store wall-clock times (date + HH:MM) plus the IANA zone they
   happen in, e.g. 21:00 America/Los_Angeles → 01:05 (+1) Asia/Tokyo.
   Everything else (sorting, durations, "show in home time") is derived.
   ========================================================= */
const DEVICE_TZ = (() => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; }
})();

const FALLBACK_ZONES = [
  'UTC', 'Pacific/Honolulu', 'America/Anchorage', 'America/Los_Angeles', 'America/Denver',
  'America/Chicago', 'America/New_York', 'America/Sao_Paulo', 'Europe/London', 'Europe/Paris',
  'Europe/Istanbul', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Bangkok', 'Asia/Singapore',
  'Asia/Shanghai', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland',
];

const tzFormatters = new Map();
function tzFormatter(tz) {
  if (!tzFormatters.has(tz)) {
    tzFormatters.set(tz, new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }));
  }
  return tzFormatters.get(tz);
}

function isValidTz(tz) {
  if (!tz || typeof tz !== 'string') return false;
  try { tzFormatter(tz); return true; } catch (e) { return false; }
}

// Wall clock in `tz` at instant `ms` → { date: 'YYYY-MM-DD', time: 'HH:MM' }.
function wallClock(ms, tz) {
  const p = {};
  tzFormatter(tz).formatToParts(new Date(ms)).forEach(({ type, value }) => { p[type] = value; });
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, second: Number(p.second) };
}

function tzOffsetMs(ms, tz) {
  const w = wallClock(ms, tz);
  const [y, mo, d] = w.date.split('-').map(Number);
  const [h, mi] = w.time.split(':').map(Number);
  return Date.UTC(y, mo - 1, d, h, mi, w.second) - Math.floor(ms / 1000) * 1000;
}

// Wall-clock date + time in `tz` → epoch ms. Two passes handle DST edges.
function zonedToEpoch(date, time, tz) {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const asUTC = Date.UTC(y, mo - 1, d, h, mi);
  const guess = asUTC - tzOffsetMs(asUTC, tz);
  return asUTC - tzOffsetMs(guess, tz);
}

// A familiar abbreviation where one exists (PDT, BST, CEST, IST, AEDT…),
// otherwise the city ("Tokyo" reads better than "GMT+9").
const ABBR_LOCALES = ['en-US', 'en-GB', 'en-AU', 'en-IN'];
const abbrFormatters = new Map();
function tzAbbr(ms, tz) {
  for (const locale of ABBR_LOCALES) {
    const key = locale + '|' + tz;
    try {
      if (!abbrFormatters.has(key)) {
        abbrFormatters.set(key, new Intl.DateTimeFormat(locale, { timeZone: tz, timeZoneName: 'short' }));
      }
      const part = abbrFormatters.get(key).formatToParts(new Date(ms)).find((x) => x.type === 'timeZoneName');
      if (part && !/^(GMT|UTC)[+\-−]/.test(part.value)) return part.value;
    } catch (e) { break; }
  }
  return tzCity(tz);
}

function tzOffsetLabel(tz, ms = Date.now()) {
  const mins = Math.round(tzOffsetMs(ms, tz) / 60000);
  const sign = mins < 0 ? '−' : '+';
  const a = Math.abs(mins);
  return `UTC${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}

// 'America/Los_Angeles' → 'Los Angeles'
function tzCity(tz) {
  return String(tz).split('/').pop().replace(/_/g, ' ');
}

function tzFromCoords(lat, lon) {
  if (!hasCoords(lat, lon) || typeof tzlookup !== 'function') return null;
  try {
    const z = tzlookup(Number(lat), Number(lon));
    return isValidTz(z) ? z : null;
  } catch (e) { return null; }
}

let allZonesCache = null;
function allZones() {
  if (!allZonesCache) {
    let list = [];
    try { list = Intl.supportedValuesOf('timeZone'); } catch (e) { list = FALLBACK_ZONES; }
    allZonesCache = list.filter(isValidTz);
    if (!allZonesCache.includes('UTC')) allZonesCache.push('UTC');
  }
  return allZonesCache;
}

let allZoneOptionsHtml = null;
// Fills a <select> with suggested zones first (home, this device, zones the
// trip already uses), then every zone.
function populateTzSelect(sel, value) {
  const suggested = [...new Set([state.trip.homeTz, DEVICE_TZ, ...tripZones(), value].filter(isValidTz))];
  const opt = (z) => `<option value="${escapeHtml(z)}">${escapeHtml(z.replace(/_/g, ' '))} · ${tzOffsetLabel(z)}</option>`;
  if (!allZoneOptionsHtml) allZoneOptionsHtml = allZones().map(opt).join('');
  sel.innerHTML = `<optgroup label="Suggested">${suggested.map(opt).join('')}</optgroup>`
    + `<optgroup label="All time zones">${allZoneOptionsHtml}</optgroup>`;
  sel.value = isValidTz(value) ? value : state.trip.homeTz;
}

function money(amount, symbol) {
  const n = Number(amount) || 0;
  return `${symbol || '$'}${n.toFixed(2)}`;
}

function hasCoords(lat, lon) {
  return lat !== null && lat !== undefined && lat !== '' && !isNaN(lat) &&
         lon !== null && lon !== undefined && lon !== '' && !isNaN(lon);
}

// Flights, trains and transfers have a separate arrival point.
function isTransfer(e) {
  if (typeof e.hasArrival === 'boolean') return e.hasArrival;
  if (e.arrName && e.depName && e.arrName !== e.depName) return true;
  return hasCoords(e.arrLat, e.arrLon) &&
    (Number(e.arrLat) !== Number(e.depLat) || Number(e.arrLon) !== Number(e.depLon));
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
  const d1 = todayLocalISO();
  const d2 = addDays(d1, 1);
  const d3 = addDays(d1, 2);
  const LA = 'America/Los_Angeles', TYO = 'Asia/Tokyo';
  return {
    tripName: 'Tokyo Long Weekend',
    currency: '$',
    homeTz: LA,
    displayTz: 'local',
    startDate: d1,
    endDate: d3,
    events: [
      {
        id: uid(), name: 'Flight to Tokyo (Narita)', category: 'flight',
        date: d1, startTime: '10:15', startTz: LA,
        endDate: d2, endTime: '13:35', endTz: TYO, hasArrival: true,
        depName: 'San Francisco Intl (SFO)', depLat: 37.6213, depLon: -122.3790,
        arrName: 'Narita Airport (NRT)', arrLat: 35.7719, arrLon: 140.3929,
        cost: 780, attire: '', notes: 'Terminal 2, seat 24A. Confirmation ABC123.',
      },
      {
        id: uid(), name: 'Park Hyatt Tokyo', category: 'hotel',
        date: d2, startTime: '16:30', startTz: TYO,
        endDate: d3, endTime: '11:00', endTz: TYO, hasArrival: false,
        depName: 'Park Hyatt Tokyo', depLat: 35.6938, depLon: 139.6897,
        arrName: 'Park Hyatt Tokyo', arrLat: 35.6938, arrLon: 139.6897,
        cost: 420, attire: '', notes: 'Ask for a room on a high floor.',
      },
      {
        id: uid(), name: 'Dinner at Gonpachi Nishiazabu', category: 'food',
        date: d2, startTime: '19:30', startTz: TYO,
        endDate: d2, endTime: '21:00', endTz: TYO, hasArrival: false,
        depName: 'Gonpachi Nishiazabu', depLat: 35.6586, depLon: 139.7280,
        arrName: 'Gonpachi Nishiazabu', arrLat: 35.6586, arrLon: 139.7280,
        cost: 90, attire: 'Smart casual', notes: 'Reservation under trip name.',
      },
      {
        id: uid(), name: 'Shibuya Sky observation deck', category: 'activity',
        date: d3, startTime: '10:00', startTz: TYO,
        endDate: d3, endTime: '12:00', endTz: TYO, hasArrival: false,
        depName: 'Shibuya Sky', depLat: 35.6595, depLon: 139.7005,
        arrName: 'Shibuya Sky', arrLat: 35.6595, arrLon: 139.7005,
        cost: 22, attire: '', notes: 'Book timed-entry tickets in advance.',
      },
      {
        id: uid(), name: 'Flight home (Haneda)', category: 'flight',
        date: d3, startTime: '18:00', startTz: TYO,
        endDate: d3, endTime: '11:50', endTz: LA, hasArrival: true,
        depName: 'Haneda Airport (HND)', depLat: 35.5494, depLon: 139.7798,
        arrName: 'San Francisco Intl (SFO)', arrLat: 37.6213, arrLon: -122.3790,
        cost: 780, attire: '', notes: 'Lands "before" it leaves — you cross the date line.',
      },
    ],
  };
}

function emptyTrip() {
  const t = todayLocalISO();
  return { tripName: 'New Trip', currency: '$', homeTz: DEVICE_TZ, displayTz: 'local', startDate: t, endDate: t, events: [] };
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
  form: { endDateTouched: false, lastStartDate: null },
};

function loadTrip() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.events)) return normalizeTrip(parsed);
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

// Fills in fields added after v1 so older saves and imports keep working.
// Events saved before time zones existed get a zone from their location
// (falling back to the home zone), and overnight events get an end date.
function normalizeTrip(t) {
  const trip = {
    tripName: t.tripName || 'Trip',
    currency: t.currency || '$',
    homeTz: isValidTz(t.homeTz) ? t.homeTz : DEVICE_TZ,
    displayTz: t.displayTz === 'local' || isValidTz(t.displayTz) ? t.displayTz : 'local',
    startDate: t.startDate || todayLocalISO(),
    endDate: t.endDate || t.startDate || todayLocalISO(),
    events: [],
  };
  if (trip.endDate < trip.startDate) [trip.startDate, trip.endDate] = [trip.endDate, trip.startDate];
  trip.events = (t.events || []).filter((e) => e && e.date).map((e) => normalizeEvent(e, trip));
  return trip;
}

function normalizeEvent(raw, trip) {
  const e = { ...raw };
  if (!e.id) e.id = uid();
  if (!CATEGORIES[e.category]) e.category = 'other';
  if (typeof e.hasArrival !== 'boolean') e.hasArrival = isTransfer(e);
  if (!isValidTz(e.startTz)) e.startTz = tzFromCoords(e.depLat, e.depLon) || trip.homeTz;
  if (!isValidTz(e.endTz)) e.endTz = (e.hasArrival && tzFromCoords(e.arrLat, e.arrLon)) || e.startTz;
  if (!e.endDate || e.endDate < e.date) {
    e.endDate = e.date;
    if (e.startTime && e.endTime) {
      for (let i = 0; i < 2 && endEpoch(e) < startEpoch(e); i++) e.endDate = addDays(e.endDate, 1);
    }
  }
  return e;
}

/* =========================================================
   Event time helpers
   ========================================================= */
function startEpoch(e) {
  return e.startTime ? zonedToEpoch(e.date, e.startTime, e.startTz || state.trip.homeTz) : null;
}

function endEpoch(e) {
  return e.endTime ? zonedToEpoch(e.endDate || e.date, e.endTime, e.endTz || e.startTz || state.trip.homeTz) : null;
}

// Zones the trip's timed events happen in.
function tripZones() {
  const zones = new Set();
  (state.trip?.events || []).forEach((e) => {
    if (e.startTime && e.startTz) zones.add(e.startTz);
    if (e.endTime && e.endTz) zones.add(e.endTz);
  });
  return zones;
}

// Abbreviations only add noise on a trip that stays in one zone.
function showTzLabels() {
  return state.trip.displayTz !== 'local' || tripZones().size > 1;
}

// How one end of an event reads in the current display mode, relative to
// the itinerary day it's listed under: { time, abbr, shift }.
function timeView(e, which, groupDay) {
  const time = which === 'start' ? e.startTime : e.endTime;
  if (!time) return null;
  const date = which === 'start' ? e.date : (e.endDate || e.date);
  const ms = which === 'start' ? startEpoch(e) : endEpoch(e);
  const zone = state.trip.displayTz === 'local'
    ? (which === 'start' ? e.startTz : e.endTz) || state.trip.homeTz
    : state.trip.displayTz;
  const wall = state.trip.displayTz === 'local' ? { date, time } : wallClock(ms, zone);
  return { time: formatTime(wall.time), abbr: tzAbbr(ms, zone), shift: daysBetween(groupDay, wall.date) };
}

function timeViewHtml(v, withAbbr = showTzLabels()) {
  if (!v) return '';
  const shift = v.shift ? `<sup class="day-shift">${v.shift > 0 ? '+' : '−'}${Math.abs(v.shift)}</sup>` : '';
  return `<span class="t">${v.time}${shift}</span>${withAbbr ? `<span class="tz">${escapeHtml(v.abbr)}</span>` : ''}`;
}

function timeViewText(v) {
  if (!v) return '';
  const shift = v.shift ? ` (${v.shift > 0 ? '+' : '−'}${Math.abs(v.shift)}d)` : '';
  return `${v.time}${showTzLabels() ? ' ' + v.abbr : ''}${shift}`;
}

/* =========================================================
   Day list / cost helpers
   ========================================================= */
function getDayList() {
  const t = state.trip;
  const dates = new Set();
  const addRange = (from, to) => {
    let cur = from;
    for (let guard = 0; cur <= to && guard < 366; guard++) {
      dates.add(cur);
      cur = addDays(cur, 1);
    }
  };
  if (t.startDate && t.endDate) addRange(t.startDate, t.endDate);
  t.events.forEach((e) => { if (e.date) addRange(e.date, e.endDate && e.endDate > e.date ? e.endDate : e.date); });
  return Array.from(dates).sort();
}

function eventsForDay(date) {
  return state.trip.events.filter((e) => e.date === date);
}

// Everything that shows up on a day, in the order it happens: events that
// start that day, plus "continuing" rows for multi-day events (a hotel stay,
// an overnight flight landing) that started earlier.
function dayTimeline(date) {
  const items = [];
  state.trip.events.forEach((e) => {
    if (e.date === date) {
      items.push({ kind: 'event', e, key: e.startTime ? startEpoch(e) : Infinity });
    } else if (e.date < date && (e.endDate || e.date) >= date) {
      const endsToday = e.endDate === date;
      items.push({ kind: 'cont', e, endsToday, key: endsToday && e.endTime ? endEpoch(e) : -Infinity });
    }
  });
  return items.sort((a, b) => (a.key - b.key) || a.e.name.localeCompare(b.e.name));
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
   Rendering — "times shown in" switcher
   ========================================================= */
function renderTzDisplaySelect() {
  const t = state.trip;
  const zones = [...new Set([t.homeTz, ...tripZones()])];
  const row = $('#tzDisplayRow');
  row.hidden = zones.length < 2 && t.displayTz === 'local';
  if (row.hidden) return;

  if (t.displayTz !== 'local' && !zones.includes(t.displayTz)) zones.push(t.displayTz);
  if (!zones.includes(DEVICE_TZ)) zones.push(DEVICE_TZ);
  const label = (z) => {
    const tags = [z === t.homeTz && 'home', z === DEVICE_TZ && 'this device'].filter(Boolean);
    return `${tzCity(z)} time${tags.length ? ` (${tags.join(', ')})` : ''}`;
  };
  const sel = $('#tzDisplaySelect');
  sel.innerHTML = `<option value="local">Local time at each event</option>`
    + zones.map((z) => `<option value="${escapeHtml(z)}">${escapeHtml(label(z))}</option>`).join('');
  sel.value = t.displayTz;
}

/* =========================================================
   Rendering — itinerary (list) view
   ========================================================= */
function renderItineraryView() {
  renderTzDisplaySelect();
  const container = $('#dayContent');
  const date = state.selectedDate;
  if (!date) {
    container.innerHTML = '<div class="empty-state"><span class="empty-emoji">🧳</span>No days yet. Add an event to begin.</div>';
    return;
  }
  const items = dayTimeline(date);

  let html = `<div class="day-heading"><h2>${formatDateLong(date)}</h2><span class="day-total">${money(dayTotalCost(date), state.trip.currency)}</span></div>`;

  if (!items.length) {
    html += '<div class="empty-state"><span class="empty-emoji">🌤️</span>Nothing planned yet for this day.</div>';
  } else {
    items.forEach((it) => { html += it.kind === 'event' ? eventCardHtml(it.e, date) : continuingRowHtml(it, date); });
  }
  container.innerHTML = html;

  $$('[data-id]', container).forEach((card) => {
    card.addEventListener('click', () => openModal(card.dataset.id));
  });
}

function locationLine(e) {
  return isTransfer(e)
    ? `${escapeHtml(e.depName || 'Departure')} → ${escapeHtml(e.arrName || 'Arrival')}`
    : escapeHtml(e.depName || 'No location set');
}

function eventCardHtml(e, groupDay) {
  const cat = CATEGORIES[e.category] || CATEGORIES.other;
  const start = timeView(e, 'start', groupDay);
  const end = timeView(e, 'end', groupDay);
  const timeLine = start
    ? timeViewHtml(start) + (end ? `<span class="sep">–</span>${timeViewHtml(end)}` : '')
    : 'Anytime';

  let meta = '';
  const nights = daysBetween(e.date, e.endDate || e.date);
  if (e.category === 'hotel' && nights > 0) meta += `<span class="chip">🌙 ${nights} night${nights > 1 ? 's' : ''}</span>`;
  else if (start && end) meta += `<span class="chip">⏱ ${formatDuration(endEpoch(e) - startEpoch(e))}</span>`;
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
        <div class="event-location">📍 ${locationLine(e)}</div>
        ${meta ? `<div class="event-meta-row">${meta}</div>` : ''}
        ${e.notes ? `<div class="event-notes">${escapeHtml(e.notes)}</div>` : ''}
      </div>
    </div>`;
}

function continuingLabel(it) {
  const { e, endsToday } = it;
  if (endsToday) return e.category === 'hotel' ? 'Check-out' : isTransfer(e) ? 'Arrives' : 'Ends';
  return e.category === 'hotel' ? 'Staying' : 'Continues';
}

function continuingRowHtml(it, groupDay) {
  const { e, endsToday } = it;
  const cat = CATEGORIES[e.category] || CATEGORIES.other;
  const end = endsToday ? timeView(e, 'end', groupDay) : null;
  const where = endsToday && isTransfer(e) ? e.arrName : e.depName;
  const place = where && where !== e.name ? where : '';
  return `
    <div class="event-cont" data-id="${e.id}">
      <span class="cat-dot cat-dot-small" style="background:${cat.color}">${cat.icon}</span>
      <span class="cont-text">
        <b>${continuingLabel(it)}${end ? ' ' + escapeHtml(timeViewText(end)) : ''}</b>
        · ${escapeHtml(e.name)}${place ? ` <span class="cont-place">· ${escapeHtml(place)}</span>` : ''}
      </span>
    </div>`;
}

/* =========================================================
   Maps — shared
   ========================================================= */
function addBaseTiles(map) {
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);
}

function pinIcon(color, emoji) {
  return L.divIcon({
    className: 'custom-pin',
    html: `<div class="pin-inner" style="background:${color}">${emoji}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

/* =========================================================
   Maps — day map
   ========================================================= */
function initDayMap() {
  state.dayMap = L.map('dayMap', { scrollWheelZoom: false });
  addBaseTiles(state.dayMap);
  state.dayMapLayer = L.layerGroup().addTo(state.dayMap);
  state.mapsInited.day = true;
  updateDayMap();
}

// Stops for a day in the order they happen. A hotel you're still staying at
// is where the day begins; a flight that lands today contributes its arrival.
function dayStops(date) {
  const stops = [];
  const add = (lat, lon, e, name, time) => {
    if (!hasCoords(lat, lon)) return;
    const p = [Number(lat), Number(lon)];
    const prev = stops[stops.length - 1];
    if (prev && prev.p[0] === p[0] && prev.p[1] === p[1]) return;
    stops.push({ p, e, name, time });
  };
  dayTimeline(date).forEach((it) => {
    const e = it.e;
    if (it.kind === 'event') {
      add(e.depLat, e.depLon, e, e.depName, timeView(e, 'start', date));
      if (isTransfer(e)) add(e.arrLat, e.arrLon, e, e.arrName, timeView(e, 'end', date));
    } else if (isTransfer(e)) {
      if (it.endsToday) add(e.arrLat, e.arrLon, e, e.arrName, timeView(e, 'end', date));
    } else {
      add(e.depLat, e.depLon, e, e.depName, null);
    }
  });
  return stops;
}

function updateDayMap() {
  if (!state.mapsInited.day) return;
  state.dayMapLayer.clearLayers();
  const stops = dayStops(state.selectedDate);
  const points = stops.map((s) => s.p);

  stops.forEach(({ p, e, name, time }) => {
    const cat = CATEGORIES[e.category] || CATEGORIES.other;
    L.marker(p, { icon: pinIcon(cat.color, cat.icon) })
      .bindPopup(`<b>${escapeHtml(e.name)}</b><br>${escapeHtml(name || '')}${time ? '<br>' + escapeHtml(timeViewText(time)) : ''}`)
      .addTo(state.dayMapLayer);
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
  addBaseTiles(state.tripMap);
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
    const dayPoints = [];

    dayTimeline(date).filter((it) => it.kind === 'event').forEach(({ e }) => {
      const pts = [[e.depLat, e.depLon, e.depName]];
      if (isTransfer(e)) pts.push([e.arrLat, e.arrLon, e.arrName]);
      pts.forEach(([lat, lon, name]) => {
        if (!hasCoords(lat, lon)) return;
        const p = [Number(lat), Number(lon)];
        dayPoints.push(p); allPoints.push(p);
        L.circleMarker(p, { radius: 7, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 })
          .bindPopup(`<b>${escapeHtml(e.name)}</b><br>Day ${i + 1} · ${escapeHtml(name || '')}`)
          .addTo(state.tripMapLayer);
      });
    });

    if (dayPoints.length > 1) {
      L.polyline(dayPoints, { color, weight: 2.5, opacity: 0.7 }).addTo(state.tripMapLayer);
    }
    if (dayPoints.length) {
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
  populateTzSelect($('#inputHomeTz'), t.homeTz);

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
    const t = state.trip;
    t.tripName = $('#inputTripName').value.trim() || 'Trip';
    t.currency = $('#inputCurrency').value.trim() || '$';
    t.startDate = $('#inputStartDate').value || t.startDate;
    t.endDate = $('#inputEndDate').value || t.endDate;
    if (t.endDate < t.startDate) [t.startDate, t.endDate] = [t.endDate, t.startDate];
    if (isValidTz($('#inputHomeTz').value)) t.homeTz = $('#inputHomeTz').value;
    saveTrip();
    refreshAll();
  };
  ['inputTripName', 'inputCurrency', 'inputStartDate', 'inputEndDate', 'inputHomeTz'].forEach((id) => {
    $('#' + id).addEventListener('change', onChange);
  });

  $('#tzDisplaySelect').addEventListener('change', (e) => {
    state.trip.displayTz = e.target.value;
    saveTrip();
    renderItineraryView();
    if (state.mapsInited.day) updateDayMap();
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

function openModal(eventId, { duplicateOf = null } = {}) {
  state.editingId = eventId || null;
  const form = $('#eventForm');
  form.reset();
  $('#geocodeResults').innerHTML = '';
  $('#arrivalFields').classList.add('is-hidden');
  $('#hasArrival').checked = false;
  $('#arrTargetLabel').classList.add('is-hidden');
  $('#startTzSource').textContent = '';
  $('#endTzSource').textContent = '';
  form.locateTarget.value = 'dep';

  const e = eventId
    ? state.trip.events.find((x) => x.id === eventId)
    : duplicateOf;
  const lastTz = state.trip.events.length ? state.trip.events[state.trip.events.length - 1].endTz : null;

  if (e) {
    $('#modalTitle').textContent = eventId ? 'Edit event' : 'Add event';
    $('#deleteEventBtn').classList.toggle('is-hidden', !eventId);
    $('#duplicateEventBtn').classList.toggle('is-hidden', !eventId);
    $('#eventId').value = eventId ? e.id : '';
    $('#eventName').value = e.name || '';
    $('#eventCategory').value = e.category || 'other';
    $('#eventDate').value = e.date || state.selectedDate;
    $('#eventStart').value = e.startTime || '';
    $('#eventEndDate').value = e.endDate || e.date || state.selectedDate;
    $('#eventEnd').value = e.endTime || '';
    populateTzSelect($('#eventStartTz'), e.startTz);
    populateTzSelect($('#eventEndTz'), e.endTz || e.startTz);
    $('#depName').value = e.depName || '';
    $('#depLat').value = e.depLat ?? '';
    $('#depLon').value = e.depLon ?? '';
    $('#eventCost').value = e.cost ?? '';
    $('#eventAttire').value = e.attire || '';
    $('#eventNotes').value = e.notes || '';
    if (isTransfer(e)) {
      $('#hasArrival').checked = true;
      $('#arrivalFields').classList.remove('is-hidden');
      $('#arrTargetLabel').classList.remove('is-hidden');
      $('#arrName').value = e.arrName || '';
      $('#arrLat').value = e.arrLat ?? '';
      $('#arrLon').value = e.arrLon ?? '';
    }
    state.form.endDateTouched = (e.endDate || e.date) !== e.date;
  } else {
    // New events default to the zone the trip was last in, so adding a run
    // of things in the same city doesn't need the zone picked every time.
    const tz = isValidTz(lastTz) ? lastTz : state.trip.homeTz;
    $('#modalTitle').textContent = 'Add event';
    $('#deleteEventBtn').classList.add('is-hidden');
    $('#duplicateEventBtn').classList.add('is-hidden');
    $('#eventId').value = '';
    $('#eventDate').value = state.selectedDate || todayLocalISO();
    $('#eventEndDate').value = $('#eventDate').value;
    $('#eventCategory').value = 'activity';
    populateTzSelect($('#eventStartTz'), tz);
    populateTzSelect($('#eventEndTz'), tz);
    state.form.endDateTouched = false;
  }
  state.form.lastStartDate = $('#eventDate').value;
  updateTimePreview();

  $('#eventModal').classList.remove('is-hidden');
  setTimeout(initOrResetPickerMap, 50);
}

function closeModal() {
  $('#eventModal').classList.add('is-hidden');
}

/* ---------- Start / end times in the form ---------- */
function formTimes() {
  return {
    sd: $('#eventDate').value, st: $('#eventStart').value, stz: $('#eventStartTz').value,
    ed: $('#eventEndDate').value || $('#eventDate').value, et: $('#eventEnd').value, etz: $('#eventEndTz').value,
  };
}

// Keep the end date sensible until the user sets it themselves: same day as
// the start, or the next day when the end time would otherwise come first
// (an overnight flight, a late show).
function autoAdjustEndDate() {
  if (state.form.endDateTouched) return;
  const { sd, st, stz, et, etz } = formTimes();
  if (!sd) return;
  let ed = sd;
  if (st && et) {
    const start = zonedToEpoch(sd, st, stz);
    for (let i = 0; i < 2 && zonedToEpoch(ed, et, etz) < start; i++) ed = addDays(ed, 1);
  }
  $('#eventEndDate').value = ed;
}

function updateTimePreview() {
  const { sd, st, stz, ed, et, etz } = formTimes();
  const box = $('#timePreview');
  const endInput = $('#eventEndDate');
  endInput.setCustomValidity('');
  const lines = [];
  const home = state.trip.homeTz;
  const zones = [...new Set([stz, etz, home])];

  const describe = (label, date, time, tz) => {
    const ms = zonedToEpoch(date, time, tz);
    const here = `${formatWeekday(date)} ${formatTime(time)} ${tzAbbr(ms, tz)}`;
    const elsewhere = zones.filter((z) => z !== tz).map((z) => {
      const w = wallClock(ms, z);
      return `${formatWeekday(w.date)} ${formatTime(w.time)} in ${escapeHtml(tzCity(z))}${z === home ? ' (home)' : ''}`;
    });
    return `<div><b>${label}</b> ${here}${elsewhere.length ? ` <span class="muted">= ${elsewhere.join(' · ')}</span>` : ''}</div>`;
  };

  if (sd && st) lines.push(describe('Starts', sd, st, stz));
  if (ed && et) lines.push(describe('Ends', ed, et, etz));

  if (sd && ed && ed < sd) {
    endInput.setCustomValidity('The end date is before the start date.');
    lines.push('<div class="warn">⚠️ The end date is before the start date.</div>');
  } else if (sd && st && et) {
    const diff = zonedToEpoch(ed, et, etz) - zonedToEpoch(sd, st, stz);
    if (diff < 0) {
      endInput.setCustomValidity('This event ends before it starts. Check the end date or time zone.');
      lines.push('<div class="warn">⚠️ Ends before it starts — check the end date or time zone.</div>');
    } else {
      lines.push(`<div><b>Duration</b> ${formatDuration(diff)}</div>`);
    }
  }
  box.innerHTML = lines.join('');
}

function bindTimeInputs() {
  $('#eventDate').addEventListener('change', () => {
    const sd = $('#eventDate').value;
    // Moving the start date moves a user-set end date by the same amount.
    if (state.form.endDateTouched && sd && state.form.lastStartDate && $('#eventEndDate').value) {
      $('#eventEndDate').value = addDays($('#eventEndDate').value, daysBetween(state.form.lastStartDate, sd));
    }
    state.form.lastStartDate = sd;
    autoAdjustEndDate();
    updateTimePreview();
  });
  $('#eventEndDate').addEventListener('change', () => {
    state.form.endDateTouched = true;
    updateTimePreview();
  });
  ['eventStart', 'eventEnd', 'eventEndTz'].forEach((id) => {
    $('#' + id).addEventListener('change', () => { autoAdjustEndDate(); updateTimePreview(); });
  });
  $('#eventStartTz').addEventListener('change', () => {
    // Without a separate arrival point, start and end share a zone.
    if (!$('#hasArrival').checked) $('#eventEndTz').value = $('#eventStartTz').value;
    $('#startTzSource').textContent = '';
    autoAdjustEndDate();
    updateTimePreview();
  });
}

// Set the zone from a location just picked, so a flight to Tokyo gets Tokyo
// time on its arrival without the user having to know the zone name.
function setTzFromLocation(target) {
  const lat = $(target === 'dep' ? '#depLat' : '#arrLat').value;
  const lon = $(target === 'dep' ? '#depLon' : '#arrLon').value;
  const tz = tzFromCoords(lat, lon);
  if (!tz) return;
  const apply = (selId, noteId) => {
    const sel = $(selId);
    if (![...sel.options].some((o) => o.value === tz)) populateTzSelect(sel, tz);
    if (sel.value !== tz) {
      sel.value = tz;
      $(noteId).textContent = '· set from location';
    }
  };
  if (target === 'dep') {
    apply('#eventStartTz', '#startTzSource');
    if (!$('#hasArrival').checked) apply('#eventEndTz', '#endTzSource');
  } else {
    apply('#eventEndTz', '#endTzSource');
  }
  autoAdjustEndDate();
  updateTimePreview();
}

/* ---------- Location picker ---------- */
function initOrResetPickerMap() {
  if (!state.pickerMap) {
    state.pickerMap = L.map('pickerMap', { scrollWheelZoom: false }).setView([35.68, 139.76], 4);
    addBaseTiles(state.pickerMap);
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
  setTzFromLocation(target);
}

function bindArrivalToggle() {
  $('#hasArrival').addEventListener('change', (e) => {
    const on = e.target.checked;
    $('#arrivalFields').classList.toggle('is-hidden', !on);
    $('#arrTargetLabel').classList.toggle('is-hidden', !on);
    if (!on) {
      $('input[name="locateTarget"][value="dep"]').checked = true;
      $('#eventEndTz').value = $('#eventStartTz').value;
      $('#endTzSource').textContent = '';
      autoAdjustEndDate();
      updateTimePreview();
    } else if ($('#arrLat').value !== '') {
      setTzFromLocation('arr');
    }
  });
  // Typed-in coordinates also drive the time zone.
  ['dep', 'arr'].forEach((target) => {
    [`#${target}Lat`, `#${target}Lon`].forEach((sel) => {
      $(sel).addEventListener('change', () => setTzFromLocation(target));
    });
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

function numOrNull(sel) {
  const v = parseFloat($(sel).value);
  return isFinite(v) ? v : null;
}

function handleFormSubmit(ev) {
  ev.preventDefault();
  const hasArrival = $('#hasArrival').checked;
  const depName = $('#depName').value.trim();
  const depLat = numOrNull('#depLat');
  const depLon = numOrNull('#depLon');
  const date = $('#eventDate').value || todayLocalISO();
  const endDate = $('#eventEndDate').value || date;
  const startTz = $('#eventStartTz').value;

  const event = {
    id: $('#eventId').value || uid(),
    name: $('#eventName').value.trim() || 'Untitled event',
    category: $('#eventCategory').value,
    date,
    startTime: $('#eventStart').value,
    startTz,
    endDate: endDate < date ? date : endDate,
    endTime: $('#eventEnd').value,
    endTz: $('#eventEndTz').value || startTz,
    hasArrival,
    depName, depLat, depLon,
    arrName: hasArrival ? ($('#arrName').value.trim() || depName) : depName,
    arrLat: hasArrival && numOrNull('#arrLat') !== null ? numOrNull('#arrLat') : depLat,
    arrLon: hasArrival && numOrNull('#arrLon') !== null ? numOrNull('#arrLon') : depLon,
    cost: numOrNull('#eventCost') || 0,
    attire: $('#eventAttire').value.trim(),
    notes: $('#eventNotes').value.trim(),
  };

  const idx = state.trip.events.findIndex((x) => x.id === event.id);
  if (idx >= 0) state.trip.events[idx] = event; else state.trip.events.push(event);

  extendTripRangeIfNeeded(event.date);
  extendTripRangeIfNeeded(event.endDate);
  state.selectedDate = event.date;
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

function handleDuplicate() {
  const e = state.trip.events.find((x) => x.id === $('#eventId').value);
  if (!e) return;
  openModal(null, { duplicateOf: { ...e, name: `${e.name} (copy)` } });
}

/* =========================================================
   Import / export / clear / print
   ========================================================= */
function tripSlug() {
  return (state.trip.tripName || 'trip').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'trip';
}

function downloadFile(contents, type, filename) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportTrip() {
  downloadFile(JSON.stringify(state.trip, null, 2), 'application/json', `${tripSlug()}-itinerary.json`);
}

function importTripFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.events)) throw new Error('Missing events array');
      state.trip = normalizeTrip({ ...data, tripName: data.tripName || 'Imported trip' });
      state.selectedDate = null;
      saveTrip();
      refreshAll();
      alert('Itinerary imported.');
    } catch (e) {
      alert('That file could not be read as a trip itinerary JSON.');
    }
  };
  reader.readAsText(file);
}

/* ---------- Calendar (.ics) export ---------- */
function icsEscape(str) {
  return String(str ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function icsUtc(ms) {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// RFC 5545 lines are folded at 75 octets.
function icsFold(line) {
  const bytes = new TextEncoder();
  const out = [];
  let cur = '';
  for (const ch of line) {
    if (bytes.encode(cur + ch).length > (out.length ? 74 : 75)) { out.push(cur); cur = ''; }
    cur += ch;
  }
  out.push(cur);
  return out.join('\r\n ');
}

// Times are written in UTC, so calendar apps show every event at the right
// moment in whatever zone the phone happens to be in.
function exportIcs() {
  const t = state.trip;
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TripPlan//Itinerary//EN', 'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${icsEscape(t.tripName)}`,
  ];
  const stamp = icsUtc(Date.now());
  t.events.forEach((e) => {
    lines.push('BEGIN:VEVENT', `UID:${e.id}@tripplan`, `DTSTAMP:${stamp}`);
    if (e.startTime) {
      const start = startEpoch(e);
      lines.push(`DTSTART:${icsUtc(start)}`);
      const end = endEpoch(e);
      if (end !== null && end >= start) lines.push(`DTEND:${icsUtc(end)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${e.date.replace(/-/g, '')}`);
      lines.push(`DTEND;VALUE=DATE:${addDays(e.endDate || e.date, 1).replace(/-/g, '')}`);
    }
    lines.push(`SUMMARY:${icsEscape(e.name)}`);
    const loc = isTransfer(e) ? `${e.depName || ''} → ${e.arrName || ''}` : e.depName;
    if (loc) lines.push(`LOCATION:${icsEscape(loc)}`);
    if (hasCoords(e.depLat, e.depLon)) lines.push(`GEO:${Number(e.depLat)};${Number(e.depLon)}`);
    const desc = [
      e.cost ? `Cost: ${money(e.cost, t.currency)}` : '',
      e.attire ? `Attire: ${e.attire}` : '',
      e.notes || '',
    ].filter(Boolean).join('\n');
    if (desc) lines.push(`DESCRIPTION:${icsEscape(desc)}`);
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  downloadFile(lines.map(icsFold).join('\r\n') + '\r\n', 'text/calendar', `${tripSlug()}.ics`);
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
  const zoneNote = t.displayTz === 'local' ? 'Local times' : `Times in ${tzCity(t.displayTz)}`;
  let html = `<h1>${escapeHtml(t.tripName)}</h1>`;
  html += `<div class="print-sub">${days.length ? formatDateLong(days[0]) + ' – ' + formatDateLong(days[days.length - 1]) : ''} · Total ${money(tripTotalCost(), t.currency)} · ${escapeHtml(zoneNote)}</div>`;

  days.forEach((date, i) => {
    const items = dayTimeline(date);
    html += `<div class="print-day"><h2>Day ${i + 1} — ${formatDateLong(date)} · ${money(dayTotalCost(date), t.currency)}</h2>`;
    if (!items.length) html += '<div class="print-event">Nothing planned.</div>';
    items.forEach((it) => {
      const e = it.e;
      const cat = CATEGORIES[e.category] || CATEGORIES.other;
      if (it.kind === 'cont') {
        const end = it.endsToday ? timeView(e, 'end', date) : null;
        html += `<div class="print-event pe-cont">${cat.icon} ${continuingLabel(it)}${end ? ' ' + escapeHtml(timeViewText(end)) : ''} — ${escapeHtml(e.name)}</div>`;
        return;
      }
      const start = timeView(e, 'start', date), end = timeView(e, 'end', date);
      const time = start ? timeViewText(start) + (end ? ' – ' + timeViewText(end) : '') : 'Anytime';
      const loc = isTransfer(e) ? `${e.depName || ''} to ${e.arrName || ''}` : (e.depName || '');
      html += `<div class="print-event">
        <span class="pe-title">${cat.icon} ${escapeHtml(e.name)}</span> —
        <span class="pe-meta">${escapeHtml(time)} · ${escapeHtml(loc)}${e.cost ? ' · ' + money(e.cost, t.currency) : ''}${e.attire ? ' · Attire: ' + escapeHtml(e.attire) : ''}</span>
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
  try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* private mode */ }
}

function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch (e) { /* private mode */ }
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
  const days = getDayList();
  state.selectedDate = days.includes(todayLocalISO()) ? todayLocalISO() : (days[0] || todayLocalISO());

  populateCategorySelect();
  bindTabs();
  bindThemeToggle();
  bindSummaryInputs();
  bindTimeInputs();
  bindArrivalToggle();
  bindGeocode();
  bindInstall();

  $('#addEventBtn').addEventListener('click', () => openModal(null));
  $('#closeModalBtn').addEventListener('click', closeModal);
  $('#cancelModalBtn').addEventListener('click', closeModal);
  $('#eventModal').addEventListener('click', (e) => { if (e.target.id === 'eventModal') closeModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#eventModal').classList.contains('is-hidden')) closeModal();
  });
  $('#eventForm').addEventListener('submit', handleFormSubmit);
  $('#deleteEventBtn').addEventListener('click', handleDelete);
  $('#duplicateEventBtn').addEventListener('click', handleDuplicate);

  $('#exportBtn').addEventListener('click', exportTrip);
  $('#icsBtn').addEventListener('click', exportIcs);
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
