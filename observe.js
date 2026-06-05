(function () {
  function emitPgMessage(message) {
    message.id ??= `pg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    if (message.type === "observe" && message.detail?.url) {
      globalThis.__privacyGuardObservedQueue ??= [];
      globalThis.__privacyGuardObservedQueue.push(message.detail);
      if (globalThis.__privacyGuardObservedQueue.length > 100) {
        globalThis.__privacyGuardObservedQueue.splice(0, globalThis.__privacyGuardObservedQueue.length - 100);
      }
    }
    window.postMessage(message, "*");

    try {
      const raw = JSON.stringify(message);
      document.documentElement.dataset.privacyGuardMessage = raw;
      document.dispatchEvent(new CustomEvent("__privacyGuardMessage", { detail: raw }));
    } catch {
      // DOM bridge unavailable; postMessage path above may still work.
    }
  }

  if (globalThis.__privacyGuardInstalled && globalThis.__privacyGuardObservesRequests) {
    emitPgMessage({ __privacyGuard: true, type: "observeReady" });
    console.info("[privacy-guard] protection already running — URL watch is active");
    return;
  }
  if (globalThis.__privacyGuardObserve) return;
  globalThis.__privacyGuardObserve = true;

  const HEURISTIC =
    /track|analytics|telemetry|beacon|metric|events?|behavior|biometric|keylog|proctor|quiz|session|collect|pixel|stats|error_report|sevents/i;

  function emit(url, via) {
    const s = url instanceof Request ? url.url : String(url ?? "");
    if (!s || !HEURISTIC.test(s)) return;
    emitPgMessage({ __privacyGuard: true, type: "observe", detail: { url: s, via } });
  }

  emitPgMessage({ __privacyGuard: true, type: "observeReady" });

  if (!navigator.sendBeacon.__pgObserve) {
    const nativeBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url, data) {
      emit(url, "beacon");
      return nativeBeacon(url, data);
    };
    navigator.sendBeacon.__pgObserve = true;
  }

  if (!XMLHttpRequest.prototype.open.__pgObserve) {
    const xhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this.__pgUrl = url;
      emit(url, "xhr");
      return xhrOpen.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.open.__pgObserve = true;
  }

  if (!globalThis.fetch.__pgObserve) {
    const nativeFetch = globalThis.fetch;
    globalThis.fetch = function (...args) {
      emit(args[0], "fetch");
      return nativeFetch.apply(globalThis, args);
    };
    globalThis.fetch.__pgObserve = true;
  }

  console.info("[privacy-guard] observing tracking-like URLs on this tab");
})();