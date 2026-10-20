# Trip Itinerary

A single-page, no-build travel itinerary app. Add events (flights, hotels,
food, activities, transport), see them grouped by day, and view them on a
map — either one day at a time or your whole trip at once.

[TripPlan](https://dafioram.github.io/TripPlan/)

## Features

- **Itinerary view** — events grouped by day, in the order they actually happen, with cost, attire and duration on each card. Multi-day events (hotel stays, overnight flights) show a "Staying" / "Arrives" / "Check-out" line on the later days.
- **Time zones** — every start and end time is stored in the zone where it happens (see below), and you can switch the whole itinerary to show local times or any one zone, such as your home time.
- **Day map** — every stop for the selected day, connected in the order the day happens (a flight naturally shows as its departure and arrival points).
- **Trip map** — every location across the whole trip, color-coded by day.
- **Summary** — trip name/dates/currency, a per-day and total cost breakdown, import/export, print, and install.
- **Cost totals** — automatic per-day and trip-wide totals.
- **Works offline once loaded** — installable as an app (PWA); your data is saved in the browser automatically.
- **Import / export JSON** — back up your itinerary or move it to another device/browser.
- **Calendar export (.ics)** — add the whole trip to Google Calendar, Apple Calendar or Outlook, with correct times in any zone.
- **Print-friendly view** — a clean, paper-ready copy of the full itinerary.
- **Dark mode.**

Flights and transfers are just events where the arrival location differs
from the departure location — there's no separate "flight" data type needed.

## Time zones

Each event has a **start** (date, time, zone) and an **end** (date, time,
zone). Times are entered as they'd appear on a ticket or booking, in the local
time where they happen. For example, a 9:00 PM departure from New York is entered as
`9:00 PM America/New_York`, and its arrival as `1:05 AM Asia/Tokyo`, two days later.

- **Zones fill in automatically** from the location: pick a departure point
  and the start zone is set from it; pick an arrival point and the end zone
  follows. You can always override either.
- **The end date takes care of itself**: if the end time would fall before
  the start, it rolls to the next day (or the one after, for long eastbound
  flights). Once you set the end date yourself, it's left alone.
- **The form shows each time in the other zones** that matter (the other
  end of the trip, and your home zone), plus the duration, and warns you
  if an event ends before it starts.
- **"Times shown in"** on the itinerary switches the view between local
  times (default) and any single zone. Times that land on a different
  calendar day than the one they're listed under get a `+1` / `−1` marker.
- Your **home time zone** is set in Summary. It's the default for events
  without a location.
- Trips that never leave one zone show plain times without zone labels.

Itineraries saved before time zones were added are upgraded on load. Each
event gets a zone from its coordinates, or your home zone if it has none, and
overnight events get the right end date.

## Deploying to GitHub Pages

1. Create a new GitHub repository and add all the files in this folder to it
   (`index.html`, `style.css`, `app.js`, `manifest.json`, `sw.js`, `icons/`, `vendor/`).
2. Push to GitHub.
3. In the repo, go to **Settings → Pages**.
4. Under "Build and deployment", set **Source** to "Deploy from a branch",
   pick your default branch (e.g. `main`) and folder `/ (root)`, then save.
4. GitHub will give you a URL like `https://your-username.github.io/your-repo/`.
   That's your live app.

No build step, bundler, or server is required — it's plain HTML/CSS/JS.

When you deploy changes, bump `VERSION` at the top of `sw.js`. Installed
copies then fetch the new files and show a "new version is ready — Reload"
prompt.

## Installing (PWA)

- **Android / desktop Chrome & Edge:** use the **Install app** button in
  Summary (or the browser's install icon). Long-press the home-screen icon
  for an "Add event" shortcut.
- **iPhone / iPad:** open the site in Safari, tap **Share → Add to Home
  Screen**. (The Install button explains this on iOS.)

Once installed, the whole app works offline: the app files, the Leaflet map
library and the time zone lookup are all bundled in `vendor/`. Map tiles you've already
viewed are cached too, so the area around your hotel stays visible without a
connection. The app also asks the browser to keep its storage persistent,
so your itinerary isn't cleared to free up space.

## Running it locally

Opening `index.html` directly by double-clicking it works for basic use, but
the service worker (offline support) only activates when served over
`http://` or `https://`. To test that locally, run a tiny local server from
this folder, e.g.:

```
python3 -m http.server 8080
```

then visit `http://localhost:8080`.

## Notes

- New map areas (OpenStreetMap tiles) and the place search box need an
  internet connection. Everything else works offline once the app has been
  loaded once.
- Data is stored in this browser's `localStorage` only — it isn't synced
  anywhere. Use **Export JSON** regularly as a backup, and **Import JSON**
  to bring it into another browser or device.
- Coordinates can be set by clicking the small map in the event form,
  searching for a place by name, or typing latitude/longitude directly.

## Third-party code

- [Leaflet](https://leafletjs.com/) 1.9.4 — BSD-2-Clause (`vendor/leaflet/LICENSE`)
- [tz-lookup](https://github.com/darkskyapp/tz-lookup) 6.1.25 — CC0 (`vendor/tz-lookup/LICENSE`)
