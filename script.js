'use strict';

const SCREENS = ["intro", "address", "analyzing", "quote", "contact"];

const CTA_CONFIG = {
  intro: {
    primary: { label: "Start – Enter Your Address", action: () => goto("address") },
    secondary: { label: "What’s included?", action: openModal },
  },
  address: {
    primary: {
      label: "Find My Home",
      action: handleFindHome,
    },
    secondary: { label: "What’s included?", action: openModal },
  },
  analyzing: {
    primary: { label: "Analyzing…", action: () => {}, disabled: true },
    secondary: null,
  },
  quote: {
    primary: {
      label: "Text Me This Quote",
      action: () => goto("contact", "text"),
    },
    secondary: {
      label: "Email Me",
      action: () => goto("contact", "email"),
    },
    tertiary: {
      label: "Schedule a Visit",
      action: () => window.alert("A specialist will reach out shortly!"),
    },
  },
  contact: {
    primary: { label: "Send My Quote", action: sendQuote },
    secondary: { label: "Back to estimate", action: () => goto("quote") },
  },
};

const WINDOW_TYPE_LABELS = {
  doubleHung: "Double-Hung",
  casement: "Casement",
  slider: "Slider",
  picture: "Picture",
  bay: "Bay/Bow",
};

const WINDOW_TYPE_KEYS = Object.keys(WINDOW_TYPE_LABELS);

const state = {
  predictions: [],
  selectedPrediction: null,
  place: null,
  housing: null,
  analysis: null,
  quote: null,
  media: { map: null, street: null },
  contactPreference: null,
  analyzeInterval: null,
  idleTimer: null,
  sessionToken: null,
};

const CONFIG = window.__KIOSK_CONFIG || {};
const GOOGLE_MAPS_API_KEY = CONFIG.googleMapsApiKey || CONFIG.googleMapsKey || "";
const housingCache = new Map();

const GOOGLE_PLACES_AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";
const GOOGLE_PLACES_DETAILS_URL = "https://places.googleapis.com/v1/places/";
const GOOGLE_PLACES_AUTOCOMPLETE_FIELDS = "predictions.placeId,predictions.text,predictions.structuredFormat";
const GOOGLE_PLACES_DETAILS_FIELDS = "formattedAddress,addressComponents,location";

const app = document.querySelector(".app");
const screens = Array.from(document.querySelectorAll(".screen"));
const primaryBtn = document.querySelector('[data-action="primary"]');
const secondaryBtn = document.querySelector('[data-action="secondary"]');
const ctaGroup = document.getElementById("cta-group");
const backBtn = document.querySelector('[data-action="back"]');
const modal = document.getElementById("modal");
const addressInput = document.getElementById("address-input");
const autocompleteList = document.getElementById("autocomplete");
const zipToggle = document.getElementById("zip-input-wrap");
const zipInput = document.getElementById("zip-input");
const analyzeAddress = document.getElementById("analyze-address");
const analyzeMedia = document.getElementById("analyze-media");
const analyzeSteps = document.getElementById("analyze-steps");
const progressBar = document.getElementById("progress-bar");
const progressValue = document.getElementById("progress-value");
const previewMap = document.getElementById("preview-map");
const totalWindows = document.getElementById("total-windows");
const priceRange = document.getElementById("price-range");
const itemList = document.getElementById("item-list");
const insightHousingValue = document.getElementById("insight-housing-value");
const insightHousingDetail = document.getElementById("insight-housing-detail");
const insightImageryValue = document.getElementById("insight-imagery-value");
const insightImageryDetail = document.getElementById("insight-imagery-detail");
const contactConsent = document.getElementById("contact-consent");
const contactSuccess = document.getElementById("contact-success");
const contactPhone = document.getElementById("contact-phone");
const contactEmail = document.getElementById("contact-email");
const contactIntro = document.querySelector(".contact-intro");

function getSessionToken() {
  if (!state.sessionToken) {
    state.sessionToken = createSessionToken();
  }
  return state.sessionToken;
}

function goto(screen, data) {
  if (!SCREENS.includes(screen)) return;
  app.dataset.screen = screen;
  screens.forEach((el) => {
    el.classList.toggle("active", el.dataset.screen === screen);
  });
  configureCTA(screen, data);
  if (screen === "contact") {
    handleContactPref(data);
  }
  if (screen === "address") {
    resetSessionToken();
    state.predictions = [];
    renderAutocomplete();
  }
  resetIdleTimer();
}

function configureCTA(screen, data) {
  const config = CTA_CONFIG[screen];
  if (!config) return;

  const existingTertiary = ctaGroup.querySelector(".tertiary");
  if (existingTertiary) existingTertiary.remove();

  if (config.secondary) {
    secondaryBtn.style.display = "inline-flex";
    secondaryBtn.textContent = config.secondary.label;
    secondaryBtn.disabled = !!config.secondary.disabled;
    secondaryBtn.onclick = () => {
      config.secondary.action(data);
      resetIdleTimer();
    };
  } else {
    secondaryBtn.style.display = "none";
    secondaryBtn.disabled = false;
    secondaryBtn.onclick = null;
  }

  if (config.primary) {
    primaryBtn.style.display = "inline-flex";
    primaryBtn.textContent = config.primary.label;
    primaryBtn.disabled = !!config.primary.disabled;
    primaryBtn.onclick = () => {
      config.primary.action(data);
      resetIdleTimer();
    };
  } else {
    primaryBtn.style.display = "none";
    primaryBtn.disabled = false;
    primaryBtn.onclick = null;
  }

  if (config.tertiary) {
    const tertiary = document.createElement("button");
    tertiary.className = "secondary tertiary";
    tertiary.textContent = config.tertiary.label;
    tertiary.onclick = () => {
      config.tertiary.action(data);
      resetIdleTimer();
    };
    ctaGroup.insertBefore(tertiary, primaryBtn);
  }

  backBtn.style.visibility = screen === "intro" ? "hidden" : "visible";
  backBtn.onclick = () => handleBack();
}

function handleBack() {
  const idx = SCREENS.indexOf(app.dataset.screen);
  if (idx > 0) {
    goto(SCREENS[idx - 1]);
  }
}

function handleContactPref(pref) {
  state.contactPreference = pref || null;
  contactSuccess.classList.add("hidden");
  contactPhone.classList.remove("emphasis");
  contactEmail.classList.remove("emphasis");
  if (pref === "text") {
    contactIntro.textContent =
      "We’ll text a secure link to this quote. Add email if you’d like both.";
    contactPhone.classList.add("emphasis");
    contactPhone.focus();
  } else if (pref === "email") {
    contactIntro.textContent =
      "We’ll email a copy of this quote. Add your phone if you prefer a text.";
    contactEmail.classList.add("emphasis");
    contactEmail.focus();
  } else {
    contactIntro.textContent =
      "Get a copy by text or email. We’ll include helpful next steps.";
  }
}

function openModal() {
  modal.setAttribute("aria-hidden", "false");
  modal.querySelector(".close").focus?.();
}

function closeModal() {
  modal.setAttribute("aria-hidden", "true");
}

function resetIdleTimer() {
  if (state.idleTimer) clearTimeout(state.idleTimer);
  state.idleTimer = setTimeout(() => goto("intro"), 30_000);
}

function debounce(fn, wait = 200) {
  let timeout;
  return function debounced(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), wait);
  };
}

function resetSessionToken() {
  state.sessionToken = null;
}

const api = {
  async autocomplete(input) {
    if (!input || input.length < 3) return [];
    if (!GOOGLE_MAPS_API_KEY) {
      throw new Error("Google Maps API key is required for autocomplete");
    }
    const token = getSessionToken();
    const response = await fetch(GOOGLE_PLACES_AUTOCOMPLETE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask": GOOGLE_PLACES_AUTOCOMPLETE_FIELDS,
      },
      body: JSON.stringify({
        input: input.trim(),
        languageCode: "en",
        sessionToken: token,
        includedRegionCodes: ["us"],
        includedPrimaryTypes: ["street_address", "premise", "subpremise"],
      }),
    });
    if (!response.ok) {
      throw new Error(`Places autocomplete error: ${response.status}`);
    }
    const data = await response.json();
    const predictions = Array.isArray(data?.predictions) ? data.predictions : [];
    return predictions.map(normalizeAutocompletePrediction).filter(Boolean);
  },
  async placeDetails(placeId) {
    if (!placeId) {
      throw new Error("Missing placeId");
    }
    if (!GOOGLE_MAPS_API_KEY) {
      throw new Error("Google Maps API key is required for place details");
    }
    const token = getSessionToken();
    const detailsUrl = new URL(
      `${GOOGLE_PLACES_DETAILS_URL}${encodeURIComponent(placeId)}`
    );
    detailsUrl.searchParams.set("languageCode", "en");
    if (token) {
      detailsUrl.searchParams.set("sessionToken", token);
    }
    const response = await fetch(detailsUrl.toString(), {
      headers: {
        "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask": GOOGLE_PLACES_DETAILS_FIELDS,
      },
    });
    if (!response.ok) {
      throw new Error(`Place details error: ${response.status}`);
    }
    const result = await response.json();
    if (!result) {
      throw new Error("Place details empty response");
    }
    const components = normalizeAddressComponents(result.addressComponents);
    const lat = toNumber(result.location?.latitude);
    const lng = toNumber(result.location?.longitude);
    return {
      place_id: placeId,
      formatted_address:
        result.formattedAddress || result.shortFormattedAddress || result.displayName?.text || "",
      zip: extractComponent(components, "postal_code"),
      city: extractComponent(components, "locality") || extractComponent(components, "sublocality"),
      state: extractComponent(components, "administrative_area_level_1"),
      location: {
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
      },
    };
  },
  async quote(params) {
    const payload = normalizeQuotePayload(params);
    let housing = null;
    if (payload.zip) {
      try {
        housing = await fetchHousingStats(payload.zip);
      } catch (error) {
        console.warn("Housing lookup failed", error);
      }
    }
    const analysis = buildAnalysisFromPayload(payload);
    const quote = buildQuote({ housing, analysis, zip: payload.zip });
    const media = {};
    if (payload.lat != null && payload.lng != null) {
      const mapUrl = buildStaticMapUrl(payload.lat, payload.lng, payload.zoom);
      if (mapUrl) media.map = mapUrl;
      const streetUrl = buildStreetViewImageUrl(payload.lat, payload.lng);
      if (streetUrl) media.street = streetUrl;
    }
    return { housing, analysis, quote, media };
  },
};

function createSessionToken() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `sess-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeAutocompletePrediction(prediction) {
  if (!prediction) return null;
  const mainText = prediction.structuredFormat?.mainText?.text || prediction.text?.text || "";
  const secondaryText = prediction.structuredFormat?.secondaryText?.text || "";
  const description = prediction.text?.text || [mainText, secondaryText].filter(Boolean).join(", ");
  return {
    place_id: prediction.placeId,
    description,
    structured_formatting: {
      main_text: mainText,
      secondary_text: secondaryText,
    },
  };
}

function normalizeAddressComponents(components) {
  if (!Array.isArray(components)) return [];
  return components.map((component) => ({
    long_name: normalizeAddressComponentValue(component.longText ?? component.long_name),
    short_name: normalizeAddressComponentValue(component.shortText ?? component.short_name),
    types: Array.isArray(component.types) ? component.types : [],
  }));
}

function normalizeAddressComponentValue(value) {
  if (typeof value === "string") return value;
  if (value == null) return null;
  return String(value);
}

async function ensurePredictionHasPlace(prediction) {
  if (!prediction) return null;
  if (prediction.place_id) return prediction;
  try {
    const matches = await api.autocomplete(prediction.description);
    const normalized = (prediction.description || "").toLowerCase();
    const resolved = normalized
      ? matches.find((item) => item.description?.toLowerCase() === normalized)
      : null;
    if (resolved) {
      return resolved;
    }
    return matches[0] || null;
  } catch (error) {
    console.warn('Unable to resolve place id', prediction, error);
    return null;
  }
}

const updateSuggestions = debounce(async (value) => {
  const trimmed = value ? value.trim() : "";
  if (!trimmed || trimmed.length < 3) {
    state.predictions = [];
    renderAutocomplete();
    return;
  }
  try {
    const predictions = await api.autocomplete(trimmed);
    if (predictions.length) {
      state.predictions = predictions.filter(Boolean);
    } else {
      state.predictions = [];
      renderAutocomplete();
      return;
    }
    renderAutocomplete();
  } catch (error) {
    console.error(error);
    state.predictions = [];
    renderAutocomplete();
  }
}, 250);

function renderAutocomplete() {
  autocompleteList.innerHTML = "";
  if (!state.predictions.length) {
    autocompleteList.classList.remove("visible");
    return;
  }
  state.predictions.slice(0, 6).forEach((prediction) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "autocomplete-item";
    item.innerHTML = `
      <span class="line-1">${prediction.structured_formatting?.main_text || prediction.description}</span>
      <span class="line-2">${
        prediction.structured_formatting?.secondary_text || ""
      }</span>
    `;
    item.onclick = () => selectPrediction(prediction);
    autocompleteList.appendChild(item);
  });
  autocompleteList.classList.add("visible");
}

async function selectPrediction(prediction) {
  autocompleteList.classList.remove("visible");
  addressInput.value = prediction.description;
  const resolved = await ensurePredictionHasPlace(prediction);
  if (!resolved?.place_id) {
    state.selectedPrediction = null;
    state.place = null;
    showPreviewError();
    return;
  }
  state.selectedPrediction = resolved;
  try {
    const place = await api.placeDetails(resolved.place_id);
    state.place = place;
    updatePreview(place);
  } catch (error) {
    console.error(error);
    showPreviewError();
  }
}

function updatePreview(place) {
  if (!place) {
    showPreviewError();
    return;
  }
  const { location } = place;
  if (!location || typeof location.lat !== "number" || typeof location.lng !== "number") {
    showPreviewError();
    return;
  }
  previewMap.innerHTML = "";
  previewMap.classList.add("loading");
  previewMap.style.backgroundImage = "";

  const badge = document.createElement("div");
  badge.className = "preview-badge";
  badge.textContent = place.formatted_address || state.selectedPrediction?.description;
  previewMap.appendChild(badge);

  const mapUrl = buildStaticMapUrl(location.lat, location.lng, 18);
  if (!mapUrl) {
    showPreviewError();
    return;
  }
  const img = new Image();
  img.alt = "Map preview";
  img.src = `${mapUrl}&cacheBust=${Date.now()}`;
  img.onload = () => {
    previewMap.classList.remove("loading");
    previewMap.style.backgroundImage = `url(${mapUrl})`;
  };
  img.onerror = () => {
    previewMap.classList.remove("loading");
    showPreviewError();
  };
}

function showPreviewError() {
  previewMap.innerHTML = "Preview";
  previewMap.style.backgroundImage = "";
  previewMap.classList.remove("loading");
  previewMap.style.color = "rgba(255, 255, 255, 0.7)";
}

async function handleFindHome() {
  const addressText = addressInput.value.trim();
  const zipOnly = !addressText && !state.place;
  const zipValue = zipInput.value.trim();

  if (zipOnly && zipValue.length === 5) {
    await analyzeFromZip(zipValue);
    return;
  }

  if (!state.place) {
    if (!state.selectedPrediction && addressText.length >= 5) {
      try {
        const predictions = await api.autocomplete(addressText);
        if (predictions.length) {
          await selectPrediction(predictions[0]);
        }
      } catch (error) {
        console.error(error);
      }
    }
  }

  if (!state.place) {
    addressInput.focus();
    addressInput.classList.add("shake");
    setTimeout(() => addressInput.classList.remove("shake"), 600);
    return;
  }

  startAnalysis({
    address: state.place.formatted_address,
    lat: state.place.location.lat,
    lng: state.place.location.lng,
    zip: state.place.zip,
  });
}

async function analyzeFromZip(zip) {
  try {
    startAnalysis({ address: `ZIP ${zip}`, zip });
  } catch (error) {
    console.error(error);
  }
}

function resetAnalysisProgress() {
  const steps = Array.from(analyzeSteps.querySelectorAll(".step"));
  steps.forEach((step) => step.classList.remove("complete", "active"));
  if (steps.length) {
    steps[0].classList.add("active");
  }
  progressBar.style.width = "0%";
  progressValue.textContent = "0%";
  if (state.analyzeInterval) clearInterval(state.analyzeInterval);
}

function runProgressSimulation() {
  const steps = Array.from(analyzeSteps.querySelectorAll(".step"));
  let progress = 0;
  let currentStep = 0;
  state.analyzeInterval = setInterval(() => {
    progress = Math.min(progress + Math.floor(Math.random() * 14) + 8, 97);
    progressBar.style.width = `${progress}%`;
    progressValue.textContent = `${progress}%`;
    const nextStep = Math.min(Math.floor(progress / 25), steps.length - 1);
    if (nextStep !== currentStep) {
      steps[currentStep].classList.remove("active");
      steps[currentStep].classList.add("complete");
      steps[nextStep].classList.add("active");
      currentStep = nextStep;
    }
  }, 500);
}

async function startAnalysis(params) {
  resetAnalysisProgress();
  goto("analyzing");
  analyzeAddress.textContent = params.address;
  runProgressSimulation();

  try {
    const payload = { ...params };
    if (!payload.zip && state.place?.zip) payload.zip = state.place.zip;
    let imageryMetrics = null;
    if (payload.lat && payload.lng) {
      imageryMetrics = await analyzeStreetImagery(payload.lat, payload.lng);
      if (imageryMetrics) {
        if (imageryMetrics.url) {
          setAnalyzeMedia(imageryMetrics.url);
        }
        payload.windowCount = imageryMetrics.windowCount;
        payload.floors = imageryMetrics.estimatedFloors;
        payload.columns = imageryMetrics.estimatedColumns;
        payload.glassFactor = imageryMetrics.glassFactor;
        payload.brightness = imageryMetrics.brightness;
        if (imageryMetrics.windowTypes) {
          payload.windowTypes = JSON.stringify(imageryMetrics.windowTypes);
        }
        if (typeof imageryMetrics.windowConfidence === "number") {
          payload.windowConfidence = imageryMetrics.windowConfidence;
        }
      }
    }
    const quoteResponse = await api.quote(payload);
    finalizeAnalysis({ ...quoteResponse, analysis: imageryMetrics || quoteResponse.analysis || null });
  } catch (error) {
    console.error(error);
    showAnalysisError(error);
  }
}

function finalizeAnalysis(data) {
  if (state.analyzeInterval) {
    clearInterval(state.analyzeInterval);
    state.analyzeInterval = null;
  }

  const steps = Array.from(analyzeSteps.querySelectorAll(".step"));
  steps.forEach((step) => step.classList.add("complete"));
  steps[steps.length - 1]?.classList.add("active");
  progressBar.style.width = "100%";
  progressValue.textContent = "100%";

  state.housing = data.housing || null;
  state.analysis = data.analysis || null;
  state.quote = data.quote || null;
  state.media = data.media || { map: null, street: null };

  setAnalyzeMedia(state.media.street || state.media.map);
  populateQuote();
  populateInsights();

  setTimeout(() => goto("quote"), 400);
}

function setAnalyzeMedia(url) {
  if (!url) {
    analyzeMedia.style.backgroundImage = "";
    analyzeMedia.classList.remove("loaded");
    return;
  }
  const img = new Image();
  img.src = url;
  img.onload = () => {
    analyzeMedia.style.backgroundImage = `url(${url})`;
    analyzeMedia.classList.add("loaded");
  };
  img.onerror = () => {
    analyzeMedia.style.backgroundImage = "";
    analyzeMedia.classList.remove("loaded");
  };
}

function populateQuote() {
  if (!state.quote) {
    priceRange.textContent = "Unavailable";
    totalWindows.textContent = "--";
    itemList.innerHTML = "";
    const placeholder = document.createElement("li");
    placeholder.className = "item-row muted";
    placeholder.innerHTML = "Enter an address to see the detailed breakdown.";
    itemList.appendChild(placeholder);
    return;
  }

  totalWindows.textContent = state.quote.totalWindows.toString();
  priceRange.textContent = `${formatCurrency(state.quote.priceLow)} – ${formatCurrency(
    state.quote.priceHigh
  )}`;

  itemList.innerHTML = "";
  state.quote.lineItems.forEach((item) => {
    const li = document.createElement("li");
    li.className = "item-row";
    li.innerHTML = `
      <div class="item-info">
        <div class="item-icon item-${item.icon || "dw"}"></div>
        <div class="item-details">
          <span class="item-title">${item.type}</span>
          <span class="item-qty">×${item.quantity} — ~${formatCurrency(item.unitPrice)}</span>
        </div>
      </div>
      <div class="item-price">${formatCurrency(item.total)}</div>
    `;
    itemList.appendChild(li);
  });
}

function populateInsights() {
  if (state.housing) {
    const name = state.housing.label?.replace('ZIP Code Tabulation Area', 'ZCTA') || `ZIP ${state.housing.zip}`;
    insightHousingValue.textContent = name;
    const housingParts = [];
    if (typeof state.housing.medianYearBuilt === "number" && state.housing.medianYearBuilt > 0) {
      housingParts.push(`Median year built ${Math.round(state.housing.medianYearBuilt)}`);
    }
    if (typeof state.housing.medianRooms === "number" && state.housing.medianRooms > 0) {
      housingParts.push(`${state.housing.medianRooms.toFixed(1)} median rooms`);
    }
    if (typeof state.housing.olderHomeShare === "number" && state.housing.olderHomeShare > 0) {
      housingParts.push(`${formatPercent(state.housing.olderHomeShare)} built pre-1980`);
    }
    insightHousingDetail.textContent = housingParts.length
      ? housingParts.join(' • ')
      : 'Housing characteristics from U.S. Census ACS (New Jersey).';
  } else {
    insightHousingValue.textContent = 'NJ statewide norms';
    insightHousingDetail.textContent = 'ZIP-specific Census data unavailable – using statewide baselines.';
  }

  if (state.analysis) {
    const floorsText = state.analysis.estimatedFloors
      ? `${state.analysis.estimatedFloors} stories detected`
      : "Stories not detected";
    const windowText = state.analysis.windowCount
      ? `${state.analysis.windowCount} windows from Street View`
      : "Street View analyzed";
    insightImageryValue.textContent = windowText;
    const imageryParts = [floorsText];
    if (state.analysis.glassFactor != null) {
      imageryParts.push(`${formatPercent(state.analysis.glassFactor)} façade glass`);
    }
    const mixParts = buildWindowMixParts(state.analysis.windowTypes);
    if (mixParts.length) {
      imageryParts.push(`Detected mix: ${mixParts.join(', ')}`);
    }
    if (typeof state.analysis.windowConfidence === "number") {
      imageryParts.push(`Confidence ${formatPercent(state.analysis.windowConfidence)}`);
    }
    insightImageryDetail.textContent = imageryParts.join(' • ');
  } else {
    insightImageryValue.textContent = 'Imagery unavailable';
    insightImageryDetail.textContent = 'Falling back to housing trends to estimate window mix.';
  }
}

function formatCurrency(value) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  });
}

function formatPercent(value) {
  const percent = Math.round((value || 0) * 100);
  return `${percent}%`;
}

function clampValue(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function buildWindowMixParts(windowTypes) {
  if (!windowTypes) return [];
  return WINDOW_TYPE_KEYS.filter((key) => typeof windowTypes[key] === "number" && windowTypes[key] > 0)
    .map((key) => `${WINDOW_TYPE_LABELS[key]} ×${windowTypes[key]}`);
}

function normalizeQuotePayload(params = {}) {
  const normalized = { ...params };
  const lat = Number(params.lat);
  normalized.lat = Number.isFinite(lat) ? lat : null;
  const lng = Number(params.lng);
  normalized.lng = Number.isFinite(lng) ? lng : null;
  const zoom = Number(params.zoom);
  normalized.zoom = Number.isFinite(zoom) ? zoom : undefined;
  const zip = typeof params.zip === "string" ? params.zip.trim() : "";
  normalized.zip = /^\d{5}$/.test(zip) ? zip : null;
  return normalized;
}

async function fetchHousingStats(zip) {
  if (!zip || !/^\d{5}$/.test(zip)) return null;
  if (housingCache.has(zip)) {
    return housingCache.get(zip);
  }
  const apiUrl = new URL("https://api.census.gov/data/2021/acs/acs5");
  apiUrl.searchParams.set(
    "get",
    [
      "NAME",
      "B25035_001E",
      "B25077_001E",
      "B25024_002E",
      "B25024_003E",
      "B25024_004E",
      "B25119_001E",
      "B25034_001E",
      "B25034_010E",
      "B25034_011E",
      "B25034_012E",
      "B25034_013E",
      "B25034_014E",
    ].join(",")
  );
  apiUrl.searchParams.set("for", `zip code tabulation area:${zip}`);
  apiUrl.searchParams.set("in", "state:34");

  const response = await fetch(apiUrl.toString());
  if (!response.ok) {
    throw new Error(`Census API error: ${response.status}`);
  }
  const data = await response.json();
  if (!Array.isArray(data) || data.length < 2) return null;

  const values = data[1];
  const totalUnits = toNumber(values[7]);
  const olderUnits =
    toNumber(values[8]) +
    toNumber(values[9]) +
    toNumber(values[10]) +
    toNumber(values[11]) +
    toNumber(values[12]);
  const detached = toNumber(values[3]);
  const attached = toNumber(values[4]);
  const smallMulti = toNumber(values[5]);

  const profile = {
    label: values[0],
    zip,
    medianYearBuilt: toNumber(values[1]),
    medianHomeValue: toNumber(values[2]),
    detachedShare: totalUnits ? detached / totalUnits : null,
    attachedShare: totalUnits ? attached / totalUnits : null,
    smallMultiShare: totalUnits ? smallMulti / totalUnits : null,
    medianRooms: toNumber(values[6]),
    olderHomeShare: totalUnits && olderUnits ? olderUnits / totalUnits : null,
  };
  housingCache.set(zip, profile);
  return profile;
}

function buildAnalysisFromPayload(payload = {}) {
  const analysis = {};
  const windowCount = toNumber(payload.windowCount);
  if (windowCount > 0) {
    analysis.windowCount = clampValue(Math.round(windowCount), 6, 64);
  }
  const floors = toNumber(payload.floors);
  if (floors > 0) {
    analysis.estimatedFloors = clampValue(Math.round(floors), 1, 5);
  }
  const columns = toNumber(payload.columns);
  if (columns > 0) {
    analysis.estimatedColumns = clampValue(Math.round(columns), 2, 12);
  }
  const glassFactor = Number(payload.glassFactor);
  if (Number.isFinite(glassFactor) && glassFactor > 0) {
    analysis.glassFactor = Number(clampValue(glassFactor, 0, 1).toFixed(2));
  }
  const brightness = Number(payload.brightness);
  if (Number.isFinite(brightness) && brightness > 0) {
    analysis.brightness = Number(clampValue(brightness, 0, 255).toFixed(2));
  }

  const windowTypesParam = payload.windowTypes;
  if (windowTypesParam) {
    let parsed;
    if (typeof windowTypesParam === "string") {
      try {
        parsed = JSON.parse(windowTypesParam);
      } catch (error) {
        console.warn("Unable to parse windowTypes payload", error);
      }
    } else if (typeof windowTypesParam === "object") {
      parsed = windowTypesParam;
    }
    if (parsed) {
      const normalized = {};
      let total = 0;
      WINDOW_TYPE_KEYS.forEach((key) => {
        const value = Math.max(0, Math.round(toNumber(parsed[key])));
        if (value > 0) {
          normalized[key] = value;
          total += value;
        }
      });
      if (total > 0) {
        analysis.windowTypes = normalized;
      }
    }
  }

  if (payload.windowConfidence != null) {
    const confidence = Number(payload.windowConfidence);
    if (Number.isFinite(confidence) && confidence > 0) {
      analysis.windowConfidence = Number(clampValue(confidence, 0, 1).toFixed(2));
    }
  }

  return Object.keys(analysis).length ? analysis : null;
}

function buildQuote({ housing, analysis, zip }) {
  const floorsFromImage = analysis?.estimatedFloors;
  const floorsFromHousing = inferStoriesFromHousing(housing);
  const stories = floorsFromImage || floorsFromHousing || 2;

  let totalWindows = analysis?.windowCount || estimateWindowsFromHousing(housing, stories);
  totalWindows = clampValue(Math.round(totalWindows), 8, 48);

  const mix = determineWindowMix(totalWindows, { housing, analysis });
  const multiplier = computeMultiplier({ housing, analysis, zip, totalWindows, stories });

  let lineItems = [
    createLineItem("Double-Hung", mix.doubleHung, 685, multiplier, "dw"),
    createLineItem("Casement", mix.casement, 895, multiplier * 1.05, "cs"),
    createLineItem("Slider", mix.slider, 735, multiplier, "sl"),
    createLineItem("Picture", mix.picture, 960, multiplier * 1.08, "pc"),
    createLineItem("Bay/Bow", mix.bay, 2725, multiplier * 1.15, "bb"),
  ].filter((item) => item.quantity > 0);

  let assigned = lineItems.reduce((sum, item) => sum + item.quantity, 0);
  if (lineItems.length && assigned !== totalWindows) {
    const diff = totalWindows - assigned;
    const primaryIndex = lineItems.findIndex((item) => item.type === "Double-Hung");
    const target = lineItems[primaryIndex >= 0 ? primaryIndex : 0];
    target.quantity = Math.max(0, target.quantity + diff);
    target.total = Math.round(target.unitPrice * target.quantity);
    lineItems = lineItems.filter((item) => item.quantity > 0);
    assigned = lineItems.reduce((sum, item) => sum + item.quantity, 0);
  }

  assigned = lineItems.reduce((sum, item) => sum + item.quantity, 0);
  if (assigned > 0) {
    totalWindows = assigned;
  }

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
  const counts = {
    doubleHung: allocations[0],
    casement: allocations[1],
    slider: allocations[2],
    picture: allocations[3],
    bay: allocations[4],
  };

  if (analysis?.windowTypes) {
    const detectionCounts = WINDOW_TYPE_KEYS.map((key) => Math.max(0, toNumber(analysis.windowTypes[key])));
    const detectionTotal = detectionCounts.reduce((sum, value) => sum + value, 0);
    if (detectionTotal > 0) {
      const confidence = clampValue(
        typeof analysis.windowConfidence === "number" ? analysis.windowConfidence : 0.75,
        0,
        1
      );
      const scale = totalWindows / detectionTotal;
      WINDOW_TYPE_KEYS.forEach((key, index) => {
        const baseline = counts[key];
        const detectionValue = detectionCounts[index] * scale;
        const blended = baseline * (1 - confidence) + detectionValue * confidence;
        counts[key] = Math.max(0, Math.round(blended));
      });
    }
  }

  let assigned = WINDOW_TYPE_KEYS.reduce((sum, key) => sum + counts[key], 0);
  if (assigned > totalWindows) {
    let diff = assigned - totalWindows;
    const adjustableKeys = [...WINDOW_TYPE_KEYS].sort((a, b) => counts[b] - counts[a]);
    for (const key of adjustableKeys) {
      if (diff <= 0) break;
      const minAllowed = key === "doubleHung" ? 2 : 0;
      const available = Math.max(0, counts[key] - minAllowed);
      if (available <= 0) continue;
      const reduction = Math.min(available, diff);
      counts[key] -= reduction;
      diff -= reduction;
    }
  } else if (assigned < totalWindows) {
    counts.doubleHung += totalWindows - assigned;
  }

  return counts;
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
    multiplier += clampValue(diff / 900000, -0.08, 0.12);
  }

  if (housing?.medianYearBuilt) {
    if (housing.medianYearBuilt < 1960) {
      multiplier += 0.06;
    } else if (housing.medianYearBuilt > 2005) {
      multiplier -= 0.03;
    }
  }

  if (housing?.olderHomeShare) {
    multiplier += clampValue(housing.olderHomeShare * 0.08, 0, 0.08);
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

  return Number(clampValue(multiplier, 0.85, 1.35).toFixed(2));
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

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function extractComponent(components, type) {
  if (!Array.isArray(components)) return null;
  const match = components.find((component) => component.types?.includes(type));
  if (!match) return null;
  return match.long_name || match.short_name || match.longText || match.shortText || null;
}

async function analyzeStreetImagery(lat, lng) {
  try {
    const url = buildStreetViewImageUrl(lat, lng);
    if (!url) return null;
    const metrics = await inspectStreetView(url);
    return { ...metrics, url };
  } catch (error) {
    console.warn("Imagery analysis failed", error);
    return null;
  }
}

function buildStreetViewImageUrl(lat, lng, options = {}) {
  if (!GOOGLE_MAPS_API_KEY) return null;
  if (lat == null || lng == null) return null;
  const params = new URLSearchParams({
    size: "640x640",
    location: `${lat},${lng}`,
    heading: options.heading != null ? String(options.heading) : "220",
    pitch: options.pitch != null ? String(options.pitch) : "4",
    fov: options.fov != null ? String(options.fov) : "75",
    key: GOOGLE_MAPS_API_KEY,
  });
  if (options.source) {
    params.set("source", options.source);
  }
  return `https://maps.googleapis.com/maps/api/streetview?${params.toString()}`;
}

function buildStaticMapUrl(lat, lng, zoom = 18) {
  if (!GOOGLE_MAPS_API_KEY) return null;
  if (lat == null || lng == null) return null;
  const params = new URLSearchParams({
    center: `${lat},${lng}`,
    zoom: zoom != null ? String(zoom) : "18",
    size: "640x640",
    scale: "2",
    maptype: "satellite",
    markers: `color:0xA3E635|${lat},${lng}`,
    key: GOOGLE_MAPS_API_KEY,
  });
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}

function loadStreetViewImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      const maxSize = 360;
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      const width = Math.max(1, Math.round(img.width * scale));
      const height = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        reject(new Error("Canvas context unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      const imageData = ctx.getImageData(0, 0, width, height);
      const grey = new Float32Array(width * height);
      let brightnessSum = 0;
      for (let i = 0; i < grey.length; i += 1) {
        const idx = i * 4;
        const r = imageData.data[idx];
        const g = imageData.data[idx + 1];
        const b = imageData.data[idx + 2];
        const value = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        grey[i] = value;
        brightnessSum += value;
      }
      resolve({
        imageData,
        grey,
        width,
        height,
        brightness: brightnessSum / grey.length,
      });
    };
    img.onerror = () => reject(new Error("Street View imagery unavailable"));
    img.src = `${url}${url.includes("?") ? "&" : "?"}cacheBust=${Date.now()}`;
  });
}

async function inspectStreetView(url) {
  const { imageData, grey, width, height, brightness } = await loadStreetViewImage(url);
  const gridMetrics = computeGridMetrics(grey, width, height);
  let detection = null;
  try {
    detection = await detectWindowsWithOpenCv(imageData, width, height);
  } catch (error) {
    console.warn("OpenCV detection issue", error);
  }
  const combined = combineImageryMetrics(gridMetrics, detection);
  combined.brightness = Number((brightness || 0).toFixed(2));
  return combined;
}

function computeGridMetrics(grey, width, height) {
  const gridCols = 6;
  const gridRows = 6;
  const cellWidth = Math.max(3, Math.floor(width / gridCols));
  const cellHeight = Math.max(3, Math.floor(height / gridRows));
  let windowCells = 0;
  const floorProfile = new Array(gridRows).fill(0);
  const columnProfile = new Array(gridCols).fill(0);

  for (let row = 0; row < gridRows; row += 1) {
    for (let col = 0; col < gridCols; col += 1) {
      const xStart = col * cellWidth;
      const xEnd = col === gridCols - 1 ? width : Math.min(width, xStart + cellWidth);
      const yStart = row * cellHeight;
      const yEnd = row === gridRows - 1 ? height : Math.min(height, yStart + cellHeight);

      let intensity = 0;
      let edgeScore = 0;
      let pixels = 0;

      for (let y = yStart; y < yEnd; y += 1) {
        const rowOffset = y * width;
        for (let x = xStart; x < xEnd; x += 1) {
          const idx = rowOffset + x;
          const value = grey[idx];
          intensity += value;
          pixels += 1;
          if (x + 1 < xEnd) {
            edgeScore += Math.abs(value - grey[idx + 1]);
          }
          if (y + 1 < yEnd) {
            edgeScore += Math.abs(value - grey[idx + width]);
          }
        }
      }

      if (!pixels) continue;
      const avgIntensity = intensity / pixels;
      const edgeDensity = edgeScore / pixels;
      const looksLikeWindow = edgeDensity > 17 && avgIntensity > 35 && avgIntensity < 215;
      if (looksLikeWindow) {
        windowCells += 1;
        floorProfile[row] += 1;
        columnProfile[col] += 1;
      }
    }
  }

  const estimatedFloors = Math.max(1, floorProfile.filter((count) => count > 0).length || 1);
  const estimatedColumns = Math.max(2, columnProfile.filter((count) => count > 0).length || 2);
  let windowCount = windowCells;
  if (windowCount < estimatedFloors * estimatedColumns) {
    windowCount = estimatedFloors * estimatedColumns * 2;
  }
  windowCount = Math.round(windowCount * 1.1);
  windowCount = Math.max(6, Math.min(48, windowCount));
  const glassFactor = Math.min(1, windowCells / (gridCols * gridRows));

  return {
    windowCells,
    estimatedFloors,
    estimatedColumns,
    windowCount,
    glassFactor: Number(glassFactor.toFixed(2)),
  };
}

let openCvReadyPromise = null;

function ensureOpenCvReady() {
  if (window.cv && typeof window.cv.imread === "function") {
    return Promise.resolve();
  }
  if (!openCvReadyPromise) {
    openCvReadyPromise = new Promise((resolve, reject) => {
      const start = performance.now();
      const check = () => {
        if (window.cv && typeof window.cv.imread === "function") {
          resolve();
          return;
        }
        if (performance.now() - start > 15000) {
          reject(new Error("OpenCV failed to initialize"));
          return;
        }
        requestAnimationFrame(check);
      };
      check();
    }).catch((error) => {
      openCvReadyPromise = null;
      throw error;
    });
  }
  return openCvReadyPromise;
}

async function detectWindowsWithOpenCv(imageData, width, height) {
  await ensureOpenCvReady();
  if (!window.cv) return null;
  const cv = window.cv;
  const imageArea = width * height;
  const src = cv.matFromImageData(imageData);
  const rgb = new cv.Mat();
  cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);
  const gray = new cv.Mat();
  cv.cvtColor(rgb, gray, cv.COLOR_RGB2GRAY);
  const clahe = new cv.CLAHE(2.0, new cv.Size(8, 8));
  const equalized = new cv.Mat();
  clahe.apply(gray, equalized);
  const blurred = new cv.Mat();
  cv.GaussianBlur(equalized, blurred, new cv.Size(5, 5), 0);
  const edges = new cv.Mat();
  cv.Canny(blurred, edges, 60, 150);
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
  cv.dilate(edges, edges, kernel);
  cv.erode(edges, edges, kernel);
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  const rectangles = [];
  for (let i = 0; i < contours.size(); i += 1) {
    const contour = contours.get(i);
    const rect = cv.boundingRect(contour);
    contour.delete();
    const area = rect.width * rect.height;
    if (area < imageArea * 0.0015 || area > imageArea * 0.25) continue;
    if (rect.width < 14 || rect.height < 14) continue;
    const aspect = rect.width / rect.height;
    if (aspect < 0.35 || aspect > 5.0) continue;
    const duplicate = rectangles.some((existing) => intersectionOverUnion(existing, rect) > 0.4);
    if (duplicate) continue;
    rectangles.push({ ...rect, aspect });
  }

  clahe.delete();
  kernel.delete();
  edges.delete();
  blurred.delete();
  equalized.delete();
  gray.delete();
  rgb.delete();
  src.delete();
  hierarchy.delete();
  contours.delete();

  if (rectangles.length < 2) {
    return null;
  }

  const coverageArea = rectangles.reduce((sum, rect) => sum + rect.width * rect.height, 0);
  const glassFactor = clampValue(coverageArea / imageArea, 0, 1);

  const typeCounts = {
    doubleHung: 0,
    casement: 0,
    slider: 0,
    picture: 0,
    bay: 0,
  };

  rectangles.forEach((rect) => {
    const type = classifyWindowType(rect);
    if (typeCounts[type] != null) {
      typeCounts[type] += 1;
    }
  });

  const estimatedFloors = clampValue(Math.round(estimateBandCount(rectangles, 'y', height)), 1, 5);
  const estimatedColumns = clampValue(Math.round(estimateBandCount(rectangles, 'x', width)), 2, 12);
  const rawCount = rectangles.length;
  const coverage = coverageArea / (imageArea || 1);
  let confidence = 0.45 + coverage * 0.5 + Math.min(rawCount, 24) / 120;
  if (rawCount < 4) {
    confidence *= 0.7;
  }
  const windowConfidence = Number(clampValue(confidence, 0.25, 0.95).toFixed(2));

  return {
    rawCount,
    estimatedFloors,
    estimatedColumns,
    glassFactor: Number(glassFactor.toFixed(2)),
    windowTypes: typeCounts,
    windowConfidence,
  };
}

function combineImageryMetrics(grid, detection) {
  const combined = { ...grid };
  if (detection) {
    const detectionEstimate = Math.max(
      Math.round(detection.rawCount * 1.35),
      detection.estimatedFloors * detection.estimatedColumns * 1.8
    );
    const fallbackEstimate = Math.max(
      grid.windowCount,
      grid.estimatedFloors * grid.estimatedColumns * 2
    );
    combined.windowCount = clampValue(
      Math.round(detectionEstimate * 0.6 + fallbackEstimate * 0.4),
      6,
      64
    );
    combined.estimatedFloors = detection.estimatedFloors || grid.estimatedFloors;
    combined.estimatedColumns = detection.estimatedColumns || grid.estimatedColumns;
    if (typeof detection.glassFactor === "number") {
      combined.glassFactor = detection.glassFactor;
    }
    if (detection.windowTypes) {
      combined.windowTypes = detection.windowTypes;
    }
    combined.windowConfidence = detection.windowConfidence;
    combined.detectionCount = detection.rawCount;
  } else {
    combined.windowConfidence = 0.35;
  }
  combined.glassFactor = Number(clampValue(combined.glassFactor ?? 0, 0, 1).toFixed(2));
  return combined;
}

function estimateBandCount(rectangles, axis, dimension) {
  if (!rectangles.length) {
    return axis === 'y' ? 1 : 2;
  }
  const centers = rectangles
    .map((rect) => (axis === 'y' ? rect.y + rect.height / 2 : rect.x + rect.width / 2))
    .sort((a, b) => a - b);
  const averageSize =
    rectangles.reduce(
      (sum, rect) => sum + (axis === 'y' ? rect.height : rect.width),
      0
    ) / rectangles.length || (axis === 'y' ? dimension / 3 : dimension / 4);
  const threshold = Math.max(averageSize * 1.2, dimension * 0.08);
  const groups = [];
  centers.forEach((value) => {
    const current = groups[groups.length - 1];
    if (!current || value - current.center > threshold) {
      groups.push({ center: value, count: 1 });
    } else {
      current.count += 1;
      current.center = (current.center * (current.count - 1) + value) / current.count;
    }
  });
  return groups.length || (axis === 'y' ? 1 : 2);
}

function classifyWindowType(rect) {
  const aspect = rect.width / rect.height;
  if (aspect >= 2.6) return 'bay';
  if (aspect >= 1.6) return 'slider';
  if (aspect >= 1.1) return 'picture';
  if (aspect <= 0.6) return 'casement';
  return 'doubleHung';
}

function intersectionOverUnion(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (intersection <= 0) return 0;
  const union = a.width * a.height + b.width * b.height - intersection;
  return union > 0 ? intersection / union : 0;
}

function showAnalysisError(error) {
  if (state.analyzeInterval) {
    clearInterval(state.analyzeInterval);
    state.analyzeInterval = null;
  }
  progressBar.style.width = "0%";
  progressValue.textContent = "0%";
  analyzeMedia.style.backgroundImage = "";
  window.alert(
    "We ran into an issue retrieving imagery or NJ housing data. Please try another address or check your network configuration."
  );
  setTimeout(() => goto("address"), 200);
}

function sendQuote() {
  if (!contactConsent.checked) {
    window.alert("Please consent so we can send your quote.");
    return;
  }
  if (!contactPhone.value.trim() && !contactEmail.value.trim()) {
    window.alert("Please enter a phone number or email address.");
    return;
  }
  contactSuccess.classList.remove("hidden");
}

function setupEvents() {
  document.querySelector('[data-action="help"]').onclick = () => {
    window.alert("A showroom team member will assist you shortly.");
    resetIdleTimer();
  };

  document.querySelector('[data-action="zip-only"]').onclick = () => {
    zipToggle.classList.toggle("hidden");
    zipInput.focus();
    resetIdleTimer();
  };

  document.querySelector('[data-action="fill-sample"]').onclick = () => {
    zipInput.value = "07701";
    resetIdleTimer();
  };

  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });
  modal.querySelector('[data-action="close-modal"]').onclick = closeModal;

  backBtn.onclick = () => handleBack();

  document.addEventListener("pointerdown", resetIdleTimer);
  document.addEventListener("keydown", resetIdleTimer);

  contactConsent.addEventListener("change", () => {
    if (!contactConsent.checked) {
      contactSuccess.classList.add("hidden");
    }
  });

  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest(".input-group") && !event.target.closest(".autocomplete-list")) {
      autocompleteList.classList.remove("visible");
    }
  });

  addressInput.addEventListener("input", (event) => {
    state.place = null;
    state.selectedPrediction = null;
    updateSuggestions(event.target.value);
    updatePreview();
  });

  addressInput.addEventListener("focus", () => {
    if (state.predictions.length) {
      autocompleteList.classList.add("visible");
    }
  });
}

function init() {
  setupEvents();
  if (GOOGLE_MAPS_API_KEY) {
    googleMapsLoader.load().catch((error) => console.warn(error));
  } else {
    console.warn("Google Maps API key not provided. Address search will be limited.");
  }
  goto("intro");
  populateQuote();
  updatePreview();
}

init();
