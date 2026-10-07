const SITE_STORAGE_KEY = "protectedSites";
const STATS_STORAGE_KEY = "blockStats";
const RULE_ID_START = 1000;
const SESSION_RULE_ID_START = 1000000;
const pendingPopups = new Map();
const AD_DOMAINS = [
  "2mdn.net",
  "adform.net",
  "adnxs.com",
  "adsrvr.org",
  "adservice.google.com",
  "amazon-adsystem.com",
  "casalemedia.com",
  "contextweb.com",
  "criteo.com",
  "criteo.net",
  "doubleclick.net",
  "exoclick.com",
  "exosrv.com",
  "googleadservices.com",
  "googlesyndication.com",
  "lijit.com",
  "media.net",
  "moatads.com",
  "openx.net",
  "outbrain.com",
  "popads.net",
  "popcash.net",
  "propellerads.com",
  "pubmatic.com",
  "revcontent.com",
  "rubiconproject.com",
  "serving-sys.com",
  "smaato.net",
  "smartadserver.com",
  "spotx.tv",
  "spotxchange.com",
  "taboola.com",
  "teads.tv",
  "trafficjunky.net",
  "yieldmo.com",
  "zedo.com"
];

function normalizeHost(value) {
  const host = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split(/[/?#]/)[0]
    .split(":")[0]
    .replace(/^www\./, "")
    .replace(/^\.+|\.+$/g, "");

  return host;
}

function isSameOrSubdomain(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

function isAllowedDestination(destinationHost, sourceHost, allowedDomains = []) {
  const destination = normalizeHost(destinationHost);
  const source = normalizeHost(sourceHost);

  if (!destination || isSameOrSubdomain(destination, source)) {
    return true;
  }

  return allowedDomains.some((domain) =>
    isSameOrSubdomain(destination, normalizeHost(domain))
  );
}

async function getProtectedSites() {
  const result = await chrome.storage.local.get(SITE_STORAGE_KEY);
  return result[SITE_STORAGE_KEY] || {};
}

async function getSiteState(host) {
  const site = normalizeHost(host);
  const sites = await getProtectedSites();
  const config = sites[site] || {};

  return {
    site,
    enabled: config.enabled !== false,
    blockPageAds: config.blockPageAds !== false,
    skipVideoAds: config.skipVideoAds !== false,
    allowedDomains: Array.isArray(config.allowedDomains)
      ? config.allowedDomains.map(normalizeHost).filter(Boolean)
      : []
  };
}

async function setSiteState(host, update) {
  const site = normalizeHost(host);
  if (!site) {
    throw new Error("A valid website hostname is required.");
  }

  const sites = await getProtectedSites();
  const current = sites[site] || {};
  const next = {
    enabled:
      typeof update.enabled === "boolean"
        ? update.enabled
        : current.enabled !== false,
    blockPageAds:
      typeof update.blockPageAds === "boolean"
        ? update.blockPageAds
        : current.blockPageAds !== false,
    skipVideoAds:
      typeof update.skipVideoAds === "boolean"
        ? update.skipVideoAds
        : current.skipVideoAds !== false,
    allowedDomains: Array.isArray(update.allowedDomains)
      ? [...new Set(update.allowedDomains.map(normalizeHost).filter(Boolean))]
      : current.allowedDomains || []
  };

  sites[site] = next;

  await chrome.storage.local.set({ [SITE_STORAGE_KEY]: sites });
  await syncRedirectRules(sites);
  return getSiteState(site);
}

function makeRedirectRule(site, config, id) {
  const allowedDomains = [
    site,
    ...(Array.isArray(config.allowedDomains) ? config.allowedDomains : [])
  ]
    .map(normalizeHost)
    .filter(Boolean);

  return {
    id,
    priority: 1,
    action: { type: "block" },
    condition: {
      initiatorDomains: [site],
      excludedRequestDomains: [...new Set(allowedDomains)],
      resourceTypes: ["main_frame"]
    }
  };
}

function makeAdResourceRule(site, id) {
  return {
    id,
    priority: 2,
    action: { type: "block" },
    condition: {
      initiatorDomains: [site],
      requestDomains: AD_DOMAINS,
      resourceTypes: [
        "font",
        "image",
        "media",
        "object",
        "other",
        "ping",
        "script",
        "sub_frame",
        "websocket",
        "xmlhttprequest"
      ]
    }
  };
}

function makeTabAdRule(tabId, id) {
  return {
    id,
    priority: 3,
    action: { type: "block" },
    condition: {
      tabIds: [tabId],
      requestDomains: AD_DOMAINS,
      resourceTypes: [
        "font",
        "image",
        "media",
        "object",
        "other",
        "ping",
        "script",
        "sub_frame",
        "websocket",
        "xmlhttprequest"
      ]
    }
  };
}

function makeTabRedirectRule(tabId, state, id) {
  const allowedDomains = [state.site, ...(state.allowedDomains || [])]
    .map(normalizeHost)
    .filter(Boolean);

  return {
    id,
    priority: 4,
    action: { type: "block" },
    condition: {
      tabIds: [tabId],
      initiatorDomains: [state.site],
      excludedRequestDomains: [...new Set(allowedDomains)],
      resourceTypes: ["main_frame"]
    }
  };
}

async function syncTabProtection(tabId, state) {
  if (!Number.isInteger(tabId)) {
    return;
  }

  const sessionRules = await chrome.declarativeNetRequest.getSessionRules();
  const currentRules = sessionRules.filter((rule) =>
    rule.condition.tabIds?.includes(tabId)
  );
  const removeRuleIds = currentRules.map((rule) => rule.id);
  const addRules = [];

  if (state?.enabled && state.site) {
    const usedIds = new Set(
      sessionRules
        .filter((rule) => !removeRuleIds.includes(rule.id))
        .map((rule) => rule.id)
    );
    let nextId = SESSION_RULE_ID_START + (tabId % 400000) * 3;
    const takeId = () => {
      while (usedIds.has(nextId)) {
        nextId += 1;
      }
      const id = nextId;
      usedIds.add(id);
      nextId += 1;
      return id;
    };

    addRules.push(makeTabRedirectRule(tabId, state, takeId()));
    if (state.blockPageAds) {
      addRules.push(makeTabAdRule(tabId, takeId()));
    }
  }

  if (removeRuleIds.length || addRules.length) {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds,
      addRules
    });
  }
}

async function pageStateFromUrl(urlValue) {
  try {
    const url = new URL(urlValue);
    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }
    return getSiteState(url.hostname);
  } catch {
    return null;
  }
}

async function syncAllOpenTabs() {
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs.map(async (tab) => {
      const state = await pageStateFromUrl(tab.url);
      await syncTabProtection(tab.id, state);
    })
  );
}

async function syncRedirectRules(sitesOverride) {
  const sites = sitesOverride || (await getProtectedSites());
  const enabledSites = Object.entries(sites)
    .filter(([, config]) => config && config.enabled)
    .sort(([left], [right]) => left.localeCompare(right));
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existingRules
    .map((rule) => rule.id)
    .filter((id) => id >= RULE_ID_START);
  let nextRuleId = RULE_ID_START;
  const addRules = enabledSites.flatMap(([site, config]) => {
    const rules = [makeRedirectRule(site, config, nextRuleId++)];
    if (config.blockPageAds !== false) {
      rules.push(makeAdResourceRule(site, nextRuleId++));
    }
    return rules;
  });

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules
  });
}

async function recordBlock(details) {
  const result = await chrome.storage.local.get(STATS_STORAGE_KEY);
  const stats = result[STATS_STORAGE_KEY] || {
    total: 0,
    bySite: {},
    lastBlocked: null
  };
  const site = normalizeHost(details.site);

  stats.total = Number(stats.total || 0) + 1;
  stats.bySite = stats.bySite || {};
  stats.bySite[site] = Number(stats.bySite[site] || 0) + 1;
  stats.lastBlocked = {
    site,
    url: String(details.url || "").slice(0, 1000),
    kind: String(details.kind || "redirect"),
    at: Date.now()
  };

  await chrome.storage.local.set({ [STATS_STORAGE_KEY]: stats });
  return stats;
}

async function getStats(site) {
  const result = await chrome.storage.local.get(STATS_STORAGE_KEY);
  const stats = result[STATS_STORAGE_KEY] || {
    total: 0,
    bySite: {},
    lastBlocked: null
  };

  return {
    total: Number(stats.total || 0),
    siteTotal: Number((stats.bySite || {})[normalizeHost(site)] || 0),
    lastBlocked: stats.lastBlocked || null
  };
}

async function siteIsProtected(urlValue) {
  const state = await pageStateFromUrl(urlValue);
  return state?.enabled ? state : null;
}

chrome.runtime.onInstalled.addListener(() => {
  Promise.all([syncRedirectRules(), syncAllOpenTabs()]).catch(console.error);
});

chrome.runtime.onStartup.addListener(() => {
  Promise.all([syncRedirectRules(), syncAllOpenTabs()]).catch(console.error);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handleMessage = async () => {
    switch (message?.type) {
      case "get-state": {
        const state = await getSiteState(message.host);
        return { ok: true, state, stats: await getStats(state.site) };
      }
      case "set-enabled":
        return {
          ok: true,
          state: await setSiteState(message.host, {
            enabled: Boolean(message.enabled)
          })
        };
      case "set-allowed-domains":
        return {
          ok: true,
          state: await setSiteState(message.host, {
            allowedDomains: message.allowedDomains || []
          })
        };
      case "set-options":
        return {
          ok: true,
          state: await setSiteState(message.host, {
            blockPageAds: Boolean(message.blockPageAds),
            skipVideoAds: Boolean(message.skipVideoAds)
          })
        };
      case "record-block":
        return { ok: true, stats: await recordBlock(message) };
      case "sync-tab-protection": {
        const tabId = sender.tab?.id;
        const pageState = await pageStateFromUrl(
          sender.tab?.url || message.url
        );
        await syncTabProtection(tabId, pageState);
        return { ok: true };
      }
      case "reset-site-count": {
        const site = normalizeHost(message.host);
        const result = await chrome.storage.local.get(STATS_STORAGE_KEY);
        const stats = result[STATS_STORAGE_KEY] || {
          total: 0,
          bySite: {},
          lastBlocked: null
        };
        stats.bySite = stats.bySite || {};
        delete stats.bySite[site];
        await chrome.storage.local.set({ [STATS_STORAGE_KEY]: stats });
        return { ok: true, stats: await getStats(site) };
      }
      default:
        return { ok: false, error: "Unknown message." };
    }
  };

  handleMessage()
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

// Close a popup that evades the page-level window.open guard. New tabs often
// begin as about:blank, so keep a short-lived record until their URL arrives.
chrome.tabs.onCreated.addListener(async (tab) => {
  if (!Number.isInteger(tab.openerTabId)) {
    return;
  }

  try {
    const opener = await chrome.tabs.get(tab.openerTabId);
    const state = await siteIsProtected(opener.url);
    if (!state) {
      return;
    }

    pendingPopups.set(tab.id, {
      sourceSite: state.site,
      allowedDomains: state.allowedDomains,
      createdAt: Date.now()
    });
  } catch {
    // The opener may have closed before it could be inspected.
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    const pageState = await pageStateFromUrl(changeInfo.url);
    await syncTabProtection(tabId, pageState).catch(() => {});
  }

  const pending = pendingPopups.get(tabId);
  if (!pending) {
    return;
  }

  if (Date.now() - pending.createdAt > 10000) {
    pendingPopups.delete(tabId);
    return;
  }

  const nextUrl = changeInfo.url || tab.pendingUrl || tab.url;
  if (!nextUrl || nextUrl === "about:blank") {
    return;
  }

  try {
    const destination = new URL(nextUrl);
    if (!["http:", "https:"].includes(destination.protocol)) {
      pendingPopups.delete(tabId);
      return;
    }

    if (
      isAllowedDestination(
        destination.hostname,
        pending.sourceSite,
        pending.allowedDomains
      )
    ) {
      pendingPopups.delete(tabId);
      return;
    }

    pendingPopups.delete(tabId);
    await chrome.tabs.remove(tabId);
    await recordBlock({
      site: pending.sourceSite,
      url: nextUrl,
      kind: "popup tab"
    });
  } catch {
    pendingPopups.delete(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  pendingPopups.delete(tabId);
  syncTabProtection(tabId, null).catch(() => {});
});
