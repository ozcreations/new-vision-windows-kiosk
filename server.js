'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ROOT = __dirname;

loadEnv();

const PORT = process.env.PORT || 4173;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .forEach((line) => {
      const [key, ...rest] = line.split('=');
      if (!key) return;
      const value = rest.join('=').trim();
      if (!Object.prototype.hasOwnProperty.call(process.env, key)) {
        process.env[key] = value;
      }
    });
}

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    if (requestUrl.pathname.startsWith('/api/')) {
      await handleApi(requestUrl, req, res);
      return;
    }
    serveStatic(requestUrl.pathname, res);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: 'Unexpected server error' });
  }
});

server.listen(PORT, () => {
  console.log(`New Vision kiosk server running at http://localhost:${PORT}`);
});

function serveStatic(requestPath, res) {
  let relativePath = requestPath || '/';
  if (relativePath === '/' || relativePath.endsWith('/')) {
    relativePath = path.join(relativePath, 'index.html');
  }
  const normalized = path
    .normalize(relativePath)
    .replace(/^([.]+[\/])+/g, '')
    .replace(/^\//, '');
  let filePath = path.resolve(ROOT, normalized);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  fs.createReadStream(filePath)
    .on('error', (error) => {
      console.error(error);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('File read error');
    })
    .pipe(
      res.writeHead(200, {
        'Content-Type': mime,
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
      })
    );
}

async function handleApi(url, req, res) {
  const route = url.pathname.slice('/api/'.length);
  switch (route) {
    case 'autocomplete':
      return handleAutocomplete(url, res);
    case 'place-details':
      return handlePlaceDetails(url, res);
    case 'maps/static':
      return proxyGoogleImage(url, res, 'staticmap');
    case 'maps/streetview':
      return proxyGoogleImage(url, res, 'streetview');
    case 'quote':
      return handleQuote(url, res);
    default:
      sendJson(res, 404, { error: 'Unknown API route' });
  }
}

async function handleAutocomplete(url, res) {
  if (!GOOGLE_MAPS_API_KEY) {
    return sendJson(res, 500, { error: 'Missing GOOGLE_MAPS_API_KEY' });
  }
  const input = url.searchParams.get('input');
  if (!input) {
    return sendJson(res, 400, { error: 'Missing input query' });
  }
  const apiUrl = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
  apiUrl.searchParams.set('input', input);
  apiUrl.searchParams.set('types', 'address');
  apiUrl.searchParams.set('components', 'country:us');
  apiUrl.searchParams.set('key', GOOGLE_MAPS_API_KEY);
  const token = url.searchParams.get('sessionToken');
  if (token) apiUrl.searchParams.set('sessiontoken', token);

  try {
    const data = await fetchJson(apiUrl);
    if (data.status && data.status !== 'OK') {
      if (data.status === 'ZERO_RESULTS') {
        return sendJson(res, 200, { predictions: [] });
      }
      const message = data.error_message || data.status;
      return sendJson(res, 502, { error: `Google Places error: ${message}` });
    }
    return sendJson(res, 200, data);
  } catch (error) {
    console.error(error);
    return sendJson(res, 502, { error: 'Failed to reach Google Places' });
  }
}

async function handlePlaceDetails(url, res) {
  if (!GOOGLE_MAPS_API_KEY) {
    return sendJson(res, 500, { error: 'Missing GOOGLE_MAPS_API_KEY' });
  }
  const placeId = url.searchParams.get('placeId');
  if (!placeId) {
    return sendJson(res, 400, { error: 'Missing placeId' });
  }
  const apiUrl = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  apiUrl.searchParams.set('place_id', placeId);
  apiUrl.searchParams.set('fields', 'formatted_address,address_component,geometry,place_id');
  apiUrl.searchParams.set('key', GOOGLE_MAPS_API_KEY);
  try {
    const data = await fetchJson(apiUrl);
    if (data.status && data.status !== 'OK') {
      const message = data.error_message || data.status;
      return sendJson(res, 502, { error: `Google Place Details error: ${message}` });
    }
    if (!data.result) {
      return sendJson(res, 404, { error: 'Place not found' });
    }
    const result = data.result;
    const components = result.address_components || result.address_component;
    const zip = extractComponent(components, 'postal_code');
    const city = extractComponent(components, 'locality');
    const state = extractComponent(components, 'administrative_area_level_1');
    const payload = {
      place_id: result.place_id,
      formatted_address: result.formatted_address,
      zip,
      city,
      state,
      location: {
        lat: result.geometry?.location?.lat,
        lng: result.geometry?.location?.lng,
      },
    };
    return sendJson(res, 200, payload);
  } catch (error) {
    console.error(error);
    return sendJson(res, 502, { error: 'Failed to reach Google Place Details' });
  }
}

async function handleQuote(url, res) {
  const address = url.searchParams.get('address');
  const lat = url.searchParams.get('lat');
  const lng = url.searchParams.get('lng');
  let zip = url.searchParams.get('zip');

  if (!address && !zip) {
    return sendJson(res, 400, { error: 'An address or ZIP code is required' });
  }

  if (!zip && address) {
    const match = address.match(/(\d{5})(?:[-\s]|$)/);
    if (match) {
      zip = match[1];
    }
  }

  const normalizedZip = zip && zip.trim().match(/^\d{5}$/) ? zip.trim() : null;

  let housing = null;
  if (normalizedZip) {
    try {
      housing = await fetchHousingStats(normalizedZip);
    } catch (error) {
      console.error('Housing lookup failed:', error.message);
    }
  }

  const analysis = buildAnalysisFromQuery(url.searchParams);

  const quote = buildQuote({ housing, analysis, zip: normalizedZip });

  const media = {};
  if (lat && lng) {
    media.map = `/api/maps/static?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&zoom=19`;
    media.street = `/api/maps/streetview?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&heading=220&pitch=4`;
  }

  return sendJson(res, 200, {
    housing,
    analysis,
    quote,
    media,
  });
}

async function fetchHousingStats(zip) {
  if (!zip || !/^\d{5}$/.test(zip)) return null;
  const apiUrl = new URL('https://api.census.gov/data/2021/acs/acs5');
  apiUrl.searchParams.set(
    'get',
    [
      'NAME',
      'B25035_001E',
      'B25077_001E',
      'B25024_002E',
      'B25024_003E',
      'B25024_004E',
      'B25119_001E',
      'B25034_001E',
      'B25034_010E',
      'B25034_011E',
      'B25034_012E',
      'B25034_013E',
      'B25034_014E',
    ].join(',')
  );
  apiUrl.searchParams.set('for', `zip code tabulation area:${zip}`);

  const data = await fetchJson(apiUrl);
  if (!Array.isArray(data) || data.length < 2) return null;

  const values = data[1];
  const totalUnits = parseNumber(values[7]);
  const olderUnits =
    parseNumber(values[8]) +
    parseNumber(values[9]) +
    parseNumber(values[10]) +
    parseNumber(values[11]) +
    parseNumber(values[12]);
  const detached = parseNumber(values[3]);
  const attached = parseNumber(values[4]);
  const smallMulti = parseNumber(values[5]);

  return {
    label: values[0],
    zip,
    medianYearBuilt: parseNumber(values[1]),
    medianHomeValue: parseNumber(values[2]),
    detachedShare: totalUnits ? detached / totalUnits : null,
    attachedShare: totalUnits ? attached / totalUnits : null,
    smallMultiShare: totalUnits ? smallMulti / totalUnits : null,
    medianRooms: parseNumber(values[6]),
    olderHomeShare: totalUnits && olderUnits ? olderUnits / totalUnits : null,
  };
}

function buildQuote({ housing, analysis, zip }) {
  const floorsFromImage = analysis?.estimatedFloors;
  const floorsFromHousing = inferStoriesFromHousing(housing);
  const stories = floorsFromImage || floorsFromHousing || 2;

  let totalWindows = analysis?.windowCount || estimateWindowsFromHousing(housing, stories);
  totalWindows = clamp(Math.round(totalWindows), 8, 48);

  const mix = determineWindowMix(totalWindows, { housing, analysis });
  const multiplier = computeMultiplier({ housing, analysis, zip, totalWindows, stories });

  const lineItems = [
    createLineItem('Double-Hung', mix.doubleHung, 685, multiplier, 'dw'),
    createLineItem('Casement', mix.casement, 895, multiplier * 1.05, 'cs'),
    createLineItem('Slider', mix.slider, 735, multiplier, 'sl'),
    createLineItem('Picture', mix.picture, 960, multiplier * 1.08, 'pc'),
    createLineItem('Bay/Bow', mix.bay, 2725, multiplier * 1.15, 'bb'),
  ];

  const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
  const priceLow = Math.round(subtotal * 0.92);
  const priceHigh = Math.round(subtotal * 1.09);

  return {
    totalWindows,
    priceLow,
    priceHigh,
    multiplier,
    lineItems,
  };
}

function inferStoriesFromHousing(housing) {
  if (!housing) return null;
  if (housing.smallMultiShare && housing.smallMultiShare > 0.15) {
    return 3;
  }
  if (housing.attachedShare && housing.attachedShare > 0.2) {
    return 2;
  }
  return 2;
}

function estimateWindowsFromHousing(housing, stories) {
  const baselineRooms = housing?.medianRooms || 7.2;
  const roomFactor = baselineRooms * 1.5;
  const storyFactor = stories * 4.5;
  const olderBonus = housing?.olderHomeShare ? housing.olderHomeShare * 6 : 0;
  const detachedBonus = housing?.detachedShare ? housing.detachedShare * 3 : 0;
  return roomFactor + storyFactor + olderBonus + detachedBonus;
}

function determineWindowMix(totalWindows, { housing, analysis }) {
  let doubleHungRatio = 0.52;
  let casementRatio = 0.18;
  let sliderRatio = 0.12;
  let pictureRatio = 0.1;
  let bayRatio = 0.08;

  if (housing?.olderHomeShare) {
    doubleHungRatio += housing.olderHomeShare * 0.25;
    pictureRatio += housing.olderHomeShare * 0.05;
  }

  if (housing?.attachedShare) {
    sliderRatio += housing.attachedShare * 0.15;
    bayRatio -= housing.attachedShare * 0.05;
  }

  if (analysis?.glassFactor) {
    const glass = analysis.glassFactor;
    casementRatio += glass * 0.12;
    pictureRatio += glass * 0.08;
    doubleHungRatio -= glass * 0.1;
  }

  const ratios = [doubleHungRatio, casementRatio, sliderRatio, pictureRatio, bayRatio];
  const normalized = normalizeRatios(ratios);

  const allocations = normalized.map((ratio) => Math.max(1, Math.round(totalWindows * ratio)));

  let [doubleHung, casement, slider, picture, bay] = allocations;
  let assigned = doubleHung + casement + slider + picture + bay;
  if (assigned > totalWindows) {
    doubleHung = Math.max(4, doubleHung - (assigned - totalWindows));
  } else if (assigned < totalWindows) {
    doubleHung += totalWindows - assigned;
  }

  return { doubleHung, casement, slider, picture, bay };
}

function normalizeRatios(ratios) {
  const total = ratios.reduce((sum, value) => sum + value, 0) || 1;
  return ratios.map((value) => value / total);
}

function computeMultiplier({ housing, analysis, zip, totalWindows, stories }) {
  let multiplier = 1;

  if (housing?.medianHomeValue) {
    const baseline = 420000;
    const diff = housing.medianHomeValue - baseline;
    multiplier += clamp(diff / 900000, -0.08, 0.12);
  }

  if (housing?.medianYearBuilt) {
    if (housing.medianYearBuilt < 1960) {
      multiplier += 0.06;
    } else if (housing.medianYearBuilt > 2005) {
      multiplier -= 0.03;
    }
  }

  if (housing?.olderHomeShare) {
    multiplier += clamp(housing.olderHomeShare * 0.08, 0, 0.08);
  }

  if (analysis?.estimatedFloors && analysis.estimatedFloors >= 3) {
    multiplier += 0.05;
  }

  if (totalWindows > 28) {
    multiplier += 0.04;
  }

  if (zip) {
    if (/^07[7-9]/.test(zip)) {
      multiplier += 0.05;
    } else if (/^08[0-9]/.test(zip)) {
      multiplier += 0.02;
    } else if (/^070/.test(zip)) {
      multiplier += 0.01;
    }
  }

  return parseFloat(clamp(multiplier, 0.85, 1.35).toFixed(2));
}

function createLineItem(type, quantity, baseUnit, multiplier, icon) {
  const unitPrice = Math.round(baseUnit * multiplier);
  return {
    type,
    quantity,
    unitPrice,
    total: Math.round(unitPrice * quantity),
    icon,
  };
}

function parseNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function buildAnalysisFromQuery(params) {
  const analysis = {};
  const windowCount = parseNumber(params.get('windowCount'));
  if (windowCount > 0) {
    analysis.windowCount = clamp(Math.round(windowCount), 6, 64);
  }
  const floors = parseNumber(params.get('floors'));
  if (floors > 0) {
    analysis.estimatedFloors = clamp(Math.round(floors), 1, 5);
  }
  const columns = parseNumber(params.get('columns'));
  if (columns > 0) {
    analysis.estimatedColumns = clamp(Math.round(columns), 2, 12);
  }
  const glassFactor = parseNumber(params.get('glassFactor'));
  if (glassFactor > 0) {
    analysis.glassFactor = parseFloat(clamp(glassFactor, 0, 1).toFixed(2));
  }
  const brightness = parseNumber(params.get('brightness'));
  if (brightness > 0) {
    analysis.brightness = parseFloat(clamp(brightness, 0, 255).toFixed(2));
  }
  return Object.keys(analysis).length ? analysis : null;
}

function extractComponent(components, type) {
  if (!Array.isArray(components)) return null;
  const match = components.find((component) => component.types?.includes(type));
  if (!match) return null;
  return match.long_name || match.short_name || null;
}

function fetchJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = https.request(
      url,
      { method: 'GET', headers },
      (response) => {
        const { statusCode } = response;
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          if (statusCode >= 200 && statusCode < 300) {
            try {
              resolve(JSON.parse(body));
            } catch (error) {
              reject(error);
            }
          } else {
            reject(new Error(`Remote request failed: ${statusCode} ${body}`));
          }
        });
      }
    );
    request.on('error', reject);
    request.end();
  });
}

function proxyGoogleImage(url, res, endpoint) {
  if (!GOOGLE_MAPS_API_KEY) {
    return sendJson(res, 500, { error: 'Missing GOOGLE_MAPS_API_KEY' });
  }
  const lat = url.searchParams.get('lat');
  const lng = url.searchParams.get('lng');
  if (!lat || !lng) {
    return sendJson(res, 400, { error: 'lat and lng are required' });
  }
  const apiUrl = new URL(`https://maps.googleapis.com/maps/api/${endpoint}`);
  if (endpoint === 'staticmap') {
    apiUrl.searchParams.set('center', `${lat},${lng}`);
    apiUrl.searchParams.set('zoom', url.searchParams.get('zoom') || '18');
    apiUrl.searchParams.set('size', '640x640');
    apiUrl.searchParams.set('scale', '2');
    apiUrl.searchParams.set('maptype', 'satellite');
    apiUrl.searchParams.set('markers', `color:0xA3E635|${lat},${lng}`);
  } else if (endpoint === 'streetview') {
    apiUrl.searchParams.set('size', '640x640');
    apiUrl.searchParams.set('location', `${lat},${lng}`);
    apiUrl.searchParams.set('fov', url.searchParams.get('fov') || '75');
    apiUrl.searchParams.set('heading', url.searchParams.get('heading') || '220');
    apiUrl.searchParams.set('pitch', url.searchParams.get('pitch') || '4');
  }
  apiUrl.searchParams.set('key', GOOGLE_MAPS_API_KEY);

  const request = https.get(apiUrl, (response) => {
    const headers = {
      'Content-Type': response.headers['content-type'] || 'image/jpeg',
      'Cache-Control': 'no-store',
    };
    res.writeHead(response.statusCode || 500, headers);
    response.pipe(res);
  });

  request.on('error', (error) => {
    console.error(error);
    sendJson(res, 502, { error: 'Failed to retrieve Google imagery' });
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
