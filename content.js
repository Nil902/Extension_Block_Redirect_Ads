(() => {
  "use strict";

  const frameSite = normalizeHost(location.hostname);
  const site = getProtectionSite();
  let state = {
    enabled: true,
    site,
    blockPageAds: true,
    skipVideoAds: true,
    allowedDomains: []
  };
  let toastTimer;
  let adPassScheduled = false;
  let cosmeticScanActive = false;
  let pageAdReportSent = false;
  let lastNetworkAdReport = 0;
  const hiddenAdElements = new Set();
  const clickedSkipControls = new WeakMap();
  const fastForwardedVideos = new WeakMap();
  const COSMETIC_STYLE_ID = "video-redirect-blocker-cosmetic-style";
  const KNOWN_SKIP_SELECTORS = [
    ".ytp-ad-skip-button",
    ".ytp-ad-skip-button-modern",
    ".videoAdUiSkipButton",
    ".ima-ad-container button",
    ".jw-skip",
    ".jw-skip-button",
    ".vjs-ad-skip-button",
    ".vast-skip-button",
    ".vast-skip-button-container",
    "button[aria-label*='skip' i]",
    "[class*='skip-ad' i]",
    "[class*='skip_ad' i]",
    "[class*='skipButton' i]",
    "[id*='skip-ad' i]",
    "[data-testid*='skip' i]"
  ].join(",");
  const AD_STATE_SELECTORS = [
    ".ad-showing",
    ".vjs-ad-playing",
    ".jw-flag-ads",
    ".ima-ad-container",
    ".jw-ad",
    ".vast-container",
    ".video-ad-container",
    "[class*='ad-showing' i]",
    "[class*='ad-playing' i]",
    "[class*='ad_playing' i]",
    "[data-ad-state='playing']",
    "[data-ad-status='playing']"
  ].join(",");
  const COSMETIC_SELECTORS = [
    "[data-vrb-hidden-ad='true']",
    "ins.adsbygoogle",
    "[id^='google_ads_']",
    "[id^='div-gpt-ad-']",
    "[id^='ad_']",
    "[id^='ads_']",
    "[id*='ad-slot' i]",
    "[id*='adslot' i]",
    "[id*='ad-container' i]",
    "[id*='ad_container' i]",
    "[id*='advertisement' i]",
    "[class~='ad']",
    "[class~='ads']",
    "[class~='advert']",
    "[class~='advertisement']",
    "[class*='ad-slot' i]",
    "[class*='adslot' i]",
    ".ad-banner",
    ".ads-banner",
    ".banner-ad",
    ".ad-container:not(.ad-showing):not(.video-ad-container)",
    ".ads-container",
    ".ad-wrapper",
    ".ads-wrapper",
    ".adbox",
    ".advertisement",
    ".sponsored-ad",
    ".sticky-ad",
    ".popup-ad",
    ".video-ad-overlay",
    "[data-ad-client]",
    "[data-ad-slot]",
    "[data-ad-unit]",
    "[data-adunit]",
    "[data-ad-id]",
    "[data-google-query-id]",
    "[data-testid*='advert' i]",
    "[aria-label*='advertisement' i]",
    "[aria-label*='sponsored' i]",
    "iframe[title*='advertisement' i]",
    "iframe[src*='doubleclick.net']",
    "iframe[src*='googlesyndication.com']",
    "iframe[src*='adnxs.com']",
    "iframe[src*='taboola.com']",
    "iframe[src*='outbrain.com']",
    "iframe[src*='/ads/' i]",
    "iframe[src*='/advert' i]"
  ];
  const COSMETIC_CSS = `
    ${COSMETIC_SELECTORS.join(",\n") } {
      display: none !important;
      visibility: hidden !important;
      min-height: 0 !important;
      max-height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
    }
  `;
  const AD_ATTRIBUTE_PATTERN = /(?:^|[\s:_-])(?:ad|ads|advert|advertisement|advertising|sponsor|sponsored|promoted|adslot|adunit|adbox|adwrap|adwrapper)(?=$|[\s:_-]|\d)/i;
  const AD_TEXT_PATTERN = /^\s*(?:advertisement|sponsored|promoted|ad\s*[:·-]|ads? by)\b/i;
  const AD_URL_PATTERN = /(?:doubleclick|googlesyndication|adnxs|taboola|outbrain|(?:^|[\/?&=._-])(?:ads?|vast|vpaid|prebid|preroll|adserver|adservice)(?:$|[\/?&=._-]))/i;
  const SKIP_TEXT_PATTERN = /(?:\bskip(?: this)?(?: ad| ads| advertisement| commercial)?\b|\bcontinue to (?:video|content)\b|\bclose ad\b|saltar (?:anuncio|publicidad)|omitir anuncio|ignorer (?:l['’])?annonce|passer (?:l['’])?annonce|werbung überspringen|pular anúncio|lewati iklan|bỏ qua quảng cáo|ข้ามโฆษณา|រំលង)/i;

  function normalizeHost(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/^www\./, "")
      .replace(/^\.+|\.+$/g, "");
  }

  function getProtectionSite() {
    try {
      const origins = location.ancestorOrigins;
      if (origins?.length) {
        const topOrigin = origins[origins.length - 1];
        return normalizeHost(new URL(topOrigin).hostname);
      }
    } catch {
      // Fall back to this frame when the top origin is unavailable.
    }

    return frameSite;
  }

  function sameOrSubdomain(host, domain) {
    return host === domain || host.endsWith(`.${domain}`);
  }

  function shouldBlock(urlValue) {
    if (!state.enabled || !urlValue) {
      return false;
    }

    try {
      const url = new URL(String(urlValue), location.href);
      if (!["http:", "https:"].includes(url.protocol)) {
        return false;
      }

      const destination = normalizeHost(url.hostname);
      if (
        sameOrSubdomain(destination, state.site) ||
        sameOrSubdomain(destination, frameSite)
      ) {
        return false;
      }

      return !state.allowedDomains.some((domain) =>
        sameOrSubdomain(destination, normalizeHost(domain))
      );
    } catch {
      return true;
    }
  }

  function publishConfig() {
    window.dispatchEvent(
      new CustomEvent("video-redirect-blocker:config", {
        detail: {
          enabled: state.enabled,
          site: state.site,
          blockPageAds: state.blockPageAds,
          skipVideoAds: state.skipVideoAds,
          allowedDomains: [...new Set([...state.allowedDomains, frameSite])]
        }
      })
    );
  }

  function applyCosmeticFiltering() {
    const existing = document.getElementById(COSMETIC_STYLE_ID);
    if (!state.enabled || !state.blockPageAds) {
      existing?.remove();
      hiddenAdElements.forEach((element) => {
        element.removeAttribute("data-vrb-hidden-ad");
      });
      hiddenAdElements.clear();
      cosmeticScanActive = false;
      pageAdReportSent = false;
      return;
    }

    if (existing) {
      return;
    }

    const style = document.createElement("style");
    style.id = COSMETIC_STYLE_ID;
    style.textContent = COSMETIC_CSS;
    (document.head || document.documentElement)?.appendChild(style);
    cosmeticScanActive = true;
    scanForPageAds(document);
  }

  function looksLikePageAd(element) {
    if (
      !(element instanceof HTMLElement) ||
      element.id === "video-redirect-blocker-toast" ||
      ["HTML", "BODY", "MAIN"].includes(element.tagName)
    ) {
      return false;
    }

    if (element instanceof HTMLIFrameElement && AD_URL_PATTERN.test(element.src)) {
      return true;
    }

    const fingerprint = [
      element.id,
      element.className,
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("data-testid"),
      element.getAttribute("data-ad"),
      element.getAttribute("data-ad-unit")
    ]
      .filter((value) => typeof value === "string")
      .join(" ");
    const text = (element.innerText || element.textContent || "").slice(0, 160);
    const attributeMatch = AD_ATTRIBUTE_PATTERN.test(fingerprint);
    const textMatch = AD_TEXT_PATTERN.test(text);

    if (!attributeMatch && !textMatch) {
      return false;
    }

    if (
      element.querySelector("video") &&
      !/(?:video[-_ ]?ad|ima|vast|advert)/i.test(fingerprint) &&
      !textMatch
    ) {
      return false;
    }

    const bounds = element.getBoundingClientRect();
    const coversMostOfPage =
      bounds.width > innerWidth * 0.85 && bounds.height > innerHeight * 0.7;
    return !coversMostOfPage || textMatch || element instanceof HTMLIFrameElement;
  }

  function scanForPageAds(root) {
    if (!state.enabled || !state.blockPageAds || !root) {
      return;
    }

    const candidates = [];
    if (root instanceof Element) {
      candidates.push(root);
    }
    if (typeof root.querySelectorAll === "function") {
      candidates.push(
        ...root.querySelectorAll(
          "div[id], div[class], aside[id], aside[class], section[id], section[class], iframe[src], [data-ad], [data-ad-unit], [data-adunit], [data-testid], [aria-label]"
        )
      );
    }

    let hiddenCount = 0;
    for (const element of candidates) {
      if (
        hiddenAdElements.has(element) ||
        element.matches(AD_STATE_SELECTORS) ||
        !looksLikePageAd(element)
      ) {
        continue;
      }

      element.setAttribute("data-vrb-hidden-ad", "true");
      hiddenAdElements.add(element);
      hiddenCount += 1;
    }

    if (hiddenCount && !pageAdReportSent) {
      pageAdReportSent = true;
      reportAdAction("Removed webpage ads", "page ads hidden");
    }
  }

  function isVisible(element) {
    if (!(element instanceof HTMLElement) || element.getClientRects().length === 0) {
      return false;
    }

    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  function controlLabel(element) {
    return [
      element.textContent,
      element.getAttribute("aria-label"),
      element.getAttribute("title")
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isSkipControl(element) {
    const label = controlLabel(element);
    const insideAd = Boolean(element.closest(AD_STATE_SELECTORS));
    const knownControl = element.matches(KNOWN_SKIP_SELECTORS);

    return SKIP_TEXT_PATTERN.test(label) &&
      (insideAd || knownControl) &&
      !element.matches(":disabled, [aria-disabled='true']");
  }

  function reportAdAction(message, kind) {
    showToastMessage(message);
    chrome.runtime
      .sendMessage({
        type: "record-block",
        site: state.site,
        url: location.href,
        kind
      })
      .catch(() => {});
  }

  function skipRecognizedVideoAds() {
    if (!state.enabled || !state.skipVideoAds) {
      return;
    }

    const candidates = new Set(document.querySelectorAll(KNOWN_SKIP_SELECTORS));
    document.querySelectorAll(AD_STATE_SELECTORS).forEach((container) => {
      container
        .querySelectorAll("button, [role='button'], a")
        .forEach((element) => candidates.add(element));
    });

    for (const control of candidates) {
      const lastClicked = clickedSkipControls.get(control) || 0;
      if (
        Date.now() - lastClicked < 5000 ||
        !isVisible(control) ||
        !isSkipControl(control)
      ) {
        continue;
      }

      clickedSkipControls.set(control, Date.now());
      control.click();
      reportAdAction("Skipped a video ad", "video ad skipped");
      return;
    }

    document.querySelectorAll("video").forEach((video) => {
      const player = video.closest(
        "[class*='player' i], [id*='player' i], .video-js, .jwplayer"
      ) || video.parentElement;
      const nearbyAdMarker = player?.matches(AD_STATE_SELECTORS)
        ? player
        : player?.querySelector(AD_STATE_SELECTORS);
      const adState = Boolean(
        video.closest(AD_STATE_SELECTORS) ||
        (nearbyAdMarker && isVisible(nearbyAdMarker))
      );
      const adKey = `${video.currentSrc || video.src}|${video.duration}`;

      if (!adState) {
        fastForwardedVideos.delete(video);
        return;
      }

      if (
        fastForwardedVideos.get(video) === adKey ||
        !Number.isFinite(video.duration) ||
        video.duration <= 0 ||
        video.duration > 600
      ) {
        return;
      }

      try {
        fastForwardedVideos.set(video, adKey);
        video.muted = true;
        video.playbackRate = 16;
        video.currentTime = Math.max(0, video.duration - 0.05);
        reportAdAction("Fast-forwarded a video ad", "video ad fast-forwarded");
      } catch {
        fastForwardedVideos.delete(video);
      }
    });
  }

  function runAdPass() {
    adPassScheduled = false;
    applyCosmeticFiltering();
    skipRecognizedVideoAds();
  }

  function scheduleAdPass() {
    if (adPassScheduled) {
      return;
    }

    adPassScheduled = true;
    requestAnimationFrame(runAdPass);
  }

  function syncTabProtection() {
    if (window !== window.top) {
      return;
    }

    chrome.runtime
      .sendMessage({
        type: "sync-tab-protection",
        url: location.href
      })
      .catch(() => {});
  }

  function showToastMessage(message) {
    const oldToast = document.getElementById("video-redirect-blocker-toast");
    oldToast?.remove();
    const toast = document.createElement("div");
    toast.id = "video-redirect-blocker-toast";
    toast.setAttribute("role", "status");
    toast.style.cssText = [
      "position:fixed",
      "right:18px",
      "bottom:18px",
      "z-index:2147483647",
      "max-width:340px",
      "padding:12px 14px",
      "border:1px solid rgba(255,255,255,.16)",
      "border-radius:12px",
      "background:#12161f",
      "box-shadow:0 14px 42px rgba(0,0,0,.45)",
      "color:#f7f8fa",
      "font:600 13px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
      "letter-spacing:.01em"
    ].join(";");
    toast.textContent = message;
    (document.documentElement || document.body).appendChild(toast);

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.remove(), 3200);
  }

  function showRedirectToast(urlValue) {
    const destination = (() => {
      try {
        return new URL(urlValue, location.href).hostname || "another page";
      } catch {
        return "another page";
      }
    })();
    showToastMessage(`Blocked an ad redirect to ${destination}`);
  }

  function recordBlock(url, kind) {
    showRedirectToast(url);
    chrome.runtime
      .sendMessage({
        type: "record-block",
        site: state.site,
        url,
        kind
      })
      .catch(() => {});
  }

  function stopNavigation(event, url, kind) {
    if (!shouldBlock(url)) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    recordBlock(url, kind);
  }

  function handleLinkEvent(event) {
    if (!state.enabled || event.defaultPrevented) {
      return;
    }

    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    const anchor = path.find((node) => node instanceof HTMLAnchorElement) ||
      (event.target instanceof Element ? event.target.closest("a[href]") : null);

    if (anchor?.href) {
      stopNavigation(event, anchor.href, "external link");
    }
  }

  document.addEventListener("click", handleLinkEvent, true);
  document.addEventListener("auxclick", handleLinkEvent, true);
  document.addEventListener(
    "submit",
    (event) => {
      if (event.target instanceof HTMLFormElement) {
        stopNavigation(event, event.target.action, "form redirect");
      }
    },
    true
  );

  window.addEventListener("video-redirect-blocker:blocked", (event) => {
    if (!state.enabled) {
      return;
    }

    const detail = event.detail || {};
    if (detail.kind === "ad request") {
      if (Date.now() - lastNetworkAdReport > 2500) {
        lastNetworkAdReport = Date.now();
        reportAdAction("Blocked an ad request", "ad request");
      }
      return;
    }
    recordBlock(detail.url || "", detail.kind || "popup");
  });

  const adObserver = new MutationObserver((mutations) => {
    if (cosmeticScanActive) {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element) {
            scanForPageAds(node);
          }
        });
      });
    }
    scheduleAdPass();
  });
  adObserver.observe(document, { childList: true, subtree: true });
  setInterval(skipRecognizedVideoAds, 750);

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes.protectedSites) {
      return;
    }

    const config = (changes.protectedSites.newValue || {})[site] || {};
    state = {
      enabled: config.enabled !== false,
      site,
      blockPageAds: config.blockPageAds !== false,
      skipVideoAds: config.skipVideoAds !== false,
      allowedDomains: Array.isArray(config.allowedDomains)
        ? config.allowedDomains
        : []
    };
    publishConfig();
    syncTabProtection();
    scheduleAdPass();
  });

  publishConfig();
  scheduleAdPass();
  syncTabProtection();

  chrome.runtime
    .sendMessage({ type: "get-state", host: site })
    .then((response) => {
      if (!response?.ok) {
        return;
      }

      state = response.state;
      publishConfig();
      syncTabProtection();
      scheduleAdPass();
    })
    .catch(() => {});
})();
