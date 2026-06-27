importScripts("icon-render.js");

const DEFAULT_FEATURES = {
  
  blockTrackingRequests:  true,
  blockTrackingPixels:    true,
  blockKnownTrackers:     true,
  blockWebRTC:            true,
  blockBattery:           true,
  
  spoofCamera:            false,
  blockCamera:            false,
  spoofMicrophone:        false,
  blockMicrophone:        false,
  
  spoofTabVisibility:     true,
  spoofFocus:             true,
  
  blockTabEnumeration:    true,
  
  spoofReferrer:          true,
  blockCacheTimingProbe:  true,
  
  spoofScreenSize:        true,
  spoofScrollDepth:       true,
  spoofPerformanceTiming: true,
  
  spoofKeyboardTiming:    true,
  blockKeyboardEvents:    false,   
  
  spoofMouseMovement:     true,
  blockMouseEvents:       false,
  
  spoofClicks:            true,
  blockClickEvents:       false,
  
  spoofTouch:             true,
  blockTouchEvents:       false,
  
  spoofFormInput:         true,
  blockFormEvents:        false,
  
  blockClipboard:         true,
  blockSelection:         true,
  
  spoofScreenCapture:     true,
  blockScreenCapture:     true,
  
  blockScrollTracking:    false,   
};

const DEFAULT_BLOCKED_PATTERNS = [
  "/events",
  "/analytics",
  "/error_reports",
  "/tracking",
  "/telemetry",
  "/biometric",
  "/keylog",
  "/behavior",
  "get_metrics",
];

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
  const custom = (sync.customPatterns ?? []).map((p) => p.trim()).filter(Boolean);
  return [...DEFAULT_BLOCKED_PATTERNS, ...custom];
}

function getExceptions(sync) {
  return (sync.exceptions ?? []).map((p) => p.trim()).filter(Boolean);
}

function exceptionPatternFromUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    return u.origin + u.pathname; 
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
  });

  const session = await chrome.storage.session.get({ tabSession: {}, snoozeUntil: 0 });
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
    try {
      await chrome.action.setIcon({
        ...target,
        path: STATUS_ICONS[status] ?? FALLBACK_ICONS,
      });
      console.warn("[privacy-guard] canvas icon failed, using PNG", status, err);
    } catch {
      return; 
    }
  }
  try {
    await chrome.action.setBadgeText({ ...target, text: "" });
    if (title) await chrome.action.setTitle({ ...target, title });
  } catch {
    
  }
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
    const { snoozeUntil = 0 } = await chrome.storage.session.get({ snoozeUntil: 0 });
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
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
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

  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
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
  const now  = Date.now();

  
  const entry = { url, at: now };
  const log   = [entry, ...prev.log].slice(0, MAX_LOG);

  
  const grouped = { ...(prev.grouped ?? {}) };
  const g = grouped[url];
  grouped[url] = {
    url,
    hits:      (g?.hits ?? 0) + 1,
    lastSeen:  now,
    firstSeen: g?.firstSeen ?? now,
  };

  tabStats[tabId] = { count: prev.count + 1, log, grouped };
  await chrome.storage.session.set({ tabStats });
  await updateActionForTab(tabId);
}

async function recordObserve(tabId, detail) {
  if (tabId == null || !detail?.url) return;

  const sync = await chrome.storage.sync.get({ customPatterns: [], exceptions: [] });
  const allPatterns = getBlockedPatterns(sync);
  const exceptions  = getExceptions(sync);

  const { tabDiscovered = {} } = await chrome.storage.session.get({ tabDiscovered: {} });
  const map = { ...(tabDiscovered[tabId] ?? {}) };

  const url  = detail.url;
  const prev = map[url] ?? null;

  
  const matchedPatterns = allPatterns.filter((p) => url.includes(p));

  
  const exceptionPattern = exceptionPatternFromUrl(url);
  const isExcepted = exceptions.some((e) => url.includes(e) || exceptionPattern === e);

  
  const blocked =
    !isExcepted && (matchedPatterns.length > 0 || !!detail.blocked);

  map[url] = {
    url,
    hits:            (prev?.hits ?? 0) + 1,
    via:             detail.via ?? prev?.via ?? "",
    matchedPatterns,
    decision:        blocked ? "block" : "allow",
    reason:          matchedPatterns[0] ?? (detail.blocked ? "guard-blocked" : null),
    blocked,
    isExcepted,
    firstSeen:       prev?.firstSeen ?? Date.now(),
    lastSeen:        Date.now(),
  };

  tabDiscovered[tabId] = map;
  await chrome.storage.session.set({ tabDiscovered });
}

async function recordObserveReady(tabId) {
  if (tabId == null) return;
  const { tabObserveReady = {} } = await chrome.storage.session.get({ tabObserveReady: {} });
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
  const tabDiscovered  = { ...data.tabDiscovered };
  const tabStats       = { ...data.tabStats };
  const tabObserveReady = { ...data.tabObserveReady };
  delete tabDiscovered[tabId];
  delete tabStats[tabId];
  delete tabObserveReady[tabId];
  await chrome.storage.session.set({ tabDiscovered, tabStats, tabObserveReady });
}

chrome.runtime.onInstalled.addListener(async () => {
  const sync = await chrome.storage.sync.get({
    enabled:      null,
    allowlist:    null,
    features:     null,
    siteOverrides: null,
    customPatterns: null,
    exceptions:   null,   
  });
  const patch = {};
  if (sync.enabled       === null) patch.enabled       = true;
  if (sync.allowlist     === null) patch.allowlist     = [];
  if (sync.features      === null) patch.features      = DEFAULT_FEATURES;
  if (sync.siteOverrides === null) patch.siteOverrides = {};
  if (sync.customPatterns=== null) patch.customPatterns= [];
  if (sync.exceptions    === null) patch.exceptions    = [];   
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
    recordObserve(sender.tab?.id, msg.detail).then(() => sendResponse({ ok: true }));
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
    recordObserveReady(sender.tab?.id).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (msg.type === "refreshBadge") {
    if (msg.tabId > 0) {
      updateActionForTab(msg.tabId).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    } else {
      refreshAllBadges().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    }
    return true;
  }

  if (msg.type === "refreshAllBadges") {
    refreshAllBadges().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
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
      if (!pattern) { sendResponse({ ok: false, error: "no pattern" }); return; }

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
      const exceptions = (sync.exceptions ?? []).filter((e) => e !== msg.pattern);
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

  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.get(
    { tabSession: {}, tabStats: {}, tabDiscovered: {}, tabObserveReady: {} },
    (data) => {
      const tabSession      = { ...data.tabSession };
      const tabStats        = { ...data.tabStats };
      const tabDiscovered   = { ...data.tabDiscovered };
      const tabObserveReady = { ...data.tabObserveReady };
      delete tabSession[tabId];
      delete tabStats[tabId];
      delete tabDiscovered[tabId];
      delete tabObserveReady[tabId];
      chrome.storage.session.set({ tabSession, tabStats, tabDiscovered, tabObserveReady });
    }
  );
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  updateActionForTab(tabId).catch(() => {});
  syncToolbarToActiveTab().catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === "loading") {
    clearTabDataOnNavigate(tabId);
  }
  if (info.status === "complete" || info.url) {
    updateActionForTab(tabId).catch(() => {});
  }
});

chrome.storage.onChanged.addListener((_, area) => {
  if (area === "sync" || area === "session") refreshAllBadges();
});
