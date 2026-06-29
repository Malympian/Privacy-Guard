const enabledEl = document.getElementById("enabled");
const inputEl = document.getElementById("domain-input");
const allowlistEl = document.getElementById("allowlist");
const siteSectionEl = document.getElementById("current-site");
const activityEl = document.getElementById("activity");
const discoverEl = document.getElementById("panel-discover");
const noTabMsgEl = document.getElementById("no-tab-msg");
const quickActionsEl = document.getElementById("quick-actions");
const siteTitleLabelEl = document.getElementById("site-title-label");
const siteStatusEl = document.getElementById("site-status");
const statusBadgeEl = document.getElementById("status-badge");
const statusLabelEl = document.getElementById("status-label");
const siteCustomEl = document.getElementById("site-use-custom");
const blockBigEl = document.getElementById("block-big");
const blockSubEl = document.getElementById("block-sub");
const blockLogEl = document.getElementById("block-log");
const snoozeStatusEl = document.getElementById("snooze-status");
const snoozeHoursEl = document.getElementById("snooze-hours");
const snoozeMinEl = document.getElementById("snooze-minutes");
const discoverStatEl = document.getElementById("discover-status");
const discoverListEl = document.getElementById("discover-list");
const headerStatusEl = document.getElementById("header-status");
const headerStatusLabelEl = document.getElementById("header-status-label");
const navBlockBadgeEl = document.getElementById("nav-block-badge");
const navDiscoverBadgeEl = document.getElementById("nav-discover-badge");
const navExceptionsBadgeEl = document.getElementById("nav-exceptions-badge");
const exceptionsListEl = document.getElementById("exceptions-list");
const reloadNoticeEl = document.getElementById("reload-notice");
const settingsNoticeEl = document.getElementById("settings-notice");
const featuresHintEl = document.getElementById("features-hint");

const sessionBtns = {
  default: document.getElementById("session-default"),
  active: document.getElementById("session-active"),
  paused: document.getElementById("session-paused"),
};

let currentTabId = null;
let currentHost = null;
let currentSessionMode = "default";
let editingSiteCustom = false;
let currentDiscoveredItems = [];
let currentRecommendations = {};

const menuBtnEl = document.getElementById("menu-btn");
const navDrawerEl = document.getElementById("nav-drawer");
const overlayEl = document.getElementById("drawer-overlay");

function openDrawer() {
  navDrawerEl.classList.add("open");
  overlayEl.classList.add("open");
  menuBtnEl.classList.add("open");
}
function closeDrawer() {
  navDrawerEl.classList.remove("open");
  overlayEl.classList.remove("open");
  menuBtnEl.classList.remove("open");
}
menuBtnEl.addEventListener("click", () =>
  navDrawerEl.classList.contains("open") ? closeDrawer() : openDrawer(),
);
overlayEl.addEventListener("click", closeDrawer);

const panels = document.querySelectorAll(".panel");
const navItems = document.querySelectorAll(".nav-item[data-panel]");

function showPanel(id) {
  panels.forEach((p) => p.classList.toggle("active", p.id === "panel-" + id));
  navItems.forEach((n) => n.classList.toggle("active", n.dataset.panel === id));
  closeDrawer();

  if (id === "exceptions") renderExceptions();
  if (id === "discover") renderDiscover();
}

navItems.forEach((btn) => {
  btn.addEventListener("click", () => showPanel(btn.dataset.panel));
});

function normalizeDomain(raw) {
  let s = raw.trim().toLowerCase();
  if (!s) return "";
  s = s
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .split(":")[0];
  if (s.startsWith("www.")) s = s.slice(4);
  return s;
}
function normalizeHost(hostname) {
  let h = hostname.toLowerCase();
  if (h.startsWith("www.")) h = h.slice(4);
  return h;
}
function hostOnAllowlist(host, allowlist) {
  return (allowlist ?? []).some((entry) => {
    let rule = entry.trim().toLowerCase();
    if (!rule) return false;
    if (rule.startsWith("*.")) rule = rule.slice(2);
    return host === rule || host.endsWith("." + rule);
  });
}
async function sendBg(msg) {
  try {
    return (await chrome.runtime.sendMessage(msg)) ?? {};
  } catch {
    return {};
  }
}
function refreshBadge() {
  chrome.runtime.sendMessage({
    type: "refreshBadge",
    tabId: currentTabId ?? -1,
  });
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id != null)
      chrome.runtime.sendMessage({ type: "refreshBadge", tabId: tabs[0].id });
  });
}
async function readSync() {
  return chrome.storage.sync.get({
    enabled: true,
    allowlist: [],
    features: { ...DEFAULT_FEATURES },
    siteOverrides: {},
    customPatterns: [],
    exceptions: [],
  });
}
async function readSession() {
  return chrome.storage.session.get({ tabSession: {}, snoozeUntil: 0 });
}

let _reloadNoticePending = false;
function showReloadNotice() {
  if (_reloadNoticePending || !reloadNoticeEl) return;
  _reloadNoticePending = true;
  reloadNoticeEl.classList.remove("hidden");
  reloadNoticeEl.onclick = () => {
    if (currentTabId != null) {
      chrome.tabs.reload(currentTabId).catch(() => {});
    }
    reloadNoticeEl.classList.add("hidden");
    _reloadNoticePending = false;
  };
}

function showSettingsNotice() {
  if (!settingsNoticeEl) return;
  settingsNoticeEl.classList.remove("hidden");
  settingsNoticeEl.onclick = () => {
    settingsNoticeEl.classList.add("hidden");
    showPanel("blocking");
  };
}

function setHeaderStatus(state, label) {
  if (!currentHost) {
    headerStatusEl.classList.add("hidden");
    return;
  }
  headerStatusEl.className = "header-status " + state;
  headerStatusLabelEl.textContent = label;
  headerStatusEl.classList.remove("hidden");
}

function setStatusBadge(state, label, detail) {
  statusBadgeEl.className = "badge " + state;
  statusLabelEl.textContent = label;
  if (siteStatusEl) siteStatusEl.textContent = detail ?? "";
  setHeaderStatus(state, label);
}

function initSnoozePickers() {
  for (let h = 0; h <= 24; h++) {
    const o = document.createElement("option");
    o.value = h;
    o.textContent = h;
    snoozeHoursEl.appendChild(o);
  }
  for (let m = 0; m < 60; m++) {
    const o = document.createElement("option");
    o.value = m;
    o.textContent = String(m).padStart(2, "0");
    snoozeMinEl.appendChild(o);
  }
  snoozeHoursEl.value = "0";
  snoozeMinEl.value = "30";
}

async function renderSnoozeStatus() {
  const { snoozeUntil = 0 } = await readSession();
  const left = snoozeUntil - Date.now();
  if (left > 0) {
    const mins = Math.ceil(left / 60000);
    snoozeStatusEl.textContent = `⏸ Snoozed everywhere — ~${mins} min remaining.`;
    snoozeStatusEl.classList.add("visible");
  } else {
    snoozeStatusEl.classList.remove("visible");
  }
}

function renderAllowlist(allowlist) {
  allowlistEl.textContent = "";
  if (!allowlist.length) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="empty-note">No protected sites yet — add one above.</span>`;
    allowlistEl.appendChild(li);
    return;
  }
  for (const domain of allowlist) {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.className = "s-domain";
    span.textContent = domain;
    const btn = document.createElement("button");
    btn.className = "rm-btn";
    btn.textContent = "×";
    btn.title = "Remove";
    btn.addEventListener("click", async () => {
      const cfg = await readSync();
      const next = cfg.allowlist.filter((d) => d !== domain);
      await chrome.storage.sync.set({ allowlist: next });
      renderAllowlist(next);
      await refreshSiteStatus();
      refreshBadge();
    });
    li.append(span, btn);
    allowlistEl.appendChild(li);
  }
}

async function addDomain(raw) {
  const domain = normalizeDomain(raw);
  if (!domain) return;
  const cfg = await readSync();
  const list = cfg.allowlist ?? [];
  if (list.includes(domain)) {
    inputEl.value = "";
    return;
  }
  const next = [...list, domain].sort();
  await chrome.storage.sync.set({ allowlist: next });
  inputEl.value = "";
  renderAllowlist(next);
  await refreshSiteStatus();
  refreshBadge();
  showSettingsNotice();
}

const KEY_EVENTS = {
  blockTrackingRequests: ["fetch", "XHR", "sendBeacon"],
  blockTrackingPixels: ["img.src"],
  blockKnownTrackers: ["domain", "hostname"],
  blockWebRTC: ["RTCPeerConnection", "webkitRTCPeerConnection"],
  blockBattery: ["navigator.getBattery()"],

  spoofCamera: ["getUserMedia", "video track"],
  blockCamera: ["getUserMedia", "video"],
  spoofMicrophone: ["getUserMedia", "audio track"],
  blockMicrophone: ["getUserMedia", "audio"],

  spoofTabVisibility: ["visibilitychange", "document.hidden"],
  spoofFocus: ["focus", "blur", "focusin", "focusout", "hasFocus()"],

  blockTabEnumeration: ["BroadcastChannel", "SharedWorker", "storage"],

  spoofReferrer: ["document.referrer"],
  blockCacheTimingProbe: ["transferSize", "PerformanceObserver"],

  spoofScreenSize: [
    "screen.width",
    "screen.height",
    "outerWidth",
    "outerHeight",
  ],
  spoofScrollDepth: ["scrollY", "scrollX", "pageYOffset", "scrollTop"],
  spoofPerformanceTiming: [
    "performance.now()",
    "requestAnimationFrame",
    "Date.now()",
  ],

  spoofKeyboardTiming: ["keydown", "keyup", "keypress"],
  blockKeyboardEvents: ["keydown", "keyup", "keypress"],

  spoofMouseMovement: [
    "mousemove",
    "mousedown",
    "mouseup",
    "pointermove",
    "MouseEvent.prototype",
  ],
  blockMouseEvents: ["mousemove", "mousedown", "mouseup", "pointermove"],

  spoofClicks: ["click", "dblclick", "contextmenu"],
  blockClickEvents: ["click", "dblclick", "contextmenu"],

  spoofTouch: ["touchstart", "touchend", "touchmove"],
  blockTouchEvents: ["touchstart", "touchend", "touchmove"],

  spoofFormInput: ["input", "change"],
  blockFormEvents: ["input", "change"],

  blockClipboard: ["copy", "cut", "paste"],
  blockSelection: ["selectionchange", "selectstart"],

  spoofScreenCapture: ["getDisplayMedia", "pixelated"],
  blockScreenCapture: ["getDisplayMedia", "captureStream"],

  blockScrollTracking: ["scroll", "wheel", "scrollend"],
};

const BLOCKING_KEYS = new Set([
  "blockTrackingRequests",
  "blockTrackingPixels",
  "blockKnownTrackers",
  "blockWebRTC",
  "blockBattery",
  "blockClipboard",
  "blockSelection",
  "blockScrollTracking",
  "blockKeyboardEvents",
  "blockMouseEvents",
  "blockClickEvents",
  "blockTouchEvents",
  "blockFormEvents",
  "blockTabEnumeration",
]);

const FEATURE_RISK = {
  blockTrackingRequests: { risk: "low", alwaysRecommend: true },
  blockTrackingPixels: { risk: "low", alwaysRecommend: true },
  blockKnownTrackers: { risk: "low", alwaysRecommend: true },
  blockWebRTC: { risk: "low", alwaysRecommend: true },
  blockBattery: { risk: "low", alwaysRecommend: true },
  blockGamepad: { risk: "low", alwaysRecommend: true },
  blockNetworkInfo: { risk: "low", alwaysRecommend: true },

  spoofHardwareConcurrency: { risk: "low", alwaysRecommend: true },
  spoofDeviceMemory: { risk: "low", alwaysRecommend: true },
  spoofCanvasNoise: { risk: "low", alwaysRecommend: true },
  spoofWebGL: { risk: "low", alwaysRecommend: true },
  spoofAudioFingerprint: { risk: "low", alwaysRecommend: true },
  spoofSpeechSynthesis: { risk: "low", alwaysRecommend: true },

  blockLinkPrefetch: { risk: "low", signals: ["any"] },
  spoofTabVisibility: { risk: "low", signals: ["any"] },
  spoofFocus: { risk: "low", signals: ["session", "any"] },
  spoofReferrer: { risk: "low", signals: ["analytics", "any"] },
  blockCacheTimingProbe: { risk: "low", signals: ["analytics"] },
  spoofScreenSize: { risk: "low", signals: ["any"] },
  spoofPerformanceTiming: { risk: "low", signals: ["any"] },
  blockPermissionsEnum: { risk: "low", signals: ["any"] },
  spoofStorageEstimate: { risk: "low", signals: ["any"] },
  spoofMediaDevices: { risk: "low", signals: ["any"] },
  blockAudioFingerprint: { risk: "low", signals: ["any"] },
  blockSpeechSynthesis: { risk: "low", signals: ["any"] },
  blockTabEnumeration: { risk: "low", signals: ["session", "any"] },
  blockSelection: { risk: "low", signals: ["behavioral"] },

  spoofKeyboardTiming: { risk: "low", signals: ["behavioral"] },
  spoofMouseMovement: { risk: "low", signals: ["behavioral"] },
  spoofClicks: { risk: "low", signals: ["behavioral", "session"] },
  spoofTouch: { risk: "low", signals: ["behavioral"] },
  spoofFormInput: { risk: "low", signals: ["behavioral"] },

  spoofScreenCapture: { risk: "low", signals: [] },
  blockScreenCapture: { risk: "low", signals: [] },

  stripTrackingParams: { risk: "medium", signals: ["analytics"] },
  spoofScrollDepth: { risk: "medium", signals: ["behavioral", "session"] },
  blockScrollTracking: { risk: "medium", signals: ["session", "behavioral"] },
  blockFontFingerprint: { risk: "medium", signals: ["analytics"] },
  blockMediaDevices: { risk: "medium", signals: ["behavioral"] },
  blockClipboard: { risk: "medium", signals: ["behavioral"] },
  spoofCamera: { risk: "medium", signals: ["behavioral"] },
  blockCamera: { risk: "medium", signals: ["behavioral"] },
  fakeGrantCamera: { risk: "medium", signals: ["behavioral"] },
  spoofMicrophone: { risk: "medium", signals: ["behavioral"] },
  blockMicrophone: { risk: "medium", signals: ["behavioral"] },
  fakeGrantMicrophone: { risk: "medium", signals: ["behavioral"] },

  blockKeyboardEvents: { risk: "high" },
  blockMouseEvents: { risk: "high" },
  blockClickEvents: { risk: "high" },
  blockTouchEvents: { risk: "high" },
  blockFormEvents: { risk: "high" },
  blockCanvas: { risk: "high" },
  blockWebGL: { risk: "high" },
};

function getDetectedSignals(items) {
  const signals = new Set();
  for (const item of items || []) {
    signals.add("any");
    const u = (item.url || "").toLowerCase();
    if (/analytic|telemetry|track/.test(u)) signals.add("analytics");
    if (/pixel|collect/.test(u)) signals.add("pixel");
    if (/behavior|biometric|keylog/.test(u)) signals.add("behavioral");
    if (/session/.test(u)) signals.add("session");
  }
  return signals;
}

function computeRecommendations(items) {
  const signals = getDetectedSignals(items);
  const recs = {};
  for (const { key } of SETTINGS_META) {
    const meta = FEATURE_RISK[key];
    if (!meta) {
      recs[key] = "optional";
      continue;
    }
    if (meta.risk === "high") {
      recs[key] = "caution";
      continue;
    }
    if (meta.alwaysRecommend) {
      recs[key] = "recommended";
      continue;
    }
    const hit = (meta.signals || []).some((s) => signals.has(s));
    recs[key] = hit && meta.risk === "low" ? "recommended" : "optional";
  }
  return recs;
}

function getFeaturesForEditing(sync) {
  const features =
    editingSiteCustom &&
    currentHost &&
    sync.siteOverrides?.[currentHost]?.features
      ? {
          ...DEFAULT_FEATURES,
          ...sync.features,
          ...sync.siteOverrides[currentHost].features,
        }
      : { ...DEFAULT_FEATURES, ...sync.features };

  for (const { key, parentKey } of SETTINGS_META) {
    if (
      parentKey &&
      key.startsWith("block") &&
      features[key] &&
      features[parentKey]
    ) {
      features[parentKey] = false;
    }
  }

  return features;
}

function renderFeaturesInto(containerEl, keysFilter, sync) {
  containerEl.textContent = "";
  const features = getFeaturesForEditing(sync);
  const disabled = !sync.enabled;
  containerEl.classList.toggle("disabled", disabled);

  const childrenOf = {};
  for (const meta of SETTINGS_META) {
    if (meta.parentKey) {
      (childrenOf[meta.parentKey] ??= []).push(meta);
    }
  }

  function makeFeatureItem(key, label, hint, isDisabled, itemParentKey = null) {
    const item = document.createElement("div");
    item.className = "feat-item";
    item.dataset.featureKey = key;

    const top = document.createElement("div");
    top.className = "feat-top";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = "feat_" + key;
    cb.checked = !!features[key];
    cb.disabled = isDisabled;

    const lbl = document.createElement("label");
    lbl.className = "feat-name";
    lbl.htmlFor = "feat_" + key;
    lbl.textContent = label;

    const recLevel = currentRecommendations[key] || "optional";
    const recDot = document.createElement("span");
    recDot.className = `rec-dot rec-${recLevel}`;
    const hasSignals = currentDiscoveredItems.length > 0;
    recDot.title =
      recLevel === "recommended"
        ? "Suggested — effective protection with minimal breakage risk" +
          (hasSignals ? "; tracking signals detected on this page" : "")
        : recLevel === "caution"
          ? "Caution — likely to break site functionality; enable only if intentional"
          : "Optional — no specific tracking signals detected for this feature, or situational use";

    top.append(cb, lbl, recDot);

    const hintEl = document.createElement("p");
    hintEl.className = "feat-hint";
    hintEl.textContent = hint;

    const tags = document.createElement("div");
    tags.className = "event-tags";
    (KEY_EVENTS[key] ?? []).forEach((ev) => {
      const t = document.createElement("span");
      t.className = "event-tag";
      t.textContent = ev;
      tags.appendChild(t);
    });

    cb.addEventListener("change", async () => {
      if (cb.checked && itemParentKey && itemParentKey.startsWith("spoof")) {
        const parentItem = containerEl.querySelector(
          `[data-feature-key="${itemParentKey}"]`,
        );
        if (parentItem) {
          const parentCb = parentItem.querySelector("input[type=checkbox]");
          if (parentCb && parentCb.checked) {
            parentCb.checked = false;
            const cfg = await readSync();
            const updates = { [key]: true, [itemParentKey]: false };
            if (editingSiteCustom && currentHost) {
              const so = { ...cfg.siteOverrides };
              const entry = so[currentHost] ?? {
                useCustom: true,
                features: {},
              };
              entry.useCustom = true;
              entry.features = {
                ...DEFAULT_FEATURES,
                ...entry.features,
                ...updates,
              };
              so[currentHost] = entry;
              await chrome.storage.sync.set({ siteOverrides: so });
              siteCustomEl.checked = true;
            } else {
              await chrome.storage.sync.set({
                features: { ...DEFAULT_FEATURES, ...cfg.features, ...updates },
              });
            }
            showReloadNotice();
            return;
          }
        }
      }

      const siblingUpdates = {};
      if (cb.checked && key.startsWith("spoof")) {
        containerEl
          .querySelectorAll(`[data-parent-key="${key}"]`)
          .forEach((childItem) => {
            const childKey = childItem.dataset.featureKey;
            const childCb = childItem.querySelector("input[type=checkbox]");
            if (childKey?.startsWith("block") && childCb?.checked) {
              childCb.checked = false;
              siblingUpdates[childKey] = false;
            }
          });
      }

      const cfg = await readSync();
      const allUpdates = { [key]: cb.checked, ...siblingUpdates };
      if (editingSiteCustom && currentHost) {
        const so = { ...cfg.siteOverrides };
        const entry = so[currentHost] ?? { useCustom: true, features: {} };
        entry.useCustom = true;
        entry.features = {
          ...DEFAULT_FEATURES,
          ...entry.features,
          ...allUpdates,
        };
        so[currentHost] = entry;
        await chrome.storage.sync.set({ siteOverrides: so });
        siteCustomEl.checked = true;
      } else {
        await chrome.storage.sync.set({
          features: { ...DEFAULT_FEATURES, ...cfg.features, ...allUpdates },
        });
      }

      containerEl
        .querySelectorAll(`[data-parent-key="${key}"]`)
        .forEach((childItem) => {
          const childCb = childItem.querySelector("input[type=checkbox]");
          if (childCb) childCb.disabled = !cb.checked || isDisabled;
          childItem.classList.toggle("feat-child-off", !cb.checked);
        });
      showReloadNotice();
    });

    item.append(top, hintEl, tags);
    return { item, cb };
  }

  for (const { key, label, hint, parentKey } of SETTINGS_META) {
    if (!keysFilter(key)) continue;
    if (parentKey) continue;

    const { item } = makeFeatureItem(key, label, hint, disabled);
    containerEl.appendChild(item);

    const children = (childrenOf[key] ?? []).filter((c) => keysFilter(c.key));
    for (const child of children) {
      const childDisabled = disabled || !features[key];
      const { item: childItem } = makeFeatureItem(
        child.key,
        child.label,
        child.hint,
        childDisabled,
        key,
      );
      childItem.classList.add("feat-child");
      childItem.dataset.parentKey = key;
      if (childDisabled) childItem.classList.add("feat-child-off");
      containerEl.appendChild(childItem);
    }
  }
}

function renderFeatures(sync) {
  const blockingEl = document.getElementById("features-list-blocking");
  const spoofingEl = document.getElementById("features-list-spoofing");

  renderFeaturesInto(
    blockingEl,
    (k) => {
      const meta = SETTINGS_META.find((m) => m.key === k);
      return BLOCKING_KEYS.has(k) && !meta?.parentKey;
    },
    sync,
  );

  renderFeaturesInto(
    spoofingEl,
    (k) => {
      return (
        !BLOCKING_KEYS.has(k) ||
        SETTINGS_META.find((m) => m.key === k)?.parentKey
      );
    },
    sync,
  );

  if (featuresHintEl)
    featuresHintEl.textContent =
      editingSiteCustom && currentHost
        ? `Custom settings — ${currentHost}`
        : "Behavioral Spoofing";
}

async function renderBlockLog() {
  if (currentTabId == null) return;
  const stats = await sendBg({ type: "getTabStats", tabId: currentTabId });
  const count = stats?.count ?? 0;
  const log = stats?.log ?? [];
  const grouped = stats?.grouped ?? {};

  blockBigEl.textContent = count;

  if (navBlockBadgeEl) {
    navBlockBadgeEl.textContent = count > 99 ? "99+" : String(count);
    navBlockBadgeEl.classList.toggle("show", count > 0);
  }

  if (count === 0) {
    blockSubEl.textContent = "none yet";
    blockLogEl.textContent = "";
    activityEl.classList.add("hidden");
    return;
  }

  activityEl.classList.remove("hidden");
  blockSubEl.textContent = `request${count === 1 ? "" : "s"} blocked`;

  blockLogEl.textContent = "";

  const groupedValues = Object.values(grouped);
  const entries = groupedValues.length
    ? groupedValues.sort((a, b) => (b.hits ?? 0) - (a.hits ?? 0)).slice(0, 15)
    : log.slice(0, 15).map((e) => ({ url: e.url, hits: 1, lastSeen: e.at }));

  for (const entry of entries) {
    const li = document.createElement("li");

    const metaEl = document.createElement("span");
    metaEl.className = "t";
    const lastTime = new Date(
      entry.lastSeen ?? entry.at ?? 0,
    ).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const firstTime = entry.firstSeen
      ? new Date(entry.firstSeen).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      : null;
    const hits = entry.hits ?? 1;
    metaEl.textContent = hits > 1 ? `${hits}×` : lastTime;
    metaEl.title =
      [
        hits > 1 ? `Last blocked: ${lastTime}` : null,
        firstTime && hits > 1 ? `First seen: ${firstTime}` : null,
        hits > 1 ? `${hits} times` : null,
      ]
        .filter(Boolean)
        .join("\n") || lastTime;

    const urlEl = document.createElement("span");
    urlEl.className = "log-url";
    urlEl.textContent = entry.url;
    urlEl.title = entry.url;

    const allowBtn = document.createElement("button");
    allowBtn.className = "log-allow-btn";
    allowBtn.textContent = "Allow";
    allowBtn.title =
      "Add exception — this URL will be allowed even if it matches a block rule";
    allowBtn.addEventListener("click", async () => {
      allowBtn.disabled = true;
      allowBtn.textContent = "…";
      const res = await sendBg({ type: "addException", url: entry.url });
      if (res?.ok) {
        allowBtn.textContent = "✓";
        li.classList.add("excepted");
        showReloadNotice();
      } else {
        allowBtn.textContent = "Err";
        allowBtn.disabled = false;
      }
    });

    li.append(metaEl, urlEl, allowBtn);
    blockLogEl.appendChild(li);
  }
}

function setDiscoverPing(count) {
  if (navDiscoverBadgeEl) {
    navDiscoverBadgeEl.textContent = count > 99 ? "99+" : String(count);
    navDiscoverBadgeEl.classList.toggle("show", count > 0);
  }
  if (menuBtnEl) menuBtnEl.classList.toggle("has-observed", count > 0);
}

async function syncObservedQueue() {
  if (currentTabId == null) return;
  try {
    const [{ result = [] } = {}] = await chrome.scripting.executeScript({
      target: { tabId: currentTabId },
      world: "MAIN",
      func: () => {
        const queue = Array.isArray(globalThis.__privacyGuardObservedQueue)
          ? globalThis.__privacyGuardObservedQueue
          : [];
        globalThis.__privacyGuardObservedQueue = [];
        return queue.slice(0, 100);
      },
    });
    if (result.length) {
      await sendBg({
        type: "recordObservedForTab",
        tabId: currentTabId,
        items: result,
      });
    }
  } catch {}
}

function patternFromUrl(rawUrl) {
  try {
    return new URL(rawUrl).pathname || rawUrl;
  } catch {
    return rawUrl;
  }
}

async function renderDiscover() {
  if (currentTabId == null || !discoverListEl) return;
  await syncObservedQueue();

  const { items = [] } = await sendBg({
    type: "getDiscovered",
    tabId: currentTabId,
  });
  discoverListEl.textContent = "";
  setDiscoverPing(items.length);

  const prevLen = currentDiscoveredItems.length;
  currentDiscoveredItems = items;
  currentRecommendations = computeRecommendations(items);
  if (items.length !== prevLen) {
    const sync = await readSync();
    renderFeatures(sync);
  }

  if (!items.length) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="empty-note">Nothing captured yet — click Start Watching, then reload or interact with the page.</span>`;
    discoverListEl.appendChild(li);
    return;
  }

  items.sort((a, b) => {
    const rank = (x) => (x.blocked ? 0 : x.isExcepted ? 1 : 2);
    const r = rank(a) - rank(b);
    return r !== 0 ? r : (b.hits ?? 0) - (a.hits ?? 0);
  });

  for (const item of items) {
    if (!item?.url) continue;

    const li = document.createElement("li");
    li.className = [
      "disc-entry",
      item.blocked ? "is-blocked" : "",
      item.isExcepted ? "is-excepted" : "",
    ]
      .filter(Boolean)
      .join(" ");

    const body = document.createElement("div");
    body.className = "disc-body";

    const urlRow = document.createElement("div");
    urlRow.className = "disc-urlrow";

    const badge = document.createElement("span");
    badge.className =
      "disc-decision " +
      (item.blocked
        ? "dec-block"
        : item.isExcepted
          ? "dec-except"
          : "dec-allow");
    badge.textContent = item.blocked
      ? "BLOCKED"
      : item.isExcepted
        ? "EXCEPTED"
        : "ALLOWED";

    const urlText = document.createElement("span");
    urlText.className = "disc-url-text";
    urlText.textContent =
      item.url.length > 90 ? item.url.slice(0, 90) + "…" : item.url;
    urlText.title = item.url;

    urlRow.append(badge, urlText);

    if (item.matchedPatterns?.length) {
      const tagRow = document.createElement("div");
      tagRow.className = "disc-tags";
      for (const p of item.matchedPatterns) {
        const tag = document.createElement("span");
        tag.className = "event-tag disc-blocked-tag";
        tag.textContent = p;
        tagRow.appendChild(tag);
      }
      body.append(urlRow, tagRow);
    } else {
      body.append(urlRow);
    }

    const meta = document.createElement("div");
    meta.className = "disc-meta";
    const lastT = item.lastSeen
      ? new Date(item.lastSeen).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      : null;
    const firstT = item.firstSeen
      ? new Date(item.firstSeen).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      : null;
    const hitsLabel =
      (item.hits ?? 1) > 1
        ? `${item.hits}× via ${item.via || "?"}`
        : `via ${item.via || "?"}`;
    const parts = [
      hitsLabel,
      item.reason ? `matched: ${item.reason}` : null,
      lastT ? `last: ${lastT}` : null,
      firstT && (item.hits ?? 1) > 1 ? `first: ${firstT}` : null,
    ].filter(Boolean);
    meta.textContent = parts.join(" · ");
    body.appendChild(meta);

    if (item.blocked && !item.isExcepted) {
      const allowBtn = document.createElement("button");
      allowBtn.className = "disc-action-btn disc-allow-btn";
      allowBtn.textContent = "Allow this URL";
      allowBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        allowBtn.disabled = true;
        allowBtn.textContent = "…";
        const res = await sendBg({ type: "addException", url: item.url });
        if (res?.ok) {
          allowBtn.textContent = "✓ Allowed (reload to apply)";
          li.classList.remove("is-blocked");
          li.classList.add("is-excepted");
          badge.className = "disc-decision dec-except";
          badge.textContent = "EXCEPTED";
          showReloadNotice();

          const { exceptions = [] } = await sendBg({ type: "getExceptions" });
          updateExceptionsBadge(countRelevantExceptions(exceptions));
        } else {
          allowBtn.textContent = "Error";
          allowBtn.disabled = false;
        }
      });
      body.appendChild(allowBtn);
    } else if (item.isExcepted) {
      const reblockBtn = document.createElement("button");
      reblockBtn.className = "disc-action-btn disc-reblock-btn";
      reblockBtn.textContent = "Re-block";
      reblockBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        reblockBtn.disabled = true;
        reblockBtn.textContent = "…";
        let pattern = item.url;
        try {
          const u = new URL(item.url);
          pattern = u.origin + u.pathname;
        } catch {}
        const res = await sendBg({ type: "removeException", pattern });
        if (res?.ok) {
          reblockBtn.textContent = "✓ Re-blocked (reload to apply)";
          showReloadNotice();
        } else {
          reblockBtn.textContent = "Error";
          reblockBtn.disabled = false;
        }
      });
      body.appendChild(reblockBtn);
    } else {
      const wrapper = document.createElement("label");
      wrapper.className = "disc-check-row";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.dataset.pattern = patternFromUrl(item.url);
      cb.dataset.url = item.url;

      wrapper.append(cb, document.createTextNode(" Add to block rules"));
      body.appendChild(wrapper);
    }

    li.appendChild(body);
    discoverListEl.appendChild(li);
  }
}

function updateExceptionsBadge(count) {
  if (!navExceptionsBadgeEl) return;
  navExceptionsBadgeEl.textContent = count > 99 ? "99+" : String(count);
  navExceptionsBadgeEl.classList.toggle("show", count > 0);
}

function countRelevantExceptions(exceptions) {
  if (!currentHost) return 0;
  return exceptions.filter((e) => {
    try {
      return normalizeHost(new URL(e).hostname) === currentHost;
    } catch {
      return false;
    }
  }).length;
}

async function renderExceptions() {
  if (!exceptionsListEl) return;
  const { exceptions = [] } = await sendBg({ type: "getExceptions" });
  updateExceptionsBadge(countRelevantExceptions(exceptions));
  exceptionsListEl.textContent = "";

  if (!exceptions.length) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="empty-note">No exceptions yet. Use "Allow" on a blocked request to add one.</span>`;
    exceptionsListEl.appendChild(li);
    return;
  }

  for (const pattern of exceptions) {
    const li = document.createElement("li");

    const span = document.createElement("span");
    span.className = "s-domain exc-pattern";
    span.textContent = pattern;
    span.title = pattern;

    const btn = document.createElement("button");
    btn.className = "rm-btn";
    btn.textContent = "×";
    btn.title = "Remove exception (will re-block on next reload)";
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      await sendBg({ type: "removeException", pattern });
      await renderExceptions();
      showReloadNotice();
    });

    li.append(span, btn);
    exceptionsListEl.appendChild(li);
  }
}

function setSessionUi(mode) {
  currentSessionMode = mode;
  for (const [name, btn] of Object.entries(sessionBtns))
    if (btn) btn.classList.toggle("active", name === mode);
}

async function setTabSession(mode) {
  if (currentTabId == null) return;
  const data = await readSession();
  const tabSession = { ...data.tabSession };
  if (mode === "default") delete tabSession[currentTabId];
  else tabSession[currentTabId] = { mode, hostname: currentHost };
  await chrome.storage.session.set({ tabSession });
  setSessionUi(mode);
  await refreshSiteStatus();
  refreshBadge();

  if (mode === "active") {
    showSettingsNotice();
  } else {
    showReloadNotice();
  }
}

async function refreshSiteStatus() {
  if (!currentHost) return;
  const sync = await readSync();
  const session = await readSession();
  const onList = hostOnAllowlist(currentHost, sync.allowlist ?? []);
  const paused = currentSessionMode === "paused";
  const sessionOn = currentSessionMode === "active";
  const snoozed = Date.now() < (session.snoozeUntil ?? 0);

  if (!sync.enabled) {
    setStatusBadge("off", "Disabled", "Extension is turned off globally.");
  } else if (snoozed) {
    setStatusBadge(
      "paused",
      "Snoozed",
      "Protection paused everywhere temporarily.",
    );
  } else if (paused) {
    setStatusBadge(
      "paused",
      "Paused",
      "Forced off on this tab until it closes.",
    );
  } else if (sessionOn) {
    setStatusBadge(
      "on",
      "Active",
      "Watching this tab. Reload if you just enabled it.",
    );
  } else if (onList) {
    setStatusBadge(
      "on",
      "Active",
      "Watching this site. Reload if you just enabled it.",
    );
  } else {
    setStatusBadge(
      "off",
      "Off",
      "Not in protected list. Use Force On, or add it in Sites.",
    );
  }

  const override = sync.siteOverrides?.[currentHost];
  editingSiteCustom = !!override?.useCustom;
  if (siteCustomEl) siteCustomEl.checked = editingSiteCustom;

  renderFeatures(sync);
}

async function loadTabContext() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const hideTabUi = () => {
    siteSectionEl.classList.add("hidden");
    activityEl.classList.add("hidden");
    quickActionsEl.classList.add("hidden");
    noTabMsgEl.classList.remove("hidden");
    headerStatusEl.classList.add("hidden");
  };

  if (!tab?.id || !tab.url) {
    hideTabUi();
    return;
  }

  try {
    const { hostname } = new URL(tab.url);
    if (!hostname || hostname.startsWith("chrome")) {
      hideTabUi();
      return;
    }

    currentTabId = tab.id;
    currentHost = normalizeHost(hostname);

    siteSectionEl.classList.remove("hidden");
    quickActionsEl.classList.remove("hidden");
    noTabMsgEl.classList.add("hidden");
    siteTitleLabelEl.textContent = currentHost;

    const session = await readSession();
    setSessionUi(session.tabSession?.[currentTabId]?.mode ?? "default");

    try {
      const { items: preDiscovered = [] } = await sendBg({
        type: "getDiscovered",
        tabId: currentTabId,
      });
      currentDiscoveredItems = preDiscovered;
    } catch {
      currentDiscoveredItems = [];
    }
    currentRecommendations = computeRecommendations(currentDiscoveredItems);

    await refreshSiteStatus();
    await renderBlockLog();
    refreshBadge();
  } catch (err) {
    console.error("[privacy-guard] loadTabContext main error:", err);
    hideTabUi();
    return;
  }

  try {
    await renderDiscover();
  } catch (err) {
    console.warn("[privacy-guard] renderDiscover error (non-fatal):", err);
  }

  try {
    const { exceptions = [] } = await sendBg({ type: "getExceptions" });
    updateExceptionsBadge(countRelevantExceptions(exceptions));
  } catch {}
}

async function load() {
  initSnoozePickers();
  const sync = await readSync();
  enabledEl.checked = sync.enabled;
  renderAllowlist(sync.allowlist ?? []);
  renderFeatures(sync);
  await renderSnoozeStatus();
  await loadTabContext();
  chrome.runtime.sendMessage({ type: "refreshAllBadges" });
}

enabledEl.addEventListener("change", async () => {
  await chrome.storage.sync.set({ enabled: enabledEl.checked });
  const sync = await readSync();
  renderFeatures(sync);
  await refreshSiteStatus();
  refreshBadge();
  showReloadNotice();
});

siteCustomEl.addEventListener("change", async () => {
  if (!currentHost) return;
  const sync = await readSync();
  const so = { ...sync.siteOverrides };
  if (siteCustomEl.checked) {
    so[currentHost] = {
      useCustom: true,
      features: { ...DEFAULT_FEATURES, ...sync.features },
    };
    editingSiteCustom = true;
  } else {
    delete so[currentHost];
    editingSiteCustom = false;
  }
  await chrome.storage.sync.set({ siteOverrides: so });
  renderFeatures(await readSync());

  if (siteCustomEl.checked) showSettingsNotice();
});

sessionBtns.default.addEventListener("click", () => setTabSession("default"));
sessionBtns.active.addEventListener("click", () => setTabSession("active"));
sessionBtns.paused.addEventListener("click", () => setTabSession("paused"));

document.getElementById("snooze-apply").addEventListener("click", async () => {
  const mins = Number(snoozeHoursEl.value) * 60 + Number(snoozeMinEl.value);
  if (mins <= 0) return;
  await chrome.storage.session.set({
    snoozeUntil: Date.now() + Math.min(mins, 1440) * 60000,
  });
  await renderSnoozeStatus();
  await refreshSiteStatus();
  refreshBadge();
});

document.getElementById("snooze-clear").addEventListener("click", async () => {
  await chrome.storage.session.set({ snoozeUntil: 0 });
  await renderSnoozeStatus();
  await refreshSiteStatus();
  refreshBadge();
});

document.getElementById("scan-tab").addEventListener("click", async () => {
  if (currentTabId == null) return;
  const startedAt = Date.now();
  try {
    await chrome.scripting.executeScript({
      target: { tabId: currentTabId },
      files: ["observe.js"],
      world: "MAIN",
    });
    await new Promise((resolve) => setTimeout(resolve, 250));
    const ready = await sendBg({
      type: "getObserveReady",
      tabId: currentTabId,
    });
    const { items = [] } = await sendBg({
      type: "getDiscovered",
      tabId: currentTabId,
    });
    if (ready?.at >= startedAt) {
      discoverStatEl.textContent = "Watching — event bridge is active.";
    } else if (items.length) {
      discoverStatEl.textContent = "Watching — observed URLs captured.";
    } else {
      discoverStatEl.textContent =
        "Watcher injected — interact with the page or reload it.";
    }
    discoverStatEl.className = "scan-msg ok";
  } catch (err) {
    console.error(err);
    discoverStatEl.textContent = "✗ Could not inject watcher — restricted tab.";
    discoverStatEl.className = "scan-msg err";
  }
  await renderDiscover();
});

document.getElementById("reload-tab").addEventListener("click", async () => {
  if (currentTabId == null) return;
  try {
    await chrome.tabs.reload(currentTabId);
    discoverStatEl.textContent =
      "Reloading — reopen Privacy Guard after the page loads.";
    discoverStatEl.className = "scan-msg ok";
  } catch (err) {
    console.error(err);
    discoverStatEl.textContent = "Could not reload this tab.";
    discoverStatEl.className = "scan-msg err";
  }
});

document
  .getElementById("block-selected")
  .addEventListener("click", async () => {
    const sync = await readSync();
    const patterns = new Set(sync.customPatterns ?? []);
    let added = 0;

    discoverListEl
      .querySelectorAll('input[type="checkbox"]:checked')
      .forEach((cb) => {
        const p = cb.dataset.pattern;
        if (p && !patterns.has(p)) {
          patterns.add(p);
          added++;
        }
      });

    if (!added) {
      discoverStatEl.textContent = "No unblocked items selected.";
      discoverStatEl.className = "scan-msg err";
      return;
    }

    const next = [...patterns].sort();
    await chrome.storage.sync.set({ customPatterns: next });
    discoverStatEl.textContent = `${added} pattern${added !== 1 ? "s" : ""} added — reload tab to apply.`;
    discoverStatEl.className = "scan-msg ok";
    showReloadNotice();
    await renderDiscover();
  });

document
  .getElementById("clear-discover")
  .addEventListener("click", async () => {
    if (currentTabId == null) return;
    await sendBg({ type: "clearDiscovered", tabId: currentTabId });
    discoverStatEl.className = "scan-msg";
    await renderDiscover();
  });

document.getElementById("clear-log").addEventListener("click", async () => {
  if (currentTabId == null) return;
  const { tabStats = {} } = await chrome.storage.session.get({ tabStats: {} });
  delete tabStats[currentTabId];
  await chrome.storage.session.set({ tabStats });
  await renderBlockLog();
  refreshBadge();
});

document
  .getElementById("add-domain")
  .addEventListener("click", () => addDomain(inputEl.value));
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addDomain(inputEl.value);
});
document
  .getElementById("add-current")
  .addEventListener("click", () => addDomain(currentHost ?? inputEl.value));

document.getElementById("qa-add-site").addEventListener("click", () => {
  addDomain(currentHost ?? "");
});
document.getElementById("qa-discover").addEventListener("click", () => {
  showPanel("discover");
});

load();
