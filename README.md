# New Vision Windows – Kiosk Quote App

This project powers the New Vision Windows interactive kiosk. Visitors can enter an address, review how map and imagery data are used to assess their home, and receive an instant replacement quote along with follow-up options.

## What’s Included

- Intro attract loop with hero imagery and modal explainer
- Address capture with Google Places autocomplete, ZIP fallback, and live map preview
- Real-time analysis step that pulls Street View imagery and New Jersey housing data for pricing
- Quote summary with dynamically generated window mix, price range, and CTAs
- Contact collection with consent gating, idle reset, and confirmation state

## Prerequisites

The kiosk now calls live services to avoid stubbed data. Create a `.env` file (see `.env.example`) and provide the following key:

- `GOOGLE_MAPS_API_KEY` – Google Cloud key with Places API, Maps Static API, and Street View Static API enabled.

> **Provided key:** To mirror the showroom setup quickly you can drop `GOOGLE_MAPS_API_KEY=AIzaSyB9HHRSZCKk385rKpI1Kq17QYDpnAMtqhY` into your `.env`. Update the value with your own restricted key before deploying publicly.

> **Tip:** Restrict both keys to your expected origin(s) to prevent unauthorized use.

## Local Development

1. Copy `.env.example` to `.env` and add your API keys.
2. Install dependencies, then start the kiosk server:

   ```bash
   npm install
   node server.js
   ```

3. Visit [http://localhost:4173](http://localhost:4173) in a browser. The server proxies all external requests to avoid CORS issues when running locally.

The experience is optimized for a 1080×1920 portrait display but will scale down responsively for desktop debugging.

## Deployment Notes

- Deploy the Node server alongside the static assets so API keys remain server-side.
- Ensure outbound HTTPS access for Google Maps (Places, Maps Static, Street View) and the public U.S. Census API.
- Idle reset returns the experience to the intro screen after 30 seconds of inactivity to keep the kiosk ready for the next visitor.

## Troubleshooting

- **Autocomplete or imagery fails:** Confirm the Google key is active and the required APIs are enabled. Check the server logs for Google error payloads.
- **Housing insights missing:** The kiosk uses the [U.S. Census ACS 5-year API](https://www.census.gov/data/developers/data-sets/acs-5year.html) for New Jersey ZIP tabulation areas. Confirm the ZIP is valid; if the API is unavailable the experience falls back to statewide norms.
- **Imagery analysis stalled:** The kiosk loads Street View imagery through the local proxy and inspects it with OpenCV.js in the browser. Ensure the Google key has Street View Static API enabled, the kiosk is served from the same origin (so the imagery is CORS-accessible), and the `https://docs.opencv.org/4.x/opencv.js` asset is reachable.

## Data sources & methodology

- **Street imagery:** Google Street View Static API imagery is fetched through the kiosk proxy and analyzed in-browser with OpenCV.js. Detected window rectangles drive the window-type mix, while a grid heuristic cross-checks total counts.
- **New Jersey housing data:** ZIP-level housing characteristics (median year built, room counts, detached vs. attached share, etc.) come from the U.S. Census Bureau ACS 5-year dataset and are specific to New Jersey ZIP Code Tabulation Areas.
- **Pricing model:** The kiosk blends the image-derived window count with Census housing metrics to determine window mix, then applies localized multipliers for coastal/urban New Jersey ZIP codes.
