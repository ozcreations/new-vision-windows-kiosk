# New Vision Windows – Kiosk Quote App

This project powers the New Vision Windows interactive kiosk. Visitors can enter an address, review how map and imagery data are used to assess their home, and receive an instant replacement quote along with follow-up options.

## What’s Included

- Intro attract loop with hero imagery and modal explainer
- Address capture with Google Places autocomplete, ZIP fallback, and live map preview
- Real-time analysis step that pulls Street View imagery and New Jersey housing data for pricing
- Quote summary with dynamically generated window mix, price range, and CTAs
- Contact collection with consent gating, idle reset, and confirmation state

## Prerequisites

The kiosk calls live Google Maps services directly from the browser. Provide a Google Maps JavaScript API key that also has access to the Static Maps and Street View Static APIs:

1. Copy `config.example.js` to `config.js`.
2. Replace the `googleMapsApiKey` value with your key (restrict it to the kiosk domain before deployment).

> **Provided sample key:** `AIzaSyB9HHRSZCKk385rKpI1Kq17QYDpnAMtqhY` mirrors the showroom configuration. Swap in your own restricted key for production use.

## Local Development

Serve the repo as static files so the browser can load `index.html` and companion assets. Any static server works; for example:

```bash
npx serve .
```

Then open the printed localhost URL (defaults to [http://localhost:3000](http://localhost:3000)) in a browser. The experience is optimized for a 1080×1920 portrait display but scales responsively for desktop debugging.

## Deployment Notes

- Host the static files behind HTTPS with the `config.js` file present on the same origin.
- Ensure outbound HTTPS access for Google Maps (Places, Static Maps, Street View) and the U.S. Census ACS API.
- Idle reset returns the experience to the intro screen after 30 seconds of inactivity to keep the kiosk ready for the next visitor.

## Troubleshooting

- **Autocomplete or imagery fails:** Confirm the Google key is active, unrestricted for the current origin, and the required APIs are enabled. Browser devtools will surface any quota or key errors returned by Google.
- **Housing insights missing:** The kiosk uses the [U.S. Census ACS 5-year API](https://www.census.gov/data/developers/data-sets/acs-5year.html) for New Jersey ZIP tabulation areas. Confirm the ZIP is valid; if the API is unavailable the experience falls back to statewide norms.
- **Imagery analysis stalled:** Street View imagery is pulled straight from Google and inspected with OpenCV.js in the browser. Make sure the key has Street View Static API enabled and that you are serving the app over HTTPS so the imagery can be drawn to a canvas for analysis.

## Data sources & methodology

- **Street imagery:** Google Street View Static API imagery is fetched in-browser and analyzed with OpenCV.js. Detected window rectangles drive the window-type mix, while a grid heuristic cross-checks total counts.
- **New Jersey housing data:** ZIP-level housing characteristics (median year built, room counts, detached vs. attached share, etc.) come from the U.S. Census Bureau ACS 5-year dataset and are specific to New Jersey ZIP Code Tabulation Areas.
- **Pricing model:** The kiosk blends the image-derived window count with Census housing metrics to determine window mix, then applies localized multipliers for coastal/urban New Jersey ZIP codes.
