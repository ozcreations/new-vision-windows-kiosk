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
    primary: { label: "Text Me This Quote", action: () => goto("contact", "text") },
    secondary: { label: "Email Me", action: () => goto("contact", "email") },
    tertiary: { label: "Schedule a Visit", action: () => alert("A specialist will reach out shortly!") },
  },
  contact: {
    primary: { label: "Send My Quote", action: sendQuote },
    secondary: { label: "Back to estimate", action: () => goto("quote") },
  },
};

const SAMPLE_ADDRESSES = [
  "25 Maple Ave, Red Bank, NJ 07701",
  "120 Ocean Ave, Long Branch, NJ 07740",
  "85 Broad St, Red Bank, NJ 07701",
  "301 Shrewsbury Ave, Red Bank, NJ 07701",
];

const ESTIMATE = {
  address: "",
  zip: "07701",
  counts: [
    { type: "Double-Hung", qty: 10, unit: 650 },
    { type: "Casement", qty: 4, unit: 850 },
    { type: "Slider", qty: 2, unit: 700 },
    { type: "Picture", qty: 1, unit: 900 },
    { type: "Bay/Bow", qty: 1, unit: 2500 },
  ],
  zipMultiplier: 1.03,
};

let activeScreen = "intro";
let idleTimer = null;
let analyzeTimer = null;
let contactPreference = null;

const app = document.querySelector(".app");
const screens = Array.from(document.querySelectorAll(".screen"));
const primaryBtn = document.querySelector('[data-action="primary"]');
const secondaryBtn = document.querySelector('[data-action="secondary"]');
const ctaGroup = document.getElementById("cta-group");
const backBtn = document.querySelector('[data-action="back"]');
const modal = document.getElementById("modal");
const addressInput = document.getElementById("address-input");
const zipWrap = document.getElementById("zip-input-wrap");
const zipInput = document.getElementById("zip-input");
const autocomplete = document.getElementById("autocomplete");
const analyzeAddress = document.getElementById("analyze-address");
const analyzeMedia = document.getElementById("analyze-media");
const analyzeSteps = document.getElementById("analyze-steps");
const progressBar = document.getElementById("progress-bar");
const progressValue = document.getElementById("progress-value");
const totalWindows = document.getElementById("total-windows");
const priceRange = document.getElementById("price-range");
const itemList = document.getElementById("item-list");
const contactConsent = document.getElementById("contact-consent");
const contactSuccess = document.getElementById("contact-success");
const contactPhone = document.getElementById("contact-phone");
const contactEmail = document.getElementById("contact-email");
const contactIntro = document.querySelector(".contact-intro");
const previewMap = document.getElementById("preview-map");

function goto(screen, data) {
  if (!SCREENS.includes(screen)) return;
  app.dataset.screen = screen;
  activeScreen = screen;
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

  const tertiaryExisting = ctaGroup.querySelector(".tertiary");
  if (tertiaryExisting) tertiaryExisting.remove();

  if (config.secondary && config.secondary.label) {
    secondaryBtn.style.display = "inline-flex";
    secondaryBtn.textContent = config.secondary.label;
    secondaryBtn.onclick = () => {
      config.secondary.action(data);
      resetIdleTimer();
    };
    secondaryBtn.disabled = !!config.secondary.disabled;
  } else {
    secondaryBtn.style.display = "none";
    secondaryBtn.disabled = false;
  }

  if (config.primary && config.primary.label) {
    primaryBtn.style.display = "inline-flex";
    primaryBtn.textContent = config.primary.label;
    primaryBtn.onclick = () => {
      config.primary.action(data);
      resetIdleTimer();
    };
    primaryBtn.disabled = !!config.primary.disabled;
  } else {
    primaryBtn.style.display = "none";
    primaryBtn.disabled = false;
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
  const idx = SCREENS.indexOf(activeScreen);
  if (idx > 0) {
    goto(SCREENS[idx - 1]);
  }
}

function handleContactPref(pref) {
  contactPreference = pref || null;
  contactSuccess.classList.add("hidden");
  contactPhone.classList.remove("emphasis");
  contactEmail.classList.remove("emphasis");
  if (contactPreference === "text") {
    contactIntro.textContent =
      "We’ll text a secure link to this quote. Add email if you’d like both.";
    contactPhone.classList.add("emphasis");
    contactPhone.focus();
  } else if (contactPreference === "email") {
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
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => goto("intro"), 30_000);
}

function handleFindHome() {
  const address = addressInput.value.trim();
  const zip = zipInput.value.trim();
  if (!address && !zip) {
    addressInput.focus();
    addressInput.classList.add("shake");
    setTimeout(() => addressInput.classList.remove("shake"), 600);
    return;
  }

  ESTIMATE.address = address || `ZIP ${zip}`;
  ESTIMATE.zip = zip || (address.match(/(\d{5})$/) || [null, "07701"])[1];

  updatePreview(ESTIMATE.address);

  startAnalysis();
}

function startAnalysis() {
  goto("analyzing");
  analyzeAddress.textContent = ESTIMATE.address;
  analyzeMedia.style.backgroundImage =
    "url('https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=900&q=80')";

  const steps = Array.from(analyzeSteps.querySelectorAll(".step"));
  steps.forEach((step) => step.classList.remove("complete", "active"));
  steps[0].classList.add("active");
  let progress = 0;
  progressBar.style.width = "0%";
  progressValue.textContent = "0%";

  if (analyzeTimer) clearInterval(analyzeTimer);
  analyzeTimer = setInterval(() => {
    progress = Math.min(progress + Math.floor(Math.random() * 18) + 12, 100);
    progressBar.style.width = `${progress}%`;
    progressValue.textContent = `${progress}%`;

    const stepIndex = Math.min(
      Math.floor(progress / 25),
      steps.length - 1
    );
    steps.forEach((step, index) => {
      step.classList.toggle("active", index === stepIndex);
      step.classList.toggle("complete", index < stepIndex);
    });

    if (progress >= 100) {
      clearInterval(analyzeTimer);
      setTimeout(() => {
        buildQuote();
        goto("quote");
      }, 400);
    }
  }, 650);
}

function buildQuote() {
  const totalQty = ESTIMATE.counts.reduce((sum, item) => sum + item.qty, 0);
  totalWindows.textContent = totalQty.toString();
  const totals = ESTIMATE.counts.map((item) =>
    Math.round(item.qty * item.unit * ESTIMATE.zipMultiplier)
  );
  const subtotal = totals.reduce((sum, value) => sum + value, 0);
  const low = (subtotal * 0.92).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  });
  const high = (subtotal * 1.04).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  });
  priceRange.textContent = `${low} – ${high}`;

  itemList.innerHTML = "";
  const icons = {
    "Double-Hung": "🏠",
    Casement: "🪟",
    Slider: "↔️",
    Picture: "🖼️",
    "Bay/Bow": "🌅",
  };

  ESTIMATE.counts.forEach((item, index) => {
    const li = document.createElement("li");
    li.className = "item-row";
    const total = totals[index];
    li.innerHTML = `
      <div class="item-info">
        <div class="item-icon">${icons[item.type] || "🪟"}</div>
        <div class="item-details">
          <span class="item-title">${item.type}</span>
          <span class="item-qty">×${item.qty} — ~${formatCurrency(
            item.unit * ESTIMATE.zipMultiplier
          )}</span>
        </div>
      </div>
      <div class="item-price">${formatCurrency(total)}</div>
    `;
    itemList.appendChild(li);
  });
}

function formatCurrency(value) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  });
}

function sendQuote() {
  if (!contactConsent.checked) {
    alert("Please consent so we can send your quote.");
    return;
  }
  if (!contactPhone.value.trim() && !contactEmail.value.trim()) {
    alert("Please enter a phone number or email address.");
    return;
  }
  contactSuccess.classList.remove("hidden");
}

function setupAutocomplete() {
  addressInput.addEventListener("focus", () => showAutocomplete(""));
  addressInput.addEventListener("input", (event) => {
    showAutocomplete(event.target.value);
  });
}

function showAutocomplete(value) {
  const term = value.toLowerCase();
  const suggestions = SAMPLE_ADDRESSES.filter((item) =>
    item.toLowerCase().includes(term)
  );
  if (!term) suggestions.unshift(SAMPLE_ADDRESSES[0]);
  if (suggestions.length === 0) {
    autocomplete.classList.remove("visible");
    return;
  }
  autocomplete.innerHTML = "";
  suggestions.slice(0, 4).forEach((address) => {
    const item = document.createElement("div");
    item.className = "autocomplete-item";
    item.textContent = address;
    item.onclick = () => {
      addressInput.value = address;
      autocomplete.classList.remove("visible");
      updatePreview(address);
    };
    autocomplete.appendChild(item);
  });
  autocomplete.classList.add("visible");
}

function updatePreview(address) {
  if (!address) {
    previewMap.textContent = "Preview";
    previewMap.style.backgroundImage = "";
    previewMap.style.color = "rgba(255, 255, 255, 0.7)";
    previewMap.innerHTML = "Preview";
    return;
  }

  previewMap.innerHTML = "";
  previewMap.style.color = "transparent";
  previewMap.style.backgroundImage =
    "url('https://images.unsplash.com/photo-1507089947368-19c1da9775ae?auto=format&fit=crop&w=600&q=80')";
  const badge = document.createElement("div");
  badge.className = "preview-badge";
  badge.textContent = address;
  previewMap.appendChild(badge);
}

function setupEvents() {
  document.querySelector('[data-action="help"]').onclick = () => {
    alert("A showroom team member will assist you shortly.");
    resetIdleTimer();
  };

  document.querySelector('[data-action="zip-only"]').onclick = () => {
    zipWrap.classList.toggle("hidden");
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
      autocomplete.classList.remove("visible");
    }
  });
}

function init() {
  setupAutocomplete();
  setupEvents();
  goto("intro");
  buildQuote();
  updatePreview();
}

init();
