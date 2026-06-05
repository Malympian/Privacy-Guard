// popup.js — nav-panel architecture
// Works with settings-meta.js (SETTINGS_META, DEFAULT_FEATURES)

// ── DOM refs ─────────────────────────────────────────────────────────────────
const enabledEl          = document.getElementById("enabled");
const inputEl            = document.getElementById("domain-input");
const allowlistEl        = document.getElementById("allowlist");
const siteSectionEl      = document.getElementById("current-site");
const activityEl         = document.getElementById("activity");
const discoverEl         = document.getElementById("panel-discover");
const noTabMsgEl         = document.getElementById("no-tab-msg");
const quickActionsEl     = document.getElementById("quick-actions");
const siteTitleLabelEl   = document.getElementById("site-title-label");
const siteStatusEl       = document.getElementById("site-status");
const statusBadgeEl      = document.getElementById("status-badge");
const statusLabelEl      = document.getElementById("status-label");
const siteCustomEl       = document.getElementById("site-use-custom");
const blockBigEl         = document.getElementById("block-big");
const blockSubEl         = document.getElementById("block-sub");
const blockLogEl         = document.getElementById("block-log");
const snoozeStatusEl     = document.getElementById("snooze-status");
const snoozeHoursEl      = document.getElementById("snooze-hours");
const snoozeMinEl        = document.getElementById("snooze-minutes");
const discoverStatEl     = document.getElementById("discover-status");
const discoverListEl     = document.getElementById("discover-list");
const headerStatusEl     = document.getElementById("header-status");
const headerStatusLabelEl= document.getElementById("header-status-label");
const navBlockBadgeEl    = document.getElementById("nav-block-badge");
const navDiscoverBadgeEl = document.getElementById("nav-discover-badge");
const navExceptionsBadgeEl = document.getElementById("nav-exceptions-badge");
const exceptionsListEl   = document.getElementById("exceptions-list");
const reloadNoticeEl     = document.getElementById("reload-notice");
const featuresHintEl     = document.getElementById("features-hint");

const sessionBtns = {
  default: document.getElementById("session-default"),
  active:  document.getElementById("session-active"),
  paused:  document.getElementById("session-paused"),
};

let currentTabId       = null;
let currentHost        = null;
let currentSessionMode = "default";
let editingSiteCustom  = false;

// ── Nav / Drawer ──────────────────────────────────────────────────────────────
const menuBtnEl   = document.getElementById("menu-btn");
const navDrawerEl = document.getElementById("nav-drawer");
const overlayEl   = document.getElementById("drawer-overlay");

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
  navDrawerEl.classList.contains("open") ? closeDrawer() : openDrawer()
);
overlayEl.addEventListener("click", closeDrawer);

// Panel switching
const panels   = document.querySelectorAll(".panel");
const navItems = document.querySelectorAll(".nav-item[data-panel]");

function showPanel(id) {
  panels.forEach(p => p.classList.toggle("active", p.id === "panel-" + id));
  navItems.forEach(n => n.classList.toggle("active", n.dataset.panel === id));
  closeDrawer();
  // Trigger panel-specific renders
  if (id === "exceptions") renderExceptions();
  if (id === "discover")   renderDiscover();
}

navItems.forEach(btn => {
  btn.addEventListener("click", () => showPanel(btn.dataset.panel));
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function normalizeDomain(raw) {
  let s = raw.trim().toLowerCase();
  if (!s) return "";
  s = s.replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
  if (s.startsWith("www.")) s = s.slice(4);
  return s;
}
function normalizeHost(hostname) {
  let h = hostname.toLowerCase();
  if (h.startsWith("www.")) h = h.slice(4);
  return h;
}
function hostOnAllowlist(host, allowlist) {
  return (allowlist ?? []).some(entry => {
    let rule = entry.trim().toLowerCase();
    if (!rule) return false;
    if (rule.startsWith("*.")) rule = rule.slice(2);
    return host === rule || host.endsWith("." + rule);
  });
}
async function sendBg(msg) {
  try { return (await chrome.runtime.sendMessage(msg)) ?? {}; }
  catch { return {}; }
}
function refreshBadge() {
  chrome.runtime.sendMessage({ type: "refreshBadge", tabId: currentTabId ?? -1 });
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (tabs[0]?.id != null)
      chrome.runtime.sendMessage({ type: "refreshBadge", tabId: tabs[0].id });
  });
}
async function readSync() {
  return chrome.storage.sync.get({
    enabled:       true,
    allowlist:     [],
    features:      { ...DEFAULT_FEATURES },
    siteOverrides: {},
    customPatterns:[],
    exceptions:    [],   // ← new
  });
}
async function readSession() {
  return chrome.storage.session.get({ tabSession: {}, snoozeUntil: 0 });
}

// ── Reload notice ─────────────────────────────────────────────────────────────
// Shows a clickable banner after any exception change.
let _reloadNoticePending = false;
function showReloadNotice() {
  if (_reloadNoticePending || !reloadNoticeEl) return;
  _reloadNoticePending = true;
  reloadNoticeEl.classList.remove("hidden");
  reloadNoticeEl.onclick = () => {
    if (currentTabId != null) chrome.tabs.reload(currentTabId);
    reloadNoticeEl.classList.add("hidden");
    _reloadNoticePending = false;
  };
}

// ── Header status pill ────────────────────────────────────────────────────────
function setHeaderStatus(state, label) {
  if (!currentHost) { headerStatusEl.classList.add("hidden"); return; }
  headerStatusEl.className = "header-status " + state;
  headerStatusLabelEl.textContent = label;
  headerStatusEl.classList.remove("hidden");
}

// ── Status badge ──────────────────────────────────────────────────────────────
function setStatusBadge(state, label, detail) {
  statusBadgeEl.className = "badge " + state;
  statusLabelEl.textContent = label;
  if (siteStatusEl) siteStatusEl.textContent = detail ?? "";
  setHeaderStatus(state, label);
}

// ── Snooze ────────────────────────────────────────────────────────────────────
function initSnoozePickers() {
  for (let h = 0; h <= 24; h++) {
    const o = document.createElement("option");
    o.value = h; o.textContent = h;
    snoozeHoursEl.appendChild(o);
  }
  for (let m = 0; m < 60; m++) {
    const o = document.createElement("option");
    o.value = m; o.textContent = String(m).padStart(2, "0");
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

// ── Allowlist ─────────────────────────────────────────────────────────────────
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
      const next = cfg.allowlist.filter(d => d !== domain);
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
  if (list.includes(domain)) { inputEl.value = ""; return; }
  const next = [...list, domain].sort();
  await chrome.storage.sync.set({ allowlist: next });
  inputEl.value = "";
  renderAllowlist(next);
  await refreshSiteStatus();
  refreshBadge();
}

// ── Features ──────────────────────────────────────────────────────────────────
const KEY_EVENTS = {
  blockTrackingRequests: ["fetch", "XHR", "sendBeacon"],
  blockTrackingPixels:   ["img.src"],
  blockKnownTrackers:    ["domain", "hostname"],
  spoofTabVisibility:    ["visibilitychange", "document.hidden"],
  spoofKeyboardTiming:   ["keydown", "keyup", "keypress"],
  spoofMouseMovement:    ["mousemove", "mousedown", "mouseup", "pointermove", "MouseEvent.prototype"],
  spoofClicks:           ["click", "dblclick", "contextmenu"],
  spoofTouch:            ["touchstart", "touchend", "touchmove"],
  spoofFocus:            ["focus", "blur", "focusin", "focusout"],
  spoofFormInput:        ["input", "change"],
  spoofPerformanceTiming: ["performance.now()", "requestAnimationFrame", "Date.now()"],
};

const BLOCKING_KEYS = new Set(["blockTrackingRequests", "blockTrackingPixels", "blockKnownTrackers"]);

function getFeaturesForEditing(sync) {
  if (editingSiteCustom && currentHost && sync.siteOverrides?.[currentHost]?.features)
    return { ...DEFAULT_FEATURES, ...sync.features, ...sync.siteOverrides[currentHost].features };
  return { ...DEFAULT_FEATURES, ...sync.features };
}

function renderFeaturesInto(containerEl, keysFilter, sync) {
  containerEl.textContent = "";
  const features = getFeaturesForEditing(sync);
  const disabled = !sync.enabled;
  containerEl.classList.toggle("disabled", disabled);

  for (const { key, label, hint } of SETTINGS_META) {
    if (!keysFilter(key)) continue;

    const item = document.createElement("div");
    item.className = "feat-item";

    const top = document.createElement("div");
    top.className = "feat-top";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = "feat_" + key;
    cb.checked = !!features[key];
    cb.disabled = disabled;

    const lbl = document.createElement("label");
    lbl.className = "feat-name";
    lbl.htmlFor = "feat_" + key;
    lbl.textContent = label;

    top.append(cb, lbl);

    const hintEl = document.createElement("p");
    hintEl.className = "feat-hint";
    hintEl.textContent = hint;

    const tags = document.createElement("div");
    tags.className = "event-tags";
    (KEY_EVENTS[key] ?? []).forEach(ev => {
      const t = document.createElement("span");
      t.className = "event-tag";
      t.textContent = ev;
      tags.appendChild(t);
    });

    cb.addEventListener("change", async () => {
      const cfg = await readSync();
      if (editingSiteCustom && currentHost) {
        const so = { ...cfg.siteOverrides };
        const entry = so[currentHost] ?? { useCustom: true, features: {} };
        entry.useCustom = true;
        entry.features = { ...DEFAULT_FEATURES, ...entry.features, [key]: cb.checked };
        so[currentHost] = entry;
        await chrome.storage.sync.set({ siteOverrides: so });
        siteCustomEl.checked = true;
      } else {
        await chrome.storage.sync.set({ features: { ...DEFAULT_FEATURES, ...cfg.features, [key]: cb.checked } });
      }
    });

    item.append(top, hintEl, tags);
    containerEl.appendChild(item);
  }
}

function renderFeatures(sync) {
  const blockingEl = document.getElementById("features-list-blocking");
  const spoofingEl = document.getElementById("features-list-spoofing");
  renderFeaturesInto(blockingEl, k => BLOCKING_KEYS.has(k), sync);
  renderFeaturesInto(spoofingEl, k => !BLOCKING_KEYS.has(k), sync);

  if (featuresHintEl)
    featuresHintEl.textContent = editingSiteCustom && currentHost
      ? `Custom settings — ${currentHost}`
      : "Behavioral Spoofing";
}

// ── Block log ─────────────────────────────────────────────────────────────────
async function renderBlockLog() {
  if (currentTabId == null) return;
  const stats = await sendBg({ type: "getTabStats", tabId: currentTabId });
  const count = stats?.count ?? 0;
  const log   = stats?.log   ?? [];

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
  for (const entry of log.slice(0, 15)) {
    const li = document.createElement("li");

    const timeEl = document.createElement("span");
    timeEl.className = "t";
    timeEl.textContent = new Date(entry.at).toLocaleTimeString();

    const urlEl = document.createElement("span");
    urlEl.className = "log-url";
    urlEl.textContent = entry.url;
    urlEl.title = entry.url;

    // "Allow" button — adds an exception so this URL is no longer blocked
    const allowBtn = document.createElement("button");
    allowBtn.className = "log-allow-btn";
    allowBtn.textContent = "Allow";
    allowBtn.title = "Add exception — this URL will be allowed even if it matches a block rule";
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

    li.append(timeEl, urlEl, allowBtn);
    blockLogEl.appendChild(li);
  }
}

// ── Discovery ─────────────────────────────────────────────────────────────────
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
          ? globalThis.__privacyGuardObservedQueue : [];
        globalThis.__privacyGuardObservedQueue = [];
        return queue.slice(0, 100);
      },
    });
    if (result.length) {
      await sendBg({ type: "recordObservedForTab", tabId: currentTabId, items: result });
    }
  } catch {
    // Some tabs cannot be scripted; the message bridge may still work.
  }
}

/**
 * Derive a blocking-pattern from a full URL (same logic as background.js
 * exception derivation, but for the "Block" direction we want just the pathname).
 */
function patternFromUrl(rawUrl) {
  try {
    return new URL(rawUrl).pathname || rawUrl;
  } catch {
    return rawUrl;
  }
}

/**
 * Render the Observed URLs panel.
 *
 * Items now come from background.js with full structure:
 *   { url, hits, via, matchedPatterns[], decision, reason, blocked, isExcepted, lastSeen }
 *
 * Layout:
 *   BLOCKED  items → "Allow this URL" button    (adds exception)
 *   ALLOWED  items → checkbox (select to block) + "ALLOW" badge
 *   EXCEPTED items → "Re-block" button          (removes exception)
 */
async function renderDiscover() {
  if (currentTabId == null || !discoverListEl) return;
  await syncObservedQueue();

  const { items = [] } = await sendBg({ type: "getDiscovered", tabId: currentTabId });
  discoverListEl.textContent = "";
  setDiscoverPing(items.length);

  if (!items.length) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="empty-note">Nothing captured yet — click Start Watching, then reload or interact with the page.</span>`;
    discoverListEl.appendChild(li);
    return;
  }

  // Sort: blocked first, then excepted, then allowed; ties by hit count desc
  items.sort((a, b) => {
    const rank = x => x.blocked ? 0 : x.isExcepted ? 1 : 2;
    const r = rank(a) - rank(b);
    return r !== 0 ? r : (b.hits ?? 0) - (a.hits ?? 0);
  });

  for (const item of items) {
    if (!item?.url) continue;

    const li = document.createElement("li");
    li.className = [
      "disc-entry",
      item.blocked    ? "is-blocked"  : "",
      item.isExcepted ? "is-excepted" : "",
    ].filter(Boolean).join(" ");

    const body = document.createElement("div");
    body.className = "disc-body";

    // ── URL row: decision badge + truncated URL ───────────────────────────
    const urlRow = document.createElement("div");
    urlRow.className = "disc-urlrow";

    const badge = document.createElement("span");
    badge.className = "disc-decision " + (
      item.blocked    ? "dec-block"  :
      item.isExcepted ? "dec-except" : "dec-allow"
    );
    badge.textContent = item.blocked ? "BLOCKED" : item.isExcepted ? "EXCEPTED" : "ALLOWED";

    const urlText = document.createElement("span");
    urlText.className = "disc-url-text";
    urlText.textContent = item.url.length > 90 ? item.url.slice(0, 90) + "…" : item.url;
    urlText.title = item.url;

    urlRow.append(badge, urlText);

    // ── Matched-pattern tags ──────────────────────────────────────────────
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

    // ── Meta line ─────────────────────────────────────────────────────────
    const meta = document.createElement("div");
    meta.className = "disc-meta";
    const parts = [
      `${item.hits ?? 1}× via ${item.via || "?"}`,
      item.reason ? `matched: ${item.reason}` : null,
      item.lastSeen ? new Date(item.lastSeen).toLocaleTimeString() : null,
    ].filter(Boolean);
    meta.textContent = parts.join(" · ");
    body.appendChild(meta);

    // ── Action button ─────────────────────────────────────────────────────
    if (item.blocked && !item.isExcepted) {
      // Allow this URL — add an exception
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
          // Update the exceptions badge
          const { exceptions = [] } = await sendBg({ type: "getExceptions" });
          updateExceptionsBadge(countRelevantExceptions(exceptions));
        } else {
          allowBtn.textContent = "Error";
          allowBtn.disabled = false;
        }
      });
      body.appendChild(allowBtn);

    } else if (item.isExcepted) {
      // Re-block — remove the exception
      const reblockBtn = document.createElement("button");
      reblockBtn.className = "disc-action-btn disc-reblock-btn";
      reblockBtn.textContent = "Re-block";
      reblockBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        reblockBtn.disabled = true;
        reblockBtn.textContent = "…";
        let pattern = item.url;
        try { const u = new URL(item.url); pattern = u.origin + u.pathname; } catch {}
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
      // Unblocked item — show checkbox so user can select it for blocking
      const wrapper = document.createElement("label");
      wrapper.className = "disc-check-row";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.dataset.pattern = patternFromUrl(item.url); // pathname used as block pattern
      cb.dataset.url = item.url;

      wrapper.append(cb, document.createTextNode(" Add to block rules"));
      body.appendChild(wrapper);
    }

    li.appendChild(body);
    discoverListEl.appendChild(li);
  }
}

// ── Exceptions panel ──────────────────────────────────────────────────────────
function updateExceptionsBadge(count) {
  if (!navExceptionsBadgeEl) return;
  navExceptionsBadgeEl.textContent = count > 99 ? "99+" : String(count);
  navExceptionsBadgeEl.classList.toggle("show", count > 0);
}

/**
 * Count only exception rules whose origin hostname matches the current tab.
 * Exception patterns are stored as "origin+pathname" strings, e.g.
 * "https://example.com/events", so we parse and compare hostnames.
 * Returns 0 when there is no active tab context.
 */
function countRelevantExceptions(exceptions) {
  if (!currentHost) return 0;
  return exceptions.filter(e => {
    try { return normalizeHost(new URL(e).hostname) === currentHost; }
    catch { return false; }
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

// ── Session ───────────────────────────────────────────────────────────────────
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
}

// ── Site status ───────────────────────────────────────────────────────────────
async function refreshSiteStatus() {
  if (!currentHost) return;
  const sync    = await readSync();
  const session = await readSession();
  const onList    = hostOnAllowlist(currentHost, sync.allowlist ?? []);
  const paused    = currentSessionMode === "paused";
  const sessionOn = currentSessionMode === "active";
  const snoozed   = Date.now() < (session.snoozeUntil ?? 0);

  if (!sync.enabled) {
    setStatusBadge("off", "Disabled", "Extension is turned off globally.");
  } else if (snoozed) {
    setStatusBadge("paused", "Snoozed", "Protection paused everywhere temporarily.");
  } else if (paused) {
    setStatusBadge("paused", "Paused", "Forced off on this tab until it closes.");
  } else if (sessionOn) {
    setStatusBadge("on", "Active", "Watching this tab. Reload if you just enabled it.");
  } else if (onList) {
    setStatusBadge("on", "Active", "Watching this site. Reload if you just enabled it.");
  } else {
    setStatusBadge("off", "Off", "Not in protected list. Use Force On, or add it in Sites.");
  }

  const override = sync.siteOverrides?.[currentHost];
  editingSiteCustom = !!override?.useCustom;
  if (siteCustomEl) siteCustomEl.checked = editingSiteCustom;

  renderFeatures(sync);
}

// ── Tab context ───────────────────────────────────────────────────────────────
// IMPORTANT: renderDiscover() runs in its OWN try/catch below.
// Previously it shared the outer catch which called hideTabUi() — causing the
// dashboard to vanish whenever renderDiscover threw a TypeError.
async function loadTabContext() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const hideTabUi = () => {
    siteSectionEl.classList.add("hidden");
    activityEl.classList.add("hidden");
    quickActionsEl.classList.add("hidden");
    noTabMsgEl.classList.remove("hidden");
    headerStatusEl.classList.add("hidden");
  };

  if (!tab?.id || !tab.url) { hideTabUi(); return; }

  // Main UI setup — a crash here genuinely means no usable tab
  try {
    const { hostname } = new URL(tab.url);
    if (!hostname || hostname.startsWith("chrome")) { hideTabUi(); return; }

    currentTabId = tab.id;
    currentHost  = normalizeHost(hostname);

    siteSectionEl.classList.remove("hidden");
    quickActionsEl.classList.remove("hidden");
    noTabMsgEl.classList.add("hidden");
    siteTitleLabelEl.textContent = currentHost;

    const session = await readSession();
    setSessionUi(session.tabSession?.[currentTabId]?.mode ?? "default");

    await refreshSiteStatus();
    await renderBlockLog();
    refreshBadge();
  } catch (err) {
    console.error("[privacy-guard] loadTabContext main error:", err);
    hideTabUi();
    return;
  }

  // renderDiscover in its own catch — a crash here must NOT hide the dashboard
  try {
    await renderDiscover();
  } catch (err) {
    console.warn("[privacy-guard] renderDiscover error (non-fatal):", err);
  }

  // Populate exceptions badge
  try {
    const { exceptions = [] } = await sendBg({ type: "getExceptions" });
    updateExceptionsBadge(countRelevantExceptions(exceptions));
  } catch { /* ignore */ }
}

// ── Init ──────────────────────────────────────────────────────────────────────
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

// ── Event wiring ──────────────────────────────────────────────────────────────
enabledEl.addEventListener("change", async () => {
  await chrome.storage.sync.set({ enabled: enabledEl.checked });
  const sync = await readSync();
  renderFeatures(sync);
  await refreshSiteStatus();
  refreshBadge();
});

siteCustomEl.addEventListener("change", async () => {
  if (!currentHost) return;
  const sync = await readSync();
  const so = { ...sync.siteOverrides };
  if (siteCustomEl.checked) {
    so[currentHost] = { useCustom: true, features: { ...DEFAULT_FEATURES, ...sync.features } };
    editingSiteCustom = true;
  } else {
    delete so[currentHost];
    editingSiteCustom = false;
  }
  await chrome.storage.sync.set({ siteOverrides: so });
  renderFeatures(await readSync());
});

sessionBtns.default.addEventListener("click", () => setTabSession("default"));
sessionBtns.active.addEventListener("click",  () => setTabSession("active"));
sessionBtns.paused.addEventListener("click",  () => setTabSession("paused"));

document.getElementById("snooze-apply").addEventListener("click", async () => {
  const mins = Number(snoozeHoursEl.value) * 60 + Number(snoozeMinEl.value);
  if (mins <= 0) return;
  await chrome.storage.session.set({ snoozeUntil: Date.now() + Math.min(mins, 1440) * 60000 });
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
    await new Promise(resolve => setTimeout(resolve, 250));
    const ready = await sendBg({ type: "getObserveReady", tabId: currentTabId });
    const { items = [] } = await sendBg({ type: "getDiscovered", tabId: currentTabId });
    if (ready?.at >= startedAt) {
      discoverStatEl.textContent = "Watching — event bridge is active.";
    } else if (items.length) {
      discoverStatEl.textContent = "Watching — observed URLs captured.";
    } else {
      discoverStatEl.textContent = "Watcher injected — interact with the page or reload it.";
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
    discoverStatEl.textContent = "Reloading — reopen Privacy Guard after the page loads.";
    discoverStatEl.className = "scan-msg ok";
  } catch (err) {
    console.error(err);
    discoverStatEl.textContent = "Could not reload this tab.";
    discoverStatEl.className = "scan-msg err";
  }
});

// "Block Selected" — adds pathname patterns to customPatterns for unblocked items
document.getElementById("block-selected").addEventListener("click", async () => {
  const sync = await readSync();
  const patterns = new Set(sync.customPatterns ?? []);
  let added = 0;

  discoverListEl.querySelectorAll("input[type=\"checkbox\"]:checked").forEach(cb => {
    const p = cb.dataset.pattern;
    if (p && !patterns.has(p)) { patterns.add(p); added++; }
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

document.getElementById("clear-discover").addEventListener("click", async () => {
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

document.getElementById("add-domain").addEventListener("click", () => addDomain(inputEl.value));
inputEl.addEventListener("keydown", e => { if (e.key === "Enter") addDomain(inputEl.value); });
document.getElementById("add-current").addEventListener("click", () => addDomain(currentHost ?? inputEl.value));

document.getElementById("qa-add-site").addEventListener("click", () => {
  addDomain(currentHost ?? "");
});
document.getElementById("qa-discover").addEventListener("click", () => {
  showPanel("discover");
});

load();