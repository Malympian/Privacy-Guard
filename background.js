importScripts("settings-meta.js", "icon-render.js");

const DEFAULT_BLOCKED_PATTERNS = [
  "/quiz_submission_events",
  "/events",
  "/error_reports",
  "/tracking",
  "get_metrics",
  "analytics",
  "telemetry",
  "biometric",
  "keylog",
  "behavior",
];

const TRACKER_CATEGORIES = {
  sessionRecording: {
    label: "Session recording / heatmap",
    domains: [
      "hotjar.com",
      "fullstory.com",
      "logrocket.io",
      "logrocket.com",
      "mouseflow.com",
      "inspectlet.com",
      "crazyegg.com",
      "luckyorange.com",
      "smartlook.com",
      "contentsquare.com",
      "decibelinsight.net",
      "clicktale.net",
    ],
  },
  analytics: {
    label: "Web / product analytics",
    domains: [
      "google-analytics.com",
      "googletagmanager.com",
      "analytics.google.com",
      "heapanalytics.com",
      "heap.io",
      "amplitude.com",
      "api.mixpanel.com",
      "segment.io",
      "segment.com",
      "clarity.microsoft.com",
      "quantserve.com",
      "scorecardresearch.com",
      "chartbeat.com",
      "chartbeat.net",
      "parsely.com",
      "parse.ly",
      "statcounter.com",
      "histats.com",
      "snowplowanalytics.com",
      "cloudflareinsights.com",
      "mc.yandex.ru",
      "omtrdc.net",
      "demdex.net",
      "2o7.net",
    ],
  },
  adTracking: {
    label: "Ad tracking / programmatic",
    domains: [
      "doubleclick.net",
      "adnxs.com",
      "criteo.com",
      "criteo.net",
      "outbrain.com",
      "taboola.com",
      "pubmatic.com",
      "rubiconproject.com",
      "casalemedia.com",
      "openx.net",
      "adsrvr.org",
      "moatads.com",
      "bluekai.com",
      "krxd.net",
      "tiqcdn.com",
      "connect.facebook.net",
      "analytics.tiktok.com",
      "ads-twitter.com",
      "px.ads.linkedin.com",
      "snap.licdn.com",
      "ct.pinterest.com",
      "bat.bing.com",
    ],
  },
  errorReporting: {
    label: "Crash / error reporting",
    domains: ["sentry.io", "bugsnag.com", "newrelic.com", "nr-data.net"],
  },
  attribution: {
    label: "Mobile attribution",
    domains: ["branch.io", "appsflyer.com", "adjust.com"],
  },
};

const KNOWN_TRACKER_DOMAINS = Object.values(TRACKER_CATEGORIES).flatMap(
  (c) => c.domains,
);

function categoryForDomain(domain) {
  for (const [key, cat] of Object.entries(TRACKER_CATEGORIES)) {
    if (cat.domains.includes(domain)) return { key, label: cat.label };
  }
  return null;
}

// Hostname *labels* (the parts between dots) that are a strong signal of a
// dedicated telemetry endpoint regardless of which company's domain they
// live under — e.g. "pixel-config.reddit.com" or "ups.analytics.yahoo.com".
// Kept intentionally short and high-precision: words like "track" or
// "stats" are deliberately excluded because they collide with legitimate
// functional subdomains (package tracking, public stats pages, etc).
const TRACKER_HOSTNAME_HINTS = [
  "analytics",
  "telemetry",
  "pixel",
  "pixels",
  "metric",
  "metrics",
  "beacon",
  "biometric",
  "keylog",
];

function hostnameLooksLikeTracker(hostname) {
  const labels = String(hostname ?? "")
    .toLowerCase()
    .split(".");
  return labels.some((label) =>
    TRACKER_HOSTNAME_HINTS.some(
      (word) => label === word || label.startsWith(word + "-"),
    ),
  );
}

const MAX_LOG = 40;

const STATUS_ICONS = {
  on: {
    16: "icons/status-on/icon16.png",
    32: "icons/status-on/icon32.png",
    48: "icons/status-on/icon48.png",
    128: "icons/status-on/icon128.png",
  },
  paused: {
    16: "icons/status-paused/icon16.png",
    32: "icons/status-paused/icon32.png",
    48: "icons/status-paused/icon48.png",
    128: "icons/status-paused/icon128.png",
  },
  off: {
    16: "icons/status-off/icon16.png",
    32: "icons/status-off/icon32.png",
    48: "icons/status-off/icon48.png",
    128: "icons/status-off/icon128.png",
  },
};

const FALLBACK_ICONS = {
  16: "icons/icon16.png",
  32: "icons/icon32.png",
  48: "icons/icon48.png",
  128: "icons/icon128.png",
};

function hostAllowed(hostname, allowlist) {
  const host = hostname.toLowerCase();
  return allowlist.some((entry) => {
    let rule = entry.trim().toLowerCase();
    if (!rule) return false;
    if (rule.startsWith("*.")) rule = rule.slice(2);
    return host === rule || host.endsWith("." + rule);
  });
}

function normalizeHost(hostname) {
  let h = hostname.toLowerCase();
  if (h.startsWith("www.")) h = h.slice(4);
  return h;
}

function mergeFeatures(globalFeatures, siteEntry) {
  const base = { ...DEFAULT_FEATURES, ...globalFeatures };
  if (siteEntry?.useCustom && siteEntry.features) {
    return { ...base, ...siteEntry.features };
  }
  return base;
}

function getBlockedPatterns(sync) {
  const custom = (sync.customPatterns ?? [])
    .map((p) => p.trim())
    .filter(Boolean);
  return [...DEFAULT_BLOCKED_PATTERNS, ...custom];
}

function getKnownTrackerDomains(sync) {
  const custom = (sync.blockedDomains ?? [])
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  return [...KNOWN_TRACKER_DOMAINS, ...custom];
}

function domainMatch(hostname, domains) {
  const h = String(hostname ?? "").toLowerCase();
  return domains.find((d) => h === d || h.endsWith("." + d)) ?? null;
}

function getExceptions(sync) {
  return (sync.exceptions ?? []).map((p) => p.trim()).filter(Boolean);
}

function exceptionPatternFromUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    return u.origin + u.pathname; // e.g. "https://example.com/events"
  } catch {
    return rawUrl;
  }
}

async function getInjectDecision(hostname, tabId) {
  const sync = await chrome.storage.sync.get({
    enabled: true,
    allowlist: [],
    features: DEFAULT_FEATURES,
    siteOverrides: {},
    customPatterns: [],
    exceptions: [],
    blockedDomains: [],
  });

  const session = await chrome.storage.session.get({
    tabSession: {},
    snoozeUntil: 0,
  });
  const tabState = tabId != null ? session.tabSession?.[tabId] : null;
  const host = normalizeHost(hostname);
  const onAllowlist = hostAllowed(host, sync.allowlist ?? []);
  const siteEntry = sync.siteOverrides?.[host];

  if (!sync.enabled) {
    return { inject: false, reason: "extension-disabled" };
  }

  if (Date.now() < (session.snoozeUntil ?? 0)) {
    return { inject: false, reason: "snoozed" };
  }

  if (tabState?.mode === "paused") {
    return { inject: false, reason: "tab-paused" };
  }

  const sharedConfig = {
    features: mergeFeatures(sync.features, siteEntry),
    blockedPatterns: getBlockedPatterns(sync),
    exceptions: getExceptions(sync),
    knownTrackerDomains: getKnownTrackerDomains(sync),
    trackerHostnameHints: TRACKER_HOSTNAME_HINTS,
  };

  if (tabState?.mode === "active") {
    return { inject: true, config: sharedConfig, reason: "tab-session-active" };
  }

  if (!onAllowlist) {
    return { inject: false, reason: "not-allowlisted" };
  }

  return { inject: true, config: sharedConfig, reason: "allowlisted" };
}

async function applyAppearance(target, { status, blockCount = 0, title }) {
  try {
    const imageData = await buildActionIconImageData(status, blockCount);
    await chrome.action.setIcon({ ...target, imageData });
  } catch (err) {
    if (err?.message?.includes("No tab with id")) return;
    try {
      await chrome.action.setIcon({
        ...target,
        path: STATUS_ICONS[status] ?? FALLBACK_ICONS,
      });
      console.warn(
        "[privacy-guard] canvas icon failed, using PNG",
        status,
        err,
      );
    } catch {
      return;
    }
  }
  try {
    await chrome.action.setBadgeText({ ...target, text: "" });
    if (title) await chrome.action.setTitle({ ...target, title });
  } catch {}
}

async function computeTabAppearance(tabId, tab) {
  const baseTitle = "Privacy Guard";

  if (!tab.url?.startsWith("http")) {
    return { status: "off", blockCount: 0, title: baseTitle };
  }

  let hostname;
  try {
    hostname = normalizeHost(new URL(tab.url).hostname);
  } catch {
    return { status: "off", blockCount: 0, title: baseTitle };
  }

  const decision = await getInjectDecision(hostname, tabId);
  const { tabStats = {} } = await chrome.storage.session.get({ tabStats: {} });
  const count = tabStats[tabId]?.count ?? 0;

  if (decision.reason === "extension-disabled") {
    return {
      status: "off",
      blockCount: 0,
      title: `${baseTitle} — off (red dot) — disabled in settings`,
    };
  }

  if (decision.reason === "snoozed") {
    const { snoozeUntil = 0 } = await chrome.storage.session.get({
      snoozeUntil: 0,
    });
    const mins = Math.max(1, Math.ceil((snoozeUntil - Date.now()) / 60000));
    return {
      status: "paused",
      blockCount: 0,
      title: `${baseTitle} — paused (yellow dot) — snoozed ~${mins} min`,
    };
  }

  if (decision.reason === "tab-paused") {
    return {
      status: "paused",
      blockCount: 0,
      title: `${baseTitle} — paused (yellow dot) — this tab only`,
    };
  }

  if (!decision.inject) {
    return {
      status: "off",
      blockCount: 0,
      title: `${baseTitle} — off (red dot) — not active on this tab`,
    };
  }

  const activeLabel =
    decision.reason === "tab-session-active"
      ? "on for this tab only"
      : "on via allowlist";

  const blockLabel = count > 0 ? `, ${count} blocked (on icon)` : "";

  return {
    status: "on",
    blockCount: count,
    title: `${baseTitle} — on (green dot) — ${activeLabel}${blockLabel}`,
  };
}

async function syncToolbarToActiveTab() {
  const [active] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (!active?.id) return;
  const appearance = await computeTabAppearance(active.id, active);
  await applyAppearance({}, appearance);
}

async function updateActionForTab(tabId) {
  if (tabId == null) return;

  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    return;
  }

  const appearance = await computeTabAppearance(tabId, tab);
  await applyAppearance({ tabId }, appearance);

  const [active] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (active?.id === tabId) {
    await applyAppearance({}, appearance);
  }
}

async function refreshAllBadges() {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map((t) => updateActionForTab(t.id)));
  await syncToolbarToActiveTab();
}

async function recordBlock(tabId, url) {
  if (tabId == null) return;

  const { tabStats = {} } = await chrome.storage.session.get({ tabStats: {} });
  const prev = tabStats[tabId] ?? { count: 0, log: [], grouped: {} };
  const now = Date.now();

  const entry = { url, at: now };
  const log = [entry, ...prev.log].slice(0, MAX_LOG);

  const grouped = { ...(prev.grouped ?? {}) };
  const g = grouped[url];
  grouped[url] = {
    url,
    hits: (g?.hits ?? 0) + 1,
    lastSeen: now,
    firstSeen: g?.firstSeen ?? now,
  };

  tabStats[tabId] = { count: prev.count + 1, log, grouped };
  await chrome.storage.session.set({ tabStats });
  await updateActionForTab(tabId);
}

async function recordObserve(tabId, detail) {
  if (tabId == null || !detail?.url) return;

  const sync = await chrome.storage.sync.get({
    customPatterns: [],
    exceptions: [],
    blockedDomains: [],
    features: DEFAULT_FEATURES,
  });
  const features = { ...DEFAULT_FEATURES, ...sync.features };
  const allPatterns = getBlockedPatterns(sync);
  const exceptions = getExceptions(sync);
  const knownDomains = getKnownTrackerDomains(sync);

  const { tabDiscovered = {} } = await chrome.storage.session.get({
    tabDiscovered: {},
  });
  const map = { ...(tabDiscovered[tabId] ?? {}) };

  const url = detail.url;
  const prev = map[url] ?? null;

  const matchedPatterns = features.blockTrackingRequests
    ? allPatterns.filter((p) => url.includes(p))
    : [];

  let matchedDomain = null;
  let matchedDomainCategory = null;
  let matchedViaHostnameHint = false;
  if (features.blockKnownTrackers) {
    let hostname = "";
    try {
      hostname = new URL(url).hostname;
    } catch {}
    const vendorDomain = domainMatch(hostname, knownDomains);
    if (vendorDomain) {
      matchedDomain = vendorDomain;
      matchedDomainCategory = categoryForDomain(vendorDomain);
    } else if (hostnameLooksLikeTracker(hostname)) {
      matchedDomain = hostname;
      matchedViaHostnameHint = true;
    }
  }

  const exceptionPattern = exceptionPatternFromUrl(url);
  const isExcepted = exceptions.some(
    (e) => url.includes(e) || exceptionPattern === e,
  );

  const blocked =
    !isExcepted &&
    (matchedPatterns.length > 0 || !!matchedDomain || !!detail.blocked);

  map[url] = {
    url,
    hits: (prev?.hits ?? 0) + 1,
    via: detail.via ?? prev?.via ?? "",
    matchedPatterns,
    matchedDomain,
    matchedDomainCategory: matchedDomainCategory?.label ?? null,
    matchedViaHostnameHint,
    decision: blocked ? "block" : "allow",
    reason:
      matchedPatterns[0] ??
      matchedDomain ??
      (detail.blocked ? "guard-blocked" : null),
    blocked,
    isExcepted,
    firstSeen: prev?.firstSeen ?? Date.now(),
    lastSeen: Date.now(),
  };

  tabDiscovered[tabId] = map;
  await chrome.storage.session.set({ tabDiscovered });
}

async function recordObserveReady(tabId) {
  if (tabId == null) return;
  const { tabObserveReady = {} } = await chrome.storage.session.get({
    tabObserveReady: {},
  });
  tabObserveReady[tabId] = { at: Date.now() };
  await chrome.storage.session.set({ tabObserveReady });
}

async function clearTabDataOnNavigate(tabId) {
  if (tabId == null) return;
  const data = await chrome.storage.session.get({
    tabDiscovered: {},
    tabStats: {},
    tabObserveReady: {},
  });
  const tabDiscovered = { ...data.tabDiscovered };
  const tabStats = { ...data.tabStats };
  const tabObserveReady = { ...data.tabObserveReady };
  delete tabDiscovered[tabId];
  delete tabStats[tabId];
  delete tabObserveReady[tabId];
  await chrome.storage.session.set({
    tabDiscovered,
    tabStats,
    tabObserveReady,
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  const sync = await chrome.storage.sync.get({
    enabled: null,
    allowlist: null,
    features: null,
    siteOverrides: null,
    customPatterns: null,
    exceptions: null,
    blockedDomains: null,
  });
  const patch = {};
  if (sync.enabled === null) patch.enabled = true;
  if (sync.allowlist === null) patch.allowlist = [];
  if (sync.features === null) patch.features = DEFAULT_FEATURES;
  if (sync.siteOverrides === null) patch.siteOverrides = {};
  if (sync.customPatterns === null) patch.customPatterns = [];
  if (sync.exceptions === null) patch.exceptions = [];
  if (sync.blockedDomains === null) patch.blockedDomains = [];
  if (Object.keys(patch).length) await chrome.storage.sync.set(patch);
  await preloadStatusBitmaps();
  await refreshAllBadges();
});

chrome.runtime.onStartup.addListener(async () => {
  await preloadStatusBitmaps();
  await refreshAllBadges();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "getInjectConfig") {
    getInjectDecision(msg.hostname, sender.tab?.id).then(sendResponse);
    return true;
  }

  if (msg.type === "recordBlock") {
    recordBlock(sender.tab?.id, msg.url).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === "recordObserve") {
    recordObserve(sender.tab?.id, msg.detail).then(() =>
      sendResponse({ ok: true }),
    );
    return true;
  }

  if (msg.type === "recordObservedForTab") {
    (async () => {
      const tabId = Number(msg.tabId);
      const items = Array.isArray(msg.items) ? msg.items : [];
      if (!Number.isFinite(tabId) || tabId <= 0) {
        sendResponse({ ok: false });
        return;
      }
      for (const detail of items) {
        await recordObserve(tabId, detail);
      }
      sendResponse({ ok: true, count: items.length });
    })();
    return true;
  }

  if (msg.type === "recordObserveReady") {
    recordObserveReady(sender.tab?.id)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (msg.type === "refreshBadge") {
    if (msg.tabId > 0) {
      updateActionForTab(msg.tabId)
        .then(() => sendResponse({ ok: true }))
        .catch(() => sendResponse({ ok: false }));
    } else {
      refreshAllBadges()
        .then(() => sendResponse({ ok: true }))
        .catch(() => sendResponse({ ok: false }));
    }
    return true;
  }

  if (msg.type === "refreshAllBadges") {
    refreshAllBadges()
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (msg.type === "getTabStats") {
    chrome.storage.session.get({ tabStats: {} }).then((data) => {
      sendResponse(data.tabStats?.[msg.tabId] ?? { count: 0, log: [] });
    });
    return true;
  }

  if (msg.type === "getDiscovered") {
    chrome.storage.session.get({ tabDiscovered: {} }).then((data) => {
      const map = data.tabDiscovered?.[msg.tabId] ?? {};
      sendResponse({ items: Object.values(map) });
    });
    return true;
  }

  if (msg.type === "getObserveReady") {
    chrome.storage.session.get({ tabObserveReady: {} }).then((data) => {
      sendResponse(data.tabObserveReady?.[msg.tabId] ?? null);
    });
    return true;
  }

  if (msg.type === "clearDiscovered") {
    chrome.storage.session.get({ tabDiscovered: {} }).then(async (data) => {
      const tabDiscovered = { ...data.tabDiscovered };
      delete tabDiscovered[msg.tabId];
      await chrome.storage.session.set({ tabDiscovered });
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === "addException") {
    (async () => {
      const { url, pattern: explicit } = msg;
      const pattern = explicit ?? (url ? exceptionPatternFromUrl(url) : null);
      if (!pattern) {
        sendResponse({ ok: false, error: "no pattern" });
        return;
      }

      const sync = await chrome.storage.sync.get({ exceptions: [] });
      const exceptions = [...new Set([...(sync.exceptions ?? []), pattern])];
      await chrome.storage.sync.set({ exceptions });
      await refreshAllBadges();
      sendResponse({ ok: true, pattern });
    })();
    return true;
  }

  if (msg.type === "removeException") {
    (async () => {
      const sync = await chrome.storage.sync.get({ exceptions: [] });
      const exceptions = (sync.exceptions ?? []).filter(
        (e) => e !== msg.pattern,
      );
      await chrome.storage.sync.set({ exceptions });
      await refreshAllBadges();
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg.type === "getExceptions") {
    chrome.storage.sync.get({ exceptions: [] }).then((sync) => {
      sendResponse({ exceptions: sync.exceptions ?? [] });
    });
    return true;
  }

  if (msg.type === "getTrackerMeta") {
    chrome.storage.sync
      .get({ customPatterns: [], blockedDomains: [] })
      .then((sync) => {
        sendResponse({
          blockedPatterns: getBlockedPatterns(sync),
          knownTrackerDomains: getKnownTrackerDomains(sync),
          trackerHostnameHints: TRACKER_HOSTNAME_HINTS,
          categories: Object.fromEntries(
            Object.entries(TRACKER_CATEGORIES).map(([key, c]) => [
              key,
              { label: c.label, domains: c.domains },
            ]),
          ),
        });
      });
    return true;
  }

  return false;
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  try {
    const data = await chrome.storage.session.get({
      tabSession: {},
      tabStats: {},
      tabDiscovered: {},
      tabObserveReady: {},
    });
    const tabSession = { ...data.tabSession };
    const tabStats = { ...data.tabStats };
    const tabDiscovered = { ...data.tabDiscovered };
    const tabObserveReady = { ...data.tabObserveReady };
    delete tabSession[tabId];
    delete tabStats[tabId];
    delete tabDiscovered[tabId];
    delete tabObserveReady[tabId];
    await chrome.storage.session.set({
      tabSession,
      tabStats,
      tabDiscovered,
      tabObserveReady,
    });
  } catch {}
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  updateActionForTab(tabId).catch(() => {});
  syncToolbarToActiveTab().catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === "loading") {
    clearTabDataOnNavigate(tabId).catch(() => {});
  }
  if (info.status === "complete" || info.url) {
    updateActionForTab(tabId).catch(() => {});
  }
});

chrome.storage.onChanged.addListener((_, area) => {
  if (area === "sync" || area === "session") refreshAllBadges().catch(() => {});
});
