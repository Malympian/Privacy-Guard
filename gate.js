const privacyGuardSeenMessages = new Set();

function forwardPgMessage(data) {
  if (!data?.__privacyGuard) return;
  if (data.id) {
    if (privacyGuardSeenMessages.has(data.id)) return;
    privacyGuardSeenMessages.add(data.id);
    if (privacyGuardSeenMessages.size > 200) {
      privacyGuardSeenMessages.delete(
        privacyGuardSeenMessages.values().next().value,
      );
    }
  }

  let msg = null;

  if (data.type === "block") {
    msg = { type: "recordBlock", url: String(data.url ?? "") };
  } else if (data.type === "observe") {
    msg = { type: "recordObserve", detail: data.detail ?? {} };
  } else if (data.type === "observeReady") {
    msg = { type: "recordObserveReady" };
  }

  if (!msg) return;

  try {
    chrome.runtime.sendMessage(msg, () => {
      void chrome.runtime.lastError;
    });
  } catch {}
}

function forwardPgDomMessage(event) {
  let data = null;

  if (typeof event?.detail === "string") {
    try {
      data = JSON.parse(event.detail);
    } catch {
      data = null;
    }
  }

  if (!data) {
    const root = document.documentElement;
    const raw = root?.dataset?.privacyGuardMessage;
    if (!raw) return;
    delete root.dataset.privacyGuardMessage;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
  }

  forwardPgMessage(data);
}

window.addEventListener(
  "message",
  (event) => {
    if (event.source && event.source !== window) return;
    forwardPgMessage(event.data);
  },
  true,
);

document.addEventListener("__privacyGuardMessage", forwardPgDomMessage, true);

function injectConfigAndGuard(config) {
  if (globalThis.__privacyGuardInjecting) return;
  globalThis.__privacyGuardInjecting = true;

  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("guard.js");
  script.dataset.privacyGuardConfig = JSON.stringify(config);
  script.onload = () => script.remove();
  document.documentElement.appendChild(script);
}

const PG_CACHE_PREFIX = "__pgConfigCache:";

function pgCacheKey() {
  return PG_CACHE_PREFIX + location.hostname;
}

function readCachedDecision() {
  try {
    const raw = localStorage.getItem(pgCacheKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedDecision(response) {
  try {
    if (response?.inject && response.config) {
      localStorage.setItem(
        pgCacheKey(),
        JSON.stringify({ inject: true, config: response.config }),
      );
    } else {
      localStorage.removeItem(pgCacheKey());
    }
  } catch {}
}

function applyCachedConfigSynchronously() {
  const cached = readCachedDecision();
  if (cached?.inject && cached.config && document.documentElement) {
    document.documentElement.dataset.privacyGuardConfig = JSON.stringify(
      cached.config,
    );
    return true;
  }
  return false;
}

function requestInject(hadSyncCacheHit) {
  const hostname = location.hostname;
  if (!hostname) return;

  chrome.runtime.sendMessage(
    { type: "getInjectConfig", hostname },
    (response) => {
      if (chrome.runtime.lastError) return;

      writeCachedDecision(response);

      if (!response?.inject) return;

      if (hadSyncCacheHit) return;

      injectConfigAndGuard(response.config);
    },
  );
}

const __pgHadSyncCacheHit = applyCachedConfigSynchronously();

if (document.documentElement) {
  requestInject(__pgHadSyncCacheHit);
} else {
  document.addEventListener(
    "readystatechange",
    () => {
      if (document.documentElement) requestInject(__pgHadSyncCacheHit);
    },
    { once: true },
  );
}
