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

function requestInject() {
  const hostname = location.hostname;
  if (!hostname) return;

  chrome.runtime.sendMessage(
    { type: "getInjectConfig", hostname },
    (response) => {
      if (chrome.runtime.lastError) return;
      if (!response?.inject) return;

      injectConfigAndGuard(response.config);
    },
  );
}

if (document.documentElement) {
  requestInject();
} else {
  document.addEventListener(
    "readystatechange",
    () => {
      if (document.documentElement) requestInject();
    },
    { once: true },
  );
}
