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
};

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

const api = {
  async autocomplete(input) {
    if (!input || input.length < 3) return [];
    const response = await fetch(`/api/autocomplete?input=${encodeURIComponent(input)}`);
    if (!response.ok) throw new Error('Autocomplete failed');
    const data = await response.json();
    return data.predictions || [];
  },
  async placeDetails(placeId) {
    const response = await fetch(`/api/place-details?placeId=${encodeURIComponent(placeId)}`);
    if (!response.ok) throw new Error('Place lookup failed');
    return response.json();
  },
  async quote(params) {
    const query = new URLSearchParams(params).toString();
    const response = await fetch(`/api/quote?${query}`);
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  },
};

const updateSuggestions = debounce(async (value) => {
  try {
    if (!value || value.trim().length < 3) {
      state.predictions = [];
      renderAutocomplete();
      return;
    }
    const predictions = await api.autocomplete(value.trim());
    state.predictions = predictions;
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
  state.selectedPrediction = prediction;
  try {
    const place = await api.placeDetails(prediction.place_id);
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

  const img = new Image();
  const mapUrl = `/api/maps/static?lat=${location.lat}&lng=${location.lng}&zoom=18`;
  img.alt = "Map preview";
  img.src = mapUrl;
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

async function analyzeStreetImagery(lat, lng) {
  try {
    const url = buildStreetViewUrl(lat, lng);
    const metrics = await inspectStreetView(url);
    return { ...metrics, url };
  } catch (error) {
    console.warn("Imagery analysis failed", error);
    return null;
  }
}

function buildStreetViewUrl(lat, lng) {
  const params = new URLSearchParams({
    lat: lat.toString(),
    lng: lng.toString(),
    heading: "220",
    pitch: "4",
  });
  return `/api/maps/streetview?${params.toString()}`;
}

function inspectStreetView(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      const maxSize = 320;
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
      const brightness = brightnessSum / grey.length;
      const metrics = computeWindowMetrics(grey, width, height);
      resolve({
        ...metrics,
        brightness: Number(brightness.toFixed(2)),
      });
    };
    img.onerror = () => reject(new Error("Street View imagery unavailable"));
    img.src = `${url}${url.includes("?") ? "&" : "?"}cacheBust=${Date.now()}`;
  });
}

function computeWindowMetrics(grey, width, height) {
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
  goto("intro");
  populateQuote();
  updatePreview();
}

init();
