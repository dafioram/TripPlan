# Trip Itinerary

A single-page, no-build travel itinerary app. Add events (flights, hotels,
food, activities, transport), see them grouped by day, and view them on a
map — either one day at a time or your whole trip at once.

[TripPlan](https://dafioram.github.io/TripPlan/)

## Features

- **Itinerary view** — events grouped by day, sorted by time, with cost and attire shown on each card.
- **Day map** — every stop for the selected day, connected in the order the day happens (a flight naturally shows as its departure and arrival points).
- **Trip map** — every location across the whole trip, color-coded by day.
- **Summary** — trip name/dates/currency, a per-day and total cost breakdown, import/export, print, and install.
- **Cost totals** — automatic per-day and trip-wide totals.
- **Works offline once loaded** — installable as an app (PWA); your data is saved in the browser automatically.
- **Import / export JSON** — back up your itinerary or move it to another device/browser.
- **Print-friendly view** — a clean, paper-ready copy of the full itinerary.
- **Dark mode.**

Flights and transfers are just events where the arrival location differs
from the departure location — there's no separate "flight" data type needed.

## Deploying to GitHub Pages

1. Create a new GitHub repository and add all the files in this folder to it
   (`index.html`, `style.css`, `app.js`, `manifest.json`, `sw.js`, `icons/`).
2. Push to GitHub.
3. In the repo, go to **Settings → Pages**.
4. Under "Build and deployment", set **Source** to "Deploy from a branch",
   pick your default branch (e.g. `main`) and folder `/ (root)`, then save.
4. GitHub will give you a URL like `https://your-username.github.io/your-repo/`.
   That's your live app.

No build step, bundler, or server is required — it's plain HTML/CSS/JS.

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

- Map tiles (OpenStreetMap) and the location search box need an internet
  connection. The app shell itself (your saved itinerary, the list view)
  works offline once it's been loaded/installed once.
- Data is stored in this browser's `localStorage` only — it isn't synced
  anywhere. Use **Export JSON** regularly as a backup, and **Import JSON**
  to bring it into another browser or device.
- Coordinates can be set by clicking the small map in the event form,
  searching for a place by name, or typing latitude/longitude directly.
