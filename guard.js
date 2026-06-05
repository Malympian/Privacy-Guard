(function () {
  "use strict";

  if (globalThis.__privacyGuardInstalled) {
    console.info("[privacy-guard] already installed — skipping re-patch");
    return;
  }
  globalThis.__privacyGuardInstalled = true;

  function readConfig() {
    const raw = document.currentScript?.dataset?.privacyGuardConfig;
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch (err) {
        console.warn("[privacy-guard] invalid config found — aborting", err);
        return null;
      }
    }
    return globalThis.__PRIVACY_GUARD_CONFIG__;
  }

  const cfg = readConfig();
  if (!cfg) {
    console.warn("[privacy-guard] no config found — aborting");
    return;
  }
  globalThis.__privacyGuardObservesRequests = true;

  const features        = cfg.features        ?? {};
  const blockedPatterns = cfg.blockedPatterns  ?? [];
  const exceptions      = cfg.exceptions       ?? [];   // ← new: allow-rules

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /** Tell the background a request was blocked (shows up in the block log). */
  function emitPgMessage(message) {
    message.id ??= `pg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    if (message.type === "observe" && message.detail?.url) {
      globalThis.__privacyGuardObservedQueue ??= [];
      globalThis.__privacyGuardObservedQueue.push(message.detail);
      if (globalThis.__privacyGuardObservedQueue.length > 100) {
        globalThis.__privacyGuardObservedQueue.splice(
          0,
          globalThis.__privacyGuardObservedQueue.length - 100
        );
      }
    }
    window.postMessage(message, "*");

    try {
      const raw = JSON.stringify(message);
      document.documentElement.dataset.privacyGuardMessage = raw;
      document.dispatchEvent(
        new CustomEvent("__privacyGuardMessage", { detail: raw })
      );
    } catch {
      // DOM bridge unavailable; postMessage path above may still work.
    }
  }

  function postBlock(url) {
    emitPgMessage({ __privacyGuard: true, type: "block", url: String(url) });
  }

  const OBSERVE_HEURISTIC =
    /track|analytics|telemetry|beacon|metric|events?|behavior|biometric|keylog|proctor|quiz|session|collect|pixel|stats|error_report|sevents/i;

  /** Tell the background a telemetry-like request was seen. */
  function postObserve(url, via, blocked = false) {
    const s = url instanceof Request ? url.url : String(url ?? "");
    if (!s || !OBSERVE_HEURISTIC.test(s)) return;
    const matchedPattern = blockedPatterns.find((p) => s.includes(p)) ?? null;
    emitPgMessage({
      __privacyGuard: true,
      type: "observe",
      detail: { url: s, via, blocked, matchedPattern },
    });
  }

  /**
   * Returns true if the URL matches a blocked pattern AND is NOT covered
   * by an exception rule.
   *
   * Exceptions are stored as origin+pathname strings, e.g.
   *   "https://example.com/events"
   * and match any URL that contains that substring (so query params don't
   * prevent the match).
   */
  function isBlocked(url) {
    const s = url instanceof Request ? url.url : String(url ?? "");

    // Exception check — if any exception rule covers this URL, allow it.
    if (exceptions.some((e) => s.includes(e))) return false;

    return blockedPatterns.some((p) => s.includes(p));
  }

  /** Jitter: random integer in [0, max). */
  function randMs(max) { return Math.floor(Math.random() * max); }

  /** Coordinate jitter: small float in [-range, +range]. */
  function randPx(range) { return (Math.random() - 0.5) * range * 2; }

  // ─── 1. Block tracking network requests ───────────────────────────────────

  if (globalThis.__privacyGuardObservesRequests || features.blockTrackingRequests) {

    // fetch
    const _fetch = globalThis.fetch;
    globalThis.fetch = function (...args) {
      const url = args[0] instanceof Request ? args[0].url : String(args[0] ?? "");
      const blocked = !!features.blockTrackingRequests && isBlocked(url);
      postObserve(url, "fetch", blocked);
      if (blocked) {
        postBlock(url);
        return Promise.resolve(new Response("", { status: 200 }));
      }
      return _fetch.apply(this, args);
    };
    globalThis.fetch.__pgPatched = true;

    // XMLHttpRequest
    const _xhrOpen = XMLHttpRequest.prototype.open;
    const _xhrSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this.__pgUrl     = String(url ?? "");
      this.__pgBlocked = !!features.blockTrackingRequests && isBlocked(this.__pgUrl);
      postObserve(this.__pgUrl, "xhr", this.__pgBlocked);
      return _xhrOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function (body) {
      if (this.__pgBlocked) {
        postBlock(this.__pgUrl);
        return; // silently swallow
      }
      return _xhrSend.call(this, body);
    };

    // navigator.sendBeacon
    const _beacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url, data) {
      const blocked = !!features.blockTrackingRequests && isBlocked(url);
      postObserve(url, "beacon", blocked);
      if (blocked) {
        postBlock(String(url));
        return true;
      }
      return _beacon(url, data);
    };
  }

  // ─── 2. Block tracking pixels ─────────────────────────────────────────────

  if (features.blockTrackingPixels) {
    const BLANK_GIF =
      "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

    function checkImg(node) {
      if (node.nodeType !== 1) return;
      if (node.tagName === "IMG") {
        const src = node.getAttribute("src") || "";
        if (src && isBlocked(src)) {
          node.setAttribute("src", BLANK_GIF);
          postBlock(src);
        }
      }
      node.querySelectorAll?.("img").forEach(checkImg);
    }

    new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach(checkImg);
        if (
          m.type === "attributes" &&
          m.attributeName === "src" &&
          m.target.tagName === "IMG"
        ) {
          checkImg(m.target);
        }
      }
    }).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src"],
    });
  }

  // ─── 3. Spoof tab visibility ───────────────────────────────────────────────

  if (features.spoofTabVisibility) {
    try {
      Object.defineProperty(document, "hidden",                { get: () => false,     configurable: true });
      Object.defineProperty(document, "visibilityState",       { get: () => "visible", configurable: true });
      Object.defineProperty(document, "webkitHidden",          { get: () => false,     configurable: true });
      Object.defineProperty(document, "webkitVisibilityState", { get: () => "visible", configurable: true });
    } catch (e) {
      console.warn("[privacy-guard] visibilityState patch failed:", e);
    }
  }

  // ─── 4–9. Event-level spoofing via addEventListener wrapper ───────────────

  const TIMING_JITTER_MS = 15;
  const COORD_JITTER_PX  = 3;

  const KB_TYPES    = new Set(["keydown", "keyup", "keypress"]);
  const MOUSE_TYPES = new Set(["mousemove", "mousedown", "mouseup",
                                "pointermove", "pointerdown", "pointerup"]);
  const CLICK_TYPES = new Set(["click", "dblclick", "contextmenu", "auxclick"]);
  const TOUCH_TYPES = new Set(["touchstart", "touchend", "touchmove", "touchcancel"]);
  const BLUR_TYPES  = new Set(["blur", "focusout"]);
  const VIS_TYPES   = new Set(["visibilitychange"]);
  const INPUT_TYPES = new Set(["input", "change"]);

  const needsWrap =
    features.spoofKeyboardTiming ||
    features.spoofMouseMovement   ||
    features.spoofClicks          ||
    features.spoofTouch           ||
    features.spoofFocus           ||
    features.spoofTabVisibility   ||
    features.spoofFormInput;

  if (needsWrap) {
    const _ael = EventTarget.prototype.addEventListener;
    const _rel = EventTarget.prototype.removeEventListener;

    function stopSignal(event) {
      event.stopImmediatePropagation();
    }

    if (features.spoofTabVisibility) {
      _ael.call(document, "visibilitychange", stopSignal, true);
    }

    if (features.spoofFocus) {
      _ael.call(window,   "blur",     stopSignal, true);
      _ael.call(document, "blur",     stopSignal, true);
      _ael.call(document, "focusout", stopSignal, true);
    }

    const wrapMap = new WeakMap();

    function getWrap(target) {
      let m = wrapMap.get(target);
      if (!m) { m = new Map(); wrapMap.set(target, m); }
      return m;
    }

    function coordProxy(event) {
      const jx = randPx(COORD_JITTER_PX);
      const jy = randPx(COORD_JITTER_PX);
      return new Proxy(event, {
        get(t, prop) {
          switch (prop) {
            case "clientX": case "screenX": case "pageX": case "x":
            case "offsetX": case "movementX": return t[prop] + jx;
            case "clientY": case "screenY": case "pageY": case "y":
            case "offsetY": case "movementY": return t[prop] + jy;
            default: {
              const v = t[prop];
              return typeof v === "function" ? v.bind(t) : v;
            }
          }
        },
      });
    }

    function delayWrap(listener, maxMs) {
      return function (event) {
        const delay = randMs(maxMs);
        if (delay < 2) {
          listener.call(this, event);
        } else {
          const ctx = this;
          setTimeout(() => listener.call(ctx, event), delay);
        }
      };
    }

    EventTarget.prototype.addEventListener = function (type, listener, options) {
      const eventType = String(type);

      if (typeof listener !== "function" && typeof listener !== "object") {
        return _ael.call(this, type, listener, options);
      }
      if (typeof listener !== "function") {
        return _ael.call(this, type, listener, options);
      }

      if (features.spoofFocus && BLUR_TYPES.has(eventType)) return;
      if (features.spoofTabVisibility && VIS_TYPES.has(eventType)) return;

      const wm = getWrap(this);
      if (!wm.has(eventType)) wm.set(eventType, new Map());
      const typeMap = wm.get(eventType);

      if (!typeMap.has(listener)) {
        let wrapped = listener;

        if (features.spoofKeyboardTiming && KB_TYPES.has(eventType)) {
          wrapped = delayWrap(listener, TIMING_JITTER_MS);
        } else if (features.spoofMouseMovement && MOUSE_TYPES.has(eventType)) {
          wrapped = function (event) { listener.call(this, coordProxy(event)); };
        } else if (features.spoofClicks && CLICK_TYPES.has(eventType)) {
          wrapped = function (event) { listener.call(this, coordProxy(event)); };
        } else if (features.spoofTouch && TOUCH_TYPES.has(eventType)) {
          wrapped = delayWrap(listener, TIMING_JITTER_MS);
        } else if (features.spoofFormInput && INPUT_TYPES.has(eventType)) {
          wrapped = delayWrap(listener, TIMING_JITTER_MS);
        }

        typeMap.set(listener, wrapped);
      }

      return _ael.call(this, type, typeMap.get(listener), options);
    };

    EventTarget.prototype.removeEventListener = function (type, listener, options) {
      const eventType = String(type);
      const wm = wrapMap.get(this);
      const typeMap = wm?.get(eventType);
      const wrapped = typeMap?.get(listener);
      if (wrapped) {
        typeMap.delete(listener);
        return _rel.call(this, type, wrapped, options);
      }
      return _rel.call(this, type, listener, options);
    };
  }

  // ─── Spoof focus / hasFocus ───────────────────────────────────────────────

  if (features.spoofFocus) {
    try {
      Object.defineProperty(document, "hasFocus", {
        value: () => true,
        configurable: true,
      });
    } catch (e) {}
  }

  // ─── Done ──────────────────────────────────────────────────────────────────
  const active = Object.entries(features)
    .filter(([, v]) => v)
    .map(([k]) => k);

  console.info(
    `[privacy-guard] installed — ${active.length} feature${active.length !== 1 ? "s" : ""} active:`,
    active.join(", ")
  );

  if (exceptions.length) {
    console.info(`[privacy-guard] ${exceptions.length} exception(s) active:`, exceptions.join(", "));
  }
})();