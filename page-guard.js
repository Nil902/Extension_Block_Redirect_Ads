(() => {
  "use strict";

  if (window.__videoRedirectBlockerInstalled) {
    return;
  }

  Object.defineProperty(window, "__videoRedirectBlockerInstalled", {
    value: true,
    configurable: false
  });

  let config = {
    enabled: true,
    site: "",
    blockPageAds: true,
    skipVideoAds: true,
    allowedDomains: []
  };
  const AD_HOST_PATTERN = /(?:^|\.)(?:2mdn|adnxs|adsrvr|adservice\.google|amazon-adsystem|casalemedia|criteo|doubleclick|exoclick|exosrv|googleadservices|googlesyndication|openx|outbrain|popads|popcash|propellerads|pubmatic|revcontent|rubiconproject|smartadserver|taboola|trafficjunky|yieldmo)\.(?:com|net|tv)$/i;
  const AD_PATH_PATTERN = /(?:^|[\/?&=._-])(?:vast|vpaid|prebid|preroll|midroll|adserver|adservice|adtag|adunit|adslot|adsystem|advertisement)(?:$|[\/?&=._-])/i;

  function normalizeHost(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/^www\./, "")
      .replace(/^\.+|\.+$/g, "");
  }

  function sameOrSubdomain(host, domain) {
    return host === domain || host.endsWith(`.${domain}`);
  }

  function shouldBlock(urlValue) {
    if (!config.enabled || !urlValue) {
      return false;
    }

    try {
      const url = new URL(String(urlValue), location.href);
      if (!["http:", "https:"].includes(url.protocol)) {
        return false;
      }

      const destination = normalizeHost(url.hostname);
      const source = normalizeHost(config.site || location.hostname);
      if (sameOrSubdomain(destination, source)) {
        return false;
      }

      return !config.allowedDomains.some((domain) =>
        sameOrSubdomain(destination, normalizeHost(domain))
      );
    } catch {
      return true;
    }
  }

  function isAdRequest(urlValue) {
    if (!config.enabled || !config.blockPageAds || !urlValue) {
      return false;
    }

    try {
      const url = new URL(String(urlValue), location.href);
      return AD_HOST_PATTERN.test(url.hostname) ||
        AD_PATH_PATTERN.test(`${url.pathname}${url.search}`);
    } catch {
      return false;
    }
  }

  function report(url, kind) {
    window.dispatchEvent(
      new CustomEvent("video-redirect-blocker:blocked", {
        detail: {
          url: String(url || ""),
          kind
        }
      })
    );
  }

  window.addEventListener("video-redirect-blocker:config", (event) => {
    const detail = event.detail || {};
    config = {
      enabled: Boolean(detail.enabled),
      site: normalizeHost(detail.site || location.hostname),
      blockPageAds: detail.blockPageAds !== false,
      skipVideoAds: detail.skipVideoAds !== false,
      allowedDomains: Array.isArray(detail.allowedDomains)
        ? detail.allowedDomains.map(normalizeHost).filter(Boolean)
        : []
    };
  });

  const nativeOpen = window.open.bind(window);
  let assignedOpen = nativeOpen;

  function guardedOpen(url, target, features) {
    if (config.enabled && (!url || shouldBlock(url))) {
      report(url || "about:blank", "popup");
      return null;
    }

    return Reflect.apply(assignedOpen, window, [url, target, features]);
  }

  try {
    Object.defineProperty(window, "open", {
      configurable: false,
      enumerable: true,
      get() {
        return config.enabled ? guardedOpen : assignedOpen;
      },
      set(value) {
        if (typeof value === "function" && value !== guardedOpen) {
          assignedOpen = value;
        }
      }
    });
  } catch {
    window.open = guardedOpen;
  }

  const nativeAnchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function protectedAnchorClick() {
    if (shouldBlock(this.href)) {
      report(this.href, "scripted link");
      return;
    }

    return Reflect.apply(nativeAnchorClick, this, []);
  };

  const nativeFormSubmit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function protectedFormSubmit() {
    if (shouldBlock(this.action)) {
      report(this.action, "form redirect");
      return;
    }

    return Reflect.apply(nativeFormSubmit, this, []);
  };

  if (HTMLFormElement.prototype.requestSubmit) {
    const nativeRequestSubmit = HTMLFormElement.prototype.requestSubmit;
    HTMLFormElement.prototype.requestSubmit = function protectedRequestSubmit(
      submitter
    ) {
      if (shouldBlock(this.action)) {
        report(this.action, "form redirect");
        return;
      }

      return Reflect.apply(nativeRequestSubmit, this, [submitter]);
    };
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = function protectedFetch(input, init) {
    const url = input instanceof Request ? input.url : input;
    if (isAdRequest(url)) {
      report(url, "ad request");
      return Promise.reject(new DOMException("Ad request blocked", "AbortError"));
    }

    return Reflect.apply(nativeFetch, window, [input, init]);
  };

  const nativeXhrOpen = XMLHttpRequest.prototype.open;
  const nativeXhrSend = XMLHttpRequest.prototype.send;
  const xhrAdUrls = new WeakMap();

  XMLHttpRequest.prototype.open = function protectedXhrOpen(method, url, ...rest) {
    if (isAdRequest(url)) {
      xhrAdUrls.set(this, String(url));
    } else {
      xhrAdUrls.delete(this);
    }

    return Reflect.apply(nativeXhrOpen, this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function protectedXhrSend(body) {
    const blockedUrl = xhrAdUrls.get(this);
    if (blockedUrl) {
      xhrAdUrls.delete(this);
      report(blockedUrl, "ad request");
      this.abort();
      return;
    }

    return Reflect.apply(nativeXhrSend, this, [body]);
  };
})();
