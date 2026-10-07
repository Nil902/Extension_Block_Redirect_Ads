const controls = document.getElementById("controls");
const unsupported = document.getElementById("unsupported");
const siteName = document.getElementById("site-name");
const siteToggle = document.getElementById("site-toggle");
const statusCopy = document.getElementById("status-copy");
const siteCount = document.getElementById("site-count");
const totalCount = document.getElementById("total-count");
const pageAdsToggle = document.getElementById("page-ads-toggle");
const videoAdsToggle = document.getElementById("video-ads-toggle");
const allowForm = document.getElementById("allow-form");
const allowInput = document.getElementById("allow-input");
const allowList = document.getElementById("allow-list");
const emptyList = document.getElementById("empty-list");
const formError = document.getElementById("form-error");

let currentSite = "";
let currentState = {
  enabled: true,
  blockPageAds: true,
  skipVideoAds: true,
  allowedDomains: []
};

function normalizeHost(value) {
  const input = String(value || "").trim();
  if (!input) {
    return "";
  }

  try {
    const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(input)
      ? input
      : `https://${input}`;
    return new URL(withScheme).hostname
      .toLowerCase()
      .replace(/^www\./, "")
      .replace(/^\.+|\.+$/g, "");
  } catch {
    return "";
  }
}

function renderStatus() {
  siteToggle.checked = currentState.enabled;
  statusCopy.textContent = currentState.enabled
    ? "Protection is active"
    : "Protection is off";
  statusCopy.classList.toggle("on", currentState.enabled);
  pageAdsToggle.checked = currentState.blockPageAds !== false;
  videoAdsToggle.checked = currentState.skipVideoAds !== false;
}

async function saveOptions() {
  pageAdsToggle.disabled = true;
  videoAdsToggle.disabled = true;
  formError.textContent = "";

  try {
    const response = await send({
      type: "set-options",
      host: currentSite,
      blockPageAds: pageAdsToggle.checked,
      skipVideoAds: videoAdsToggle.checked
    });
    currentState = response.state;
  } catch (error) {
    formError.textContent = error.message;
  } finally {
    pageAdsToggle.disabled = false;
    videoAdsToggle.disabled = false;
    renderStatus();
  }
}

function renderAllowList() {
  allowList.replaceChildren();
  const domains = currentState.allowedDomains || [];
  emptyList.classList.toggle("hidden", domains.length > 0);

  domains.forEach((domain) => {
    const item = document.createElement("li");
    const label = document.createElement("span");
    const removeButton = document.createElement("button");
    label.textContent = domain;
    removeButton.type = "button";
    removeButton.textContent = "×";
    removeButton.setAttribute("aria-label", `Stop allowing ${domain}`);
    removeButton.addEventListener("click", () => removeAllowedDomain(domain));
    item.append(label, removeButton);
    allowList.appendChild(item);
  });
}

async function send(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) {
    throw new Error(response?.error || "The extension could not save that change.");
  }
  return response;
}

async function saveAllowedDomains(domains) {
  const response = await send({
    type: "set-allowed-domains",
    host: currentSite,
    allowedDomains: domains
  });
  currentState = response.state;
  renderAllowList();
}

async function removeAllowedDomain(domain) {
  formError.textContent = "";
  try {
    await saveAllowedDomains(
      currentState.allowedDomains.filter((item) => item !== domain)
    );
  } catch (error) {
    formError.textContent = error.message;
  }
}

siteToggle.addEventListener("change", async () => {
  const requestedState = siteToggle.checked;
  siteToggle.disabled = true;
  formError.textContent = "";

  try {
    const response = await send({
      type: "set-enabled",
      host: currentSite,
      enabled: requestedState
    });
    currentState = response.state;
  } catch (error) {
    siteToggle.checked = !requestedState;
    formError.textContent = error.message;
  } finally {
    siteToggle.disabled = false;
    renderStatus();
  }
});

pageAdsToggle.addEventListener("change", saveOptions);
videoAdsToggle.addEventListener("change", saveOptions);

allowForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  formError.textContent = "";
  const domain = normalizeHost(allowInput.value);

  if (!domain) {
    formError.textContent = "Enter a valid domain, such as example.com.";
    return;
  }

  if (domain === currentSite || domain.endsWith(`.${currentSite}`)) {
    formError.textContent = "This website is already allowed.";
    return;
  }

  if (currentState.allowedDomains.includes(domain)) {
    formError.textContent = "That domain is already in the list.";
    return;
  }

  try {
    await saveAllowedDomains([...currentState.allowedDomains, domain]);
    allowInput.value = "";
  } catch (error) {
    formError.textContent = error.message;
  }
});

async function initialize() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  try {
    const url = new URL(tab?.url || "");
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("Unsupported page");
    }
    currentSite = normalizeHost(url.hostname);
  } catch {
    siteName.textContent = "Chrome internal page";
    unsupported.classList.remove("hidden");
    return;
  }

  siteName.textContent = currentSite;
  controls.classList.remove("hidden");

  try {
    const response = await send({ type: "get-state", host: currentSite });
    currentState = response.state;
    siteCount.textContent = response.stats.siteTotal.toLocaleString();
    totalCount.textContent = response.stats.total.toLocaleString();
    renderStatus();
    renderAllowList();
  } catch (error) {
    formError.textContent = error.message;
  }
}

initialize();
