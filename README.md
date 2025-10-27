# New Vision Windows – Kiosk Quote App

This is a single-page kiosk experience that walks showroom visitors through an instant whole-home window replacement quote. The experience is optimized for a 1080×1920 portrait display with oversized tap targets, high-contrast typography, and sticky call-to-action controls.

## Features

- Animated attract screen with hero imagery and “What’s included?” modal.
- Address capture with autocomplete suggestions and optional ZIP-only entry.
- Simulated analysis step with progress indicator and animated status list.
- Quote summary with itemized window counts, pricing multipliers, and CTA cluster.
- Contact step with consent gate, QR confirmation, and idle reset to the intro screen after 30 seconds of inactivity.

## Getting Started

No build step is required. Open `index.html` directly in any modern browser, or serve the project locally:

```bash
npx serve .
```

The kiosk experience will load at `http://localhost:3000` (port may vary). All data sources are mocked so the flow works fully offline.
