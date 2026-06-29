(function () {
  "use strict";

  if (globalThis.__privacyGuardInstalled) {
    console.info("[privacy-guard] already installed — skipping re-patch");
    return;
  }

  function readConfig() {
    const fromScript = document.currentScript?.dataset?.privacyGuardConfig;
    if (fromScript) {
      try {
        return JSON.parse(fromScript);
      } catch (err) {
        console.warn("[privacy-guard] invalid config found — aborting", err);
        return null;
      }
    }

    const fromDom = document.documentElement?.dataset?.privacyGuardConfig;
    if (fromDom) {
      try {
        return JSON.parse(fromDom);
      } catch (err) {
        console.warn("[privacy-guard] invalid cached config — ignoring", err);
        return null;
      }
    }
    return globalThis.__PRIVACY_GUARD_CONFIG__ ?? null;
  }

  const cfg = readConfig();
  if (!cfg) {
    return;
  }
  globalThis.__privacyGuardInstalled = true;
  globalThis.__privacyGuardObservesRequests = true;

  const features = cfg.features ?? {};

  const _nativeCaptureStream =
    typeof HTMLCanvasElement !== "undefined"
      ? HTMLCanvasElement.prototype.captureStream
      : null;

  const blockedPatterns = cfg.blockedPatterns ?? [];
  const exceptions = cfg.exceptions ?? [];
  const extraBlockedDomains = cfg.blockedDomains ?? [];

  const KNOWN_TRACKER_DOMAINS = cfg.knownTrackerDomains ?? [];
  const TRACKER_HOSTNAME_HINTS = cfg.trackerHostnameHints ?? [];

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

  function emitPgMessage(message) {
    message.id ??= `pg-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    window.postMessage(message, "*");

    try {
      const raw = JSON.stringify(message);
      document.documentElement.dataset.privacyGuardMessage = raw;
      document.dispatchEvent(
        new CustomEvent("__privacyGuardMessage", { detail: raw }),
      );
    } catch {}
  }

  function postBlock(url) {
    emitPgMessage({ __privacyGuard: true, type: "block", url: String(url) });
  }

  const OBSERVE_HEURISTIC =
    /track|analytics|telemetry|beacon|metric|events?|behavior|biometric|keylog|session|collect|pixel|stats|error_report|sevents/i;

  function postObserve(url, via, blocked = false) {
    const s = url instanceof Request ? url.url : String(url ?? "");
    if (!s) return;

    if (!blocked && !OBSERVE_HEURISTIC.test(s)) return;

    const matchedPattern = blockedPatterns.find((p) => s.includes(p)) ?? null;

    let matchedDomain = null;
    if (features.blockKnownTrackers && !matchedPattern) {
      try {
        const h = new URL(s).hostname;
        const allDomains = [...KNOWN_TRACKER_DOMAINS, ...extraBlockedDomains];
        matchedDomain =
          allDomains.find((d) => h === d || h.endsWith("." + d)) ??
          (hostnameLooksLikeTracker(h) ? h : null);
      } catch {}
    }

    emitPgMessage({
      __privacyGuard: true,
      type: "observe",
      detail: {
        url: s,
        via,
        blocked,
        matchedPattern: matchedPattern ?? matchedDomain,
      },
    });
  }

  function isBlocked(url) {
    const s = url instanceof Request ? url.url : String(url ?? "");

    if (exceptions.some((e) => s.includes(e))) return false;

    if (
      features.blockTrackingRequests &&
      blockedPatterns.some((p) => s.includes(p))
    )
      return true;

    if (features.blockKnownTrackers) {
      try {
        const h = new URL(s).hostname;
        const allDomains = [...KNOWN_TRACKER_DOMAINS, ...extraBlockedDomains];
        if (allDomains.some((d) => h === d || h.endsWith("." + d))) return true;
        if (hostnameLooksLikeTracker(h)) return true;
      } catch {}
    }

    return false;
  }

  function gaussMs(mean, std) {
    const u1 = Math.random(),
      u2 = Math.random();
    const z =
      Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) *
      Math.cos(2 * Math.PI * u2);
    return Math.max(0, Math.round(mean + z * std));
  }

  function beaconDelayMs() {
    return Math.random() < 0.1
      ? 300 + Math.round(Math.random() * 200)
      : gaussMs(150, 50);
  }

  function randPx(range) {
    return (Math.random() - 0.5) * range * 2;
  }

  if (
    globalThis.__privacyGuardObservesRequests ||
    features.blockTrackingRequests ||
    features.blockKnownTrackers
  ) {
    const _fetch = globalThis.fetch;
    globalThis.fetch = function (...args) {
      const url =
        args[0] instanceof Request ? args[0].url : String(args[0] ?? "");
      const blocked = isBlocked(url);
      postObserve(url, "fetch", blocked);
      if (blocked) {
        postBlock(url);
        return Promise.resolve(new Response("", { status: 200 }));
      }
      return _fetch.apply(this, args);
    };
    globalThis.fetch.__pgPatched = true;

    const _xhrOpen = XMLHttpRequest.prototype.open;
    const _xhrSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this.__pgUrl = String(url ?? "");
      this.__pgBlocked = isBlocked(this.__pgUrl);
      postObserve(this.__pgUrl, "xhr", this.__pgBlocked);
      return _xhrOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function (body) {
      if (this.__pgBlocked) {
        postBlock(this.__pgUrl);
        return;
      }
      return _xhrSend.call(this, body);
    };

    const _beacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url, data) {
      const blocked = isBlocked(url);
      postObserve(url, "beacon", blocked);
      if (blocked) {
        postBlock(String(url));
        return true;
      }

      const delay = beaconDelayMs();
      if (delay < 5) return _beacon(url, data);
      setTimeout(() => {
        try {
          _beacon(url, data);
        } catch {}
      }, delay);
      return true;
    };
  }

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

  if (features.spoofTabVisibility) {
    try {
      Object.defineProperty(document, "hidden", {
        get: () => false,
        configurable: true,
      });
      Object.defineProperty(document, "visibilityState", {
        get: () => "visible",
        configurable: true,
      });
      Object.defineProperty(document, "webkitHidden", {
        get: () => false,
        configurable: true,
      });
      Object.defineProperty(document, "webkitVisibilityState", {
        get: () => "visible",
        configurable: true,
      });
    } catch (e) {
      console.warn("[privacy-guard] visibilityState patch failed:", e);
    }
  }

  const MOUSE_TIMING = { mean: 12, std: 5 };
  const KB_TIMING = { mean: 35, std: 15 };
  const CLICK_TIMING = { mean: 50, std: 20 };
  const TOUCH_TIMING = { mean: 35, std: 15 };
  const INPUT_TIMING = { mean: 35, std: 15 };
  const COORD_JITTER_PX = 3;

  const KB_TYPES = new Set(["keydown", "keyup", "keypress"]);
  const MOUSE_TYPES = new Set([
    "mousemove",
    "mousedown",
    "mouseup",
    "pointermove",
    "pointerdown",
    "pointerup",
  ]);
  const CLICK_TYPES = new Set(["click", "dblclick", "contextmenu", "auxclick"]);
  const TOUCH_TYPES = new Set([
    "touchstart",
    "touchend",
    "touchmove",
    "touchcancel",
  ]);
  const BLUR_TYPES = new Set(["blur", "focusout"]);
  const VIS_TYPES = new Set(["visibilitychange"]);
  const INPUT_TYPES = new Set(["input", "change"]);
  const CLIP_TYPES = new Set(["copy", "cut", "paste"]);
  const SELECTION_TYPES = new Set(["selectionchange", "selectstart"]);
  const SCROLL_TYPES = new Set(["scroll", "wheel", "scrollend", "touchmove"]);
  const STORAGE_TYPES = new Set(["storage"]);

  const needsWrap =
    features.spoofKeyboardTiming ||
    features.blockKeyboardEvents ||
    features.spoofMouseMovement ||
    features.blockMouseEvents ||
    features.spoofClicks ||
    features.blockClickEvents ||
    features.spoofTouch ||
    features.blockTouchEvents ||
    features.spoofFormInput ||
    features.blockFormEvents ||
    features.spoofFocus ||
    features.spoofTabVisibility ||
    features.blockClipboard ||
    features.blockSelection ||
    features.blockScrollTracking ||
    features.blockTabEnumeration;

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
      _ael.call(window, "blur", stopSignal, true);
      _ael.call(document, "blur", stopSignal, true);
      _ael.call(document, "focusout", stopSignal, true);
    }

    const wrapMap = new WeakMap();

    function getWrap(target) {
      if (
        target === null ||
        target === undefined ||
        (typeof target !== "object" && typeof target !== "function")
      ) {
        return new Map();
      }
      let m = wrapMap.get(target);
      if (!m) {
        m = new Map();
        wrapMap.set(target, m);
      }
      return m;
    }

    function coordProxy(event) {
      const jx = randPx(COORD_JITTER_PX);
      const jy = randPx(COORD_JITTER_PX);
      return new Proxy(event, {
        get(t, prop) {
          switch (prop) {
            case "clientX":
            case "screenX":
            case "pageX":
            case "x":
            case "offsetX":
            case "movementX":
              return t[prop] + jx;
            case "clientY":
            case "screenY":
            case "pageY":
            case "y":
            case "offsetY":
            case "movementY":
              return t[prop] + jy;
            default: {
              const v = t[prop];
              return typeof v === "function" ? v.bind(t) : v;
            }
          }
        },
      });
    }

    function delayWrap(listener, mean, std) {
      return function (event) {
        const delay = gaussMs(mean, std);
        if (delay < 2) {
          listener.call(this, event);
        } else {
          const ctx = this;
          setTimeout(() => listener.call(ctx, event), delay);
        }
      };
    }

    EventTarget.prototype.addEventListener = function (
      type,
      listener,
      options,
    ) {
      const eventType = String(type);

      if (typeof listener !== "function" && typeof listener !== "object") {
        return _ael.call(this, type, listener, options);
      }
      if (typeof listener !== "function") {
        return _ael.call(this, type, listener, options);
      }

      if (features.spoofFocus && BLUR_TYPES.has(eventType)) return;
      if (features.spoofTabVisibility && VIS_TYPES.has(eventType)) return;

      if (features.blockKeyboardEvents && KB_TYPES.has(eventType)) return;
      if (features.blockMouseEvents && MOUSE_TYPES.has(eventType)) return;
      if (features.blockClickEvents && CLICK_TYPES.has(eventType)) return;
      if (features.blockTouchEvents && TOUCH_TYPES.has(eventType)) return;
      if (features.blockFormEvents && INPUT_TYPES.has(eventType)) return;
      if (features.blockClipboard && CLIP_TYPES.has(eventType)) return;
      if (features.blockSelection && SELECTION_TYPES.has(eventType)) return;
      if (features.blockScrollTracking && SCROLL_TYPES.has(eventType)) return;
      if (features.blockTabEnumeration && STORAGE_TYPES.has(eventType)) return;

      const wm = getWrap(this);
      if (!wm.has(eventType)) wm.set(eventType, new Map());
      const typeMap = wm.get(eventType);

      if (!typeMap.has(listener)) {
        let wrapped = listener;

        if (features.spoofKeyboardTiming && KB_TYPES.has(eventType)) {
          wrapped = delayWrap(listener, KB_TIMING.mean, KB_TIMING.std);
        } else if (features.spoofMouseMovement && MOUSE_TYPES.has(eventType)) {
          wrapped = function (event) {
            const proxied = coordProxy(event);
            const delay = gaussMs(MOUSE_TIMING.mean, MOUSE_TIMING.std);
            if (delay < 2) {
              listener.call(this, proxied);
            } else {
              const ctx = this;
              setTimeout(() => listener.call(ctx, proxied), delay);
            }
          };
        } else if (features.spoofClicks && CLICK_TYPES.has(eventType)) {
          wrapped = function (event) {
            const proxied = coordProxy(event);
            const delay = gaussMs(CLICK_TIMING.mean, CLICK_TIMING.std);
            if (delay < 2) {
              listener.call(this, proxied);
            } else {
              const ctx = this;
              setTimeout(() => listener.call(ctx, proxied), delay);
            }
          };
        } else if (features.spoofTouch && TOUCH_TYPES.has(eventType)) {
          wrapped = delayWrap(listener, TOUCH_TIMING.mean, TOUCH_TIMING.std);
        } else if (features.spoofFormInput && INPUT_TYPES.has(eventType)) {
          wrapped = delayWrap(listener, INPUT_TIMING.mean, INPUT_TIMING.std);
        }

        typeMap.set(listener, wrapped);
      }

      return _ael.call(this, type, typeMap.get(listener), options);
    };

    EventTarget.prototype.removeEventListener = function (
      type,
      listener,
      options,
    ) {
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

  if (features.spoofFocus) {
    try {
      Object.defineProperty(document, "hasFocus", {
        value: () => true,
        configurable: true,
      });
    } catch (e) {}
  }

  if (features.spoofMouseMovement || features.spoofClicks) {
    const eventJitter = new WeakMap();

    function getEventJitter(event) {
      if (!eventJitter.has(event)) {
        eventJitter.set(event, {
          x: randPx(COORD_JITTER_PX),
          y: randPx(COORD_JITTER_PX),
        });
      }
      return eventJitter.get(event);
    }

    const X_PROPS = [
      "clientX",
      "screenX",
      "pageX",
      "x",
      "offsetX",
      "movementX",
    ];
    const Y_PROPS = [
      "clientY",
      "screenY",
      "pageY",
      "y",
      "offsetY",
      "movementY",
    ];

    function patchProtoCoords(proto) {
      for (const prop of [...X_PROPS, ...Y_PROPS]) {
        const desc = Object.getOwnPropertyDescriptor(proto, prop);
        if (!desc?.get) continue;
        const origGet = desc.get;
        const isX = X_PROPS.includes(prop);
        try {
          Object.defineProperty(proto, prop, {
            get() {
              const j = getEventJitter(this);
              return origGet.call(this) + (isX ? j.x : j.y);
            },
            configurable: true,
            enumerable: desc.enumerable,
          });
        } catch {}
      }
    }

    try {
      patchProtoCoords(MouseEvent.prototype);
    } catch {}
    try {
      if (globalThis.PointerEvent) patchProtoCoords(PointerEvent.prototype);
    } catch {}
    try {
      if (globalThis.DragEvent) patchProtoCoords(DragEvent.prototype);
    } catch {}
  }

  if (features.spoofPerformanceTiming) {
    const PERF_NOISE_MS = 0.5;

    try {
      const _perfNow = Performance.prototype.now;
      Performance.prototype.now = function () {
        return _perfNow.call(this) + (Math.random() - 0.5) * PERF_NOISE_MS * 2;
      };
    } catch (e) {
      console.warn("[privacy-guard] performance.now patch failed:", e);
    }

    try {
      const _raf = globalThis.requestAnimationFrame;
      globalThis.requestAnimationFrame = function (callback) {
        if (typeof callback !== "function")
          return _raf.call(globalThis, callback);
        return _raf.call(globalThis, function (timestamp) {
          try {
            callback(timestamp + (Math.random() - 0.5) * PERF_NOISE_MS * 2);
          } catch (err) {
            throw err;
          }
        });
      };
    } catch (e) {
      console.warn("[privacy-guard] requestAnimationFrame patch failed:", e);
    }

    try {
      const _dateNow = Date.now;
      Date.now = function () {
        return _dateNow() + (Math.floor(Math.random() * 3) - 1);
      };
    } catch (e) {
      console.warn("[privacy-guard] Date.now patch failed:", e);
    }
  }

  if (features.blockWebRTC) {
    const _rtcBlocked = function () {
      throw new DOMException(
        "RTCPeerConnection is blocked by Privacy Guard",
        "NotAllowedError",
      );
    };
    [
      "RTCPeerConnection",
      "webkitRTCPeerConnection",
      "mozRTCPeerConnection",
    ].forEach((name) => {
      if (!globalThis[name]) return;
      try {
        const orig = globalThis[name];
        const shim = function (...args) {
          _rtcBlocked();
        };
        shim.prototype = orig.prototype;

        Object.getOwnPropertyNames(orig).forEach((p) => {
          try {
            if (p !== "prototype") shim[p] = orig[p];
          } catch {}
        });
        Object.defineProperty(globalThis, name, {
          value: shim,
          configurable: true,
          writable: true,
        });
      } catch {}
    });
  }

  if (features.spoofScrollDepth) {
    const _defProp = (obj, prop, val) => {
      try {
        Object.defineProperty(obj, prop, {
          get: () => val,
          configurable: true,
          enumerable: true,
        });
      } catch {}
    };

    _defProp(window, "scrollX", 0);
    _defProp(window, "scrollY", 0);
    _defProp(window, "pageXOffset", 0);
    _defProp(window, "pageYOffset", 0);

    try {
      _defProp(document.documentElement, "scrollTop", 0);
    } catch {}
    try {
      _defProp(document.documentElement, "scrollLeft", 0);
    } catch {}
    try {
      _defProp(document.body, "scrollTop", 0);
    } catch {}
    try {
      _defProp(document.body, "scrollLeft", 0);
    } catch {}

    try {
      const origGet = Object.getOwnPropertyDescriptor(
        Element.prototype,
        "scrollTop",
      )?.get;
      if (origGet) {
        Object.defineProperty(Element.prototype, "scrollTop", {
          get() {
            if (this === document.documentElement || this === document.body)
              return 0;
            return origGet.call(this);
          },
          configurable: true,
        });
      }
    } catch {}
  }

  if (features.blockBattery) {
    try {
      Object.defineProperty(navigator, "getBattery", {
        value: () =>
          Promise.reject(
            new DOMException(
              "Battery API blocked by Privacy Guard",
              "NotAllowedError",
            ),
          ),
        configurable: true,
        writable: true,
      });
    } catch (e) {
      console.warn("[privacy-guard] getBattery patch failed:", e);
    }
  }

  if (features.spoofScreenSize) {
    const BUCKETS_W = [1280, 1366, 1440, 1536, 1600, 1680, 1920, 2560];
    const BUCKETS_H = [720, 768, 800, 864, 900, 960, 1024, 1080, 1200, 1440];

    function snapTo(buckets, real) {
      const noisy = real + Math.round((Math.random() - 0.5) * 100);
      return buckets.reduce((prev, curr) =>
        Math.abs(curr - noisy) < Math.abs(prev - noisy) ? curr : prev,
      );
    }

    const sw = snapTo(BUCKETS_W, screen.width);
    const sh = snapTo(BUCKETS_H, screen.height);

    const screenProps = [
      ["width", sw],
      ["height", sh],
      ["availWidth", sw],
      ["availHeight", sh - 40],
      ["colorDepth", 24],
      ["pixelDepth", 24],
    ];
    for (const [prop, val] of screenProps) {
      try {
        Object.defineProperty(screen, prop, {
          get: () => val,
          configurable: true,
        });
      } catch {}
    }

    try {
      Object.defineProperty(window, "outerWidth", {
        get: () => sw,
        configurable: true,
      });
    } catch {}
    try {
      Object.defineProperty(window, "outerHeight", {
        get: () => sh,
        configurable: true,
      });
    } catch {}
  }

  if (features.blockClipboard) {
    const _stopClip = (e) => {
      e.stopImmediatePropagation();
    };
    const _clipOpts = { capture: true, passive: false };
    for (const type of ["copy", "cut", "paste"]) {
      try {
        document.addEventListener(type, _stopClip, _clipOpts);
      } catch {}
      try {
        window.addEventListener(type, _stopClip, _clipOpts);
      } catch {}
    }
  }

  if (features.blockSelection) {
    const _stopSel = (e) => {
      e.stopImmediatePropagation();
    };
    const _selOpts = { capture: true, passive: false };
    for (const type of ["selectionchange", "selectstart"]) {
      try {
        document.addEventListener(type, _stopSel, _selOpts);
      } catch {}
      try {
        window.addEventListener(type, _stopSel, _selOpts);
      } catch {}
    }
  }

  if (features.blockScreenCapture) {
    if (navigator.mediaDevices?.getDisplayMedia) {
      try {
        Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
          value: () =>
            Promise.reject(
              new DOMException(
                "Screen capture blocked by Privacy Guard",
                "NotAllowedError",
              ),
            ),
          configurable: true,
          writable: true,
        });
      } catch (e) {
        console.warn("[privacy-guard] getDisplayMedia patch failed:", e);
      }
    }

    for (const proto of [
      HTMLCanvasElement.prototype,
      HTMLVideoElement.prototype,
    ]) {
      if (typeof proto.captureStream === "function") {
        try {
          Object.defineProperty(proto, "captureStream", {
            value() {
              throw new DOMException(
                "Screen capture blocked by Privacy Guard",
                "NotAllowedError",
              );
            },
            configurable: true,
            writable: true,
          });
        } catch (e) {
          console.warn("[privacy-guard] captureStream patch failed:", e);
        }
      }
    }

    if (typeof MediaStreamTrack !== "undefined") {
      const _origGetSettings = MediaStreamTrack.prototype.getSettings;
      try {
        MediaStreamTrack.prototype.getSettings = function () {
          const s = _origGetSettings.call(this);
          delete s.displaySurface;
          delete s.logicalSurface;
          delete s.cursor;
          return s;
        };
      } catch (e) {
        console.warn(
          "[privacy-guard] MediaStreamTrack.getSettings patch failed:",
          e,
        );
      }
    }
  }

  function makeFilteredVideoTrack(realTrack, draw, fps = 15) {
    const settings = realTrack.getSettings?.() ?? {};
    const w = settings.width || 640;
    const h = settings.height || 480;

    const video = document.createElement("video");
    video.muted = true;
    video.srcObject = new MediaStream([realTrack]);
    video.play().catch(() => {});

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");

    let rafId = null;
    function tick() {
      try {
        draw(ctx, video, w, h);
      } catch {}
      rafId = requestAnimationFrame(tick);
    }
    tick();

    const outStream = _nativeCaptureStream
      ? _nativeCaptureStream.call(canvas, fps)
      : canvas.captureStream(fps);
    const outTrack = outStream.getVideoTracks()[0];

    const nativeStop = outTrack.stop.bind(outTrack);
    outTrack.stop = () => {
      if (rafId) cancelAnimationFrame(rafId);
      try {
        realTrack.stop();
      } catch {}
      nativeStop();
    };

    return outTrack;
  }

  function makeBlurredVideoTrack(realTrack) {
    return makeFilteredVideoTrack(realTrack, (ctx, video, w, h) => {
      ctx.filter = "blur(18px) saturate(0.7) brightness(0.9)";
      ctx.drawImage(video, 0, 0, w, h);
      ctx.filter = "none";
    });
  }

  function makePixelatedVideoTrack(realTrack, blockSize = 16) {
    let small = null;
    return makeFilteredVideoTrack(realTrack, (ctx, video, w, h) => {
      const sw = Math.max(1, Math.floor(w / blockSize));
      const sh = Math.max(1, Math.floor(h / blockSize));
      if (!small) {
        small = document.createElement("canvas");
        small.width = sw;
        small.height = sh;
      }
      small.getContext("2d").drawImage(video, 0, 0, sw, sh);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(small, 0, 0, sw, sh, 0, 0, w, h);
    });
  }

  function makeMuffledAudioTrack(realTrack) {
    let audioCtx;
    try {
      audioCtx = new (
        globalThis.AudioContext || globalThis.webkitAudioContext
      )();
    } catch {
      return realTrack;
    }

    const src = audioCtx.createMediaStreamSource(new MediaStream([realTrack]));

    const lp1 = audioCtx.createBiquadFilter();
    lp1.type = "lowpass";
    lp1.frequency.value = 250;
    lp1.Q.value = 1.2;

    const lp2 = audioCtx.createBiquadFilter();
    lp2.type = "lowpass";
    lp2.frequency.value = 250;
    lp2.Q.value = 1.2;

    const gain = audioCtx.createGain();
    gain.gain.value = 0.7;
    const dest = audioCtx.createMediaStreamDestination();

    src.connect(lp1);
    lp1.connect(lp2);
    lp2.connect(gain);
    gain.connect(dest);

    const outTrack = dest.stream.getAudioTracks()[0];
    const nativeStop = outTrack.stop.bind(outTrack);
    outTrack.stop = () => {
      try {
        realTrack.stop();
      } catch {}
      try {
        audioCtx.close();
      } catch {}
      nativeStop();
    };
    return outTrack;
  }

  function makeSilentBlackVideoTrack(fps = 10) {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      const ctx2d = canvas.getContext("2d");
      ctx2d.fillStyle = "#000000";
      ctx2d.fillRect(0, 0, 640, 480);
      const stream = _nativeCaptureStream
        ? _nativeCaptureStream.call(canvas, fps)
        : canvas.captureStream(fps);
      return stream.getVideoTracks()[0] ?? null;
    } catch {
      return null;
    }
  }

  function makeSilentAudioTrack() {
    try {
      const audioCtx = new (
        globalThis.AudioContext || globalThis.webkitAudioContext
      )();
      const gain = audioCtx.createGain();
      gain.gain.value = 0;
      const dest = audioCtx.createMediaStreamDestination();

      const osc = audioCtx.createOscillator();
      osc.connect(gain);
      gain.connect(dest);
      osc.start();
      const outTrack = dest.stream.getAudioTracks()[0] ?? null;
      if (outTrack) {
        const nativeStop = outTrack.stop.bind(outTrack);
        outTrack.stop = () => {
          try {
            osc.stop();
          } catch {}
          try {
            audioCtx.close();
          } catch {}
          nativeStop();
        };
      }
      return outTrack;
    } catch {
      return null;
    }
  }

  if (
    features.blockCamera ||
    features.spoofCamera ||
    features.blockMicrophone ||
    features.spoofMicrophone
  ) {
    const md = navigator.mediaDevices;
    if (md?.getUserMedia) {
      const _gum = md.getUserMedia.bind(md);

      md.getUserMedia = async function (constraints = {}) {
        const wantVideo = !!constraints.video;
        const wantAudio = !!constraints.audio;

        const videoBlocked = wantVideo && features.blockCamera;
        const audioBlocked = wantAudio && features.blockMicrophone;

        const videoFaked = videoBlocked && features.fakeGrantCamera;
        const audioFaked = audioBlocked && features.fakeGrantMicrophone;

        const keepVideo = wantVideo && !videoBlocked;
        const keepAudio = wantAudio && !audioBlocked;

        if (!keepVideo && !keepAudio) {
          if (!videoFaked && !audioFaked) {
            postBlock("getUserMedia");
            throw new DOMException("Permission denied", "NotAllowedError");
          }

          const fakeStream = new MediaStream();
          if (videoFaked) {
            const t = makeSilentBlackVideoTrack();
            if (t) fakeStream.addTrack(t);
          }
          if (audioFaked) {
            const t = makeSilentAudioTrack();
            if (t) fakeStream.addTrack(t);
          }
          return fakeStream;
        }

        const passConstraints = { ...constraints };
        if (videoBlocked) delete passConstraints.video;
        if (audioBlocked) delete passConstraints.audio;

        const stream = await _gum(passConstraints);

        if (videoFaked) {
          const t = makeSilentBlackVideoTrack();
          if (t) stream.addTrack(t);
        }
        if (audioFaked) {
          const t = makeSilentAudioTrack();
          if (t) stream.addTrack(t);
        }

        if (keepVideo && features.spoofCamera) {
          const real = stream.getVideoTracks()[0];
          if (real) {
            const filtered = makeBlurredVideoTrack(real);
            stream.removeTrack(real);
            stream.addTrack(filtered);
          }
        }

        if (keepAudio && features.spoofMicrophone) {
          const real = stream.getAudioTracks()[0];
          if (real) {
            const filtered = makeMuffledAudioTrack(real);
            stream.removeTrack(real);
            stream.addTrack(filtered);
          }
        }

        return stream;
      };
      md.getUserMedia.__pgPatched = true;
    }

    for (const name of [
      "getUserMedia",
      "webkitGetUserMedia",
      "mozGetUserMedia",
    ]) {
      if (
        md &&
        typeof navigator[name] === "function" &&
        !navigator[name].__pgPatched
      ) {
        const legacy = function (constraints, successCb, errorCb) {
          md.getUserMedia(constraints).then(successCb, errorCb);
        };
        legacy.__pgPatched = true;
        try {
          navigator[name] = legacy;
        } catch {}
      }
    }
  }

  if (features.spoofScreenCapture && !features.blockScreenCapture) {
    const mdSc = navigator.mediaDevices;
    if (mdSc?.getDisplayMedia) {
      const _gdm = mdSc.getDisplayMedia.bind(mdSc);
      mdSc.getDisplayMedia = async function (opts) {
        const stream = await _gdm(opts);
        const real = stream.getVideoTracks()[0];
        if (real) {
          stream.removeTrack(real);
          stream.addTrack(makePixelatedVideoTrack(real));
        }
        return stream;
      };
    }
  }

  if (features.blockTabEnumeration) {
    if (typeof BroadcastChannel !== "undefined") {
      try {
        function NoopChannel(name) {
          this.name = name;
          this.onmessage = null;
          this.onmessageerror = null;
        }
        NoopChannel.prototype.postMessage = function () {};
        NoopChannel.prototype.close = function () {};
        NoopChannel.prototype.addEventListener = function () {};
        NoopChannel.prototype.removeEventListener = function () {};
        Object.defineProperty(globalThis, "BroadcastChannel", {
          value: NoopChannel,
          configurable: true,
          writable: true,
        });
      } catch (e) {
        console.warn("[privacy-guard] BroadcastChannel patch failed:", e);
      }
    }

    if (typeof SharedWorker !== "undefined") {
      try {
        const blockedSharedWorker = function () {
          throw new DOMException(
            "SharedWorker blocked by Privacy Guard",
            "NotAllowedError",
          );
        };
        Object.defineProperty(globalThis, "SharedWorker", {
          value: blockedSharedWorker,
          configurable: true,
          writable: true,
        });
      } catch (e) {
        console.warn("[privacy-guard] SharedWorker patch failed:", e);
      }
    }
  }

  if (features.spoofReferrer) {
    try {
      Object.defineProperty(document, "referrer", {
        get: () => "",
        configurable: true,
      });
    } catch (e) {
      console.warn("[privacy-guard] referrer patch failed:", e);
    }
  }

  if (features.blockCacheTimingProbe && typeof performance !== "undefined") {
    const TIMING_FIELDS = [
      "transferSize",
      "encodedBodySize",
      "decodedBodySize",
    ];

    function scrubTimingEntry(entry) {
      if (entry.entryType !== "resource" && entry.entryType !== "navigation")
        return entry;
      for (const f of TIMING_FIELDS) {
        try {
          Object.defineProperty(entry, f, { value: 0, configurable: true });
        } catch {}
      }
      return entry;
    }

    try {
      const _getEntries = Performance.prototype.getEntries;
      const _getEntriesByType = Performance.prototype.getEntriesByType;
      const _getEntriesByName = Performance.prototype.getEntriesByName;

      Performance.prototype.getEntries = function (...args) {
        return _getEntries.apply(this, args).map(scrubTimingEntry);
      };
      Performance.prototype.getEntriesByType = function (...args) {
        return _getEntriesByType.apply(this, args).map(scrubTimingEntry);
      };
      Performance.prototype.getEntriesByName = function (...args) {
        return _getEntriesByName.apply(this, args).map(scrubTimingEntry);
      };
    } catch (e) {
      console.warn("[privacy-guard] resource timing patch failed:", e);
    }

    if (typeof PerformanceObserver !== "undefined") {
      try {
        const _PO = PerformanceObserver;
        function WrappedPO(callback) {
          return new _PO((list, observer) => {
            list.getEntries().forEach(scrubTimingEntry);
            callback(list, observer);
          });
        }
        WrappedPO.prototype = _PO.prototype;
        WrappedPO.supportedEntryTypes = _PO.supportedEntryTypes;
        Object.defineProperty(globalThis, "PerformanceObserver", {
          value: WrappedPO,
          configurable: true,
          writable: true,
        });
      } catch (e) {
        console.warn("[privacy-guard] PerformanceObserver patch failed:", e);
      }
    }
  }

  if (features.spoofCanvasNoise || features.blockCanvas) {
    const _toDataURL = HTMLCanvasElement.prototype.toDataURL;
    const _toBlob = HTMLCanvasElement.prototype.toBlob;
    const _ctx2dGetImageData = CanvasRenderingContext2D.prototype.getImageData;

    if (features.blockCanvas) {
      try {
        HTMLCanvasElement.prototype.toDataURL = function (...args) {
          const blank = document.createElement("canvas");
          blank.width = Math.max(1, this.width);
          blank.height = Math.max(1, this.height);
          return _toDataURL.call(blank, ...args);
        };
        HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
          const blank = document.createElement("canvas");
          blank.width = Math.max(1, this.width);
          blank.height = Math.max(1, this.height);
          _toBlob.call(blank, callback, ...args);
        };
        CanvasRenderingContext2D.prototype.getImageData = function (
          sx,
          sy,
          sw,
          sh,
        ) {
          return new ImageData(Math.max(1, sw | 0), Math.max(1, sh | 0));
        };
      } catch (e) {
        console.warn("[privacy-guard] blockCanvas patch failed:", e);
      }
    } else {
      function noisePixels(data) {
        for (let i = 0; i < data.length; i += 4) {
          if (Math.random() < 0.05)
            data[i + Math.floor(Math.random() * 3)] ^= 1;
        }
      }

      try {
        CanvasRenderingContext2D.prototype.getImageData = function (
          sx,
          sy,
          sw,
          sh,
          ...rest
        ) {
          const id = _ctx2dGetImageData.call(this, sx, sy, sw, sh, ...rest);
          noisePixels(id.data);
          return id;
        };

        HTMLCanvasElement.prototype.toDataURL = function (...args) {
          try {
            const tmp = document.createElement("canvas");
            tmp.width = Math.max(1, this.width);
            tmp.height = Math.max(1, this.height);
            const tmpCtx = tmp.getContext("2d");
            if (!tmpCtx) return _toDataURL.apply(this, args);
            tmpCtx.drawImage(this, 0, 0);
            const id = _ctx2dGetImageData.call(
              tmpCtx,
              0,
              0,
              tmp.width,
              tmp.height,
            );
            noisePixels(id.data);
            tmpCtx.putImageData(id, 0, 0);
            return _toDataURL.apply(tmp, args);
          } catch {
            return _toDataURL.apply(this, args);
          }
        };

        HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
          try {
            const tmp = document.createElement("canvas");
            tmp.width = Math.max(1, this.width);
            tmp.height = Math.max(1, this.height);
            const tmpCtx = tmp.getContext("2d");
            if (!tmpCtx) {
              _toBlob.call(this, callback, ...args);
              return;
            }
            tmpCtx.drawImage(this, 0, 0);
            const id = _ctx2dGetImageData.call(
              tmpCtx,
              0,
              0,
              tmp.width,
              tmp.height,
            );
            noisePixels(id.data);
            tmpCtx.putImageData(id, 0, 0);
            _toBlob.call(tmp, callback, ...args);
          } catch {
            _toBlob.call(this, callback, ...args);
          }
        };
      } catch (e) {
        console.warn("[privacy-guard] spoofCanvasNoise patch failed:", e);
      }
    }

    if (typeof OffscreenCanvas !== "undefined") {
      try {
        const _ocGetImageData =
          OffscreenCanvasRenderingContext2D.prototype.getImageData;
        OffscreenCanvasRenderingContext2D.prototype.getImageData = function (
          ...args
        ) {
          const id = _ocGetImageData.apply(this, args);
          if (features.blockCanvas) {
            return new ImageData(Math.max(1, id.width), Math.max(1, id.height));
          }
          noisePixels(id.data);
          return id;
        };
      } catch (e) {}
      try {
        const _convertToBlob = OffscreenCanvas.prototype.convertToBlob;
        OffscreenCanvas.prototype.convertToBlob = async function (opts) {
          if (features.blockCanvas) {
            const blank = new OffscreenCanvas(
              Math.max(1, this.width),
              Math.max(1, this.height),
            );
            return _convertToBlob.call(blank, opts);
          }

          try {
            const ctx2d = this.getContext("2d");
            if (ctx2d) {
              const id = ctx2d.getImageData(0, 0, this.width, this.height);
              noisePixels(id.data);
              ctx2d.putImageData(id, 0, 0);
            }
          } catch {}
          return _convertToBlob.call(this, opts);
        };
      } catch (e) {}
    }
  }

  if (features.spoofWebGL || features.blockWebGL) {
    if (features.blockWebGL) {
      const _getCtx = HTMLCanvasElement.prototype.getContext;
      try {
        HTMLCanvasElement.prototype.getContext = function (type, ...args) {
          const t = String(type).toLowerCase();
          if (t === "webgl" || t === "webgl2" || t === "experimental-webgl")
            return null;
          return _getCtx.call(this, type, ...args);
        };
      } catch (e) {
        console.warn("[privacy-guard] blockWebGL canvas patch failed:", e);
      }
      if (typeof OffscreenCanvas !== "undefined") {
        const _ocGetCtx = OffscreenCanvas.prototype.getContext;
        try {
          OffscreenCanvas.prototype.getContext = function (type, ...args) {
            const t = String(type).toLowerCase();
            if (t === "webgl" || t === "webgl2" || t === "experimental-webgl")
              return null;
            return _ocGetCtx.call(this, type, ...args);
          };
        } catch (e) {}
      }
    } else {
      for (const Ctor of [
        globalThis.WebGLRenderingContext,
        globalThis.WebGL2RenderingContext,
      ]) {
        if (!Ctor?.prototype) continue;
        const proto = Ctor.prototype;

        try {
          const _getExt = proto.getExtension;
          proto.getExtension = function (name) {
            if (name === "WEBGL_debug_renderer_info") return null;
            return _getExt.call(this, name);
          };
        } catch (e) {}

        try {
          const _getSuppExt = proto.getSupportedExtensions;
          proto.getSupportedExtensions = function () {
            const list = _getSuppExt.call(this);
            if (!Array.isArray(list)) return list;
            return list.filter((e) => e !== "WEBGL_debug_renderer_info");
          };
        } catch (e) {}

        try {
          const _getParam = proto.getParameter;
          proto.getParameter = function (param) {
            if (param === 0x9245) return "Google Inc.";
            if (param === 0x9246)
              return "ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)";
            return _getParam.call(this, param);
          };
        } catch (e) {}

        try {
          const _readPx = proto.readPixels;
          proto.readPixels = function (
            x,
            y,
            w,
            h,
            format,
            type,
            pixels,
            ...rest
          ) {
            _readPx.call(this, x, y, w, h, format, type, pixels, ...rest);
            if (
              pixels instanceof Uint8Array ||
              pixels instanceof Uint8ClampedArray
            ) {
              for (let i = 0; i < pixels.length; i += 4) {
                if (Math.random() < 0.05)
                  pixels[i + Math.floor(Math.random() * 3)] ^= 1;
              }
            }
          };
        } catch (e) {}
      }
    }
  }

  if (features.spoofAudioFingerprint || features.blockAudioFingerprint) {
    const _offlineBuffers = new WeakSet();

    if (typeof OfflineAudioContext !== "undefined") {
      try {
        const _startRendering = OfflineAudioContext.prototype.startRendering;
        OfflineAudioContext.prototype.startRendering = async function () {
          const buffer = await _startRendering.call(this);
          _offlineBuffers.add(buffer);
          return buffer;
        };
      } catch (e) {}
    }

    const AUDIO_NOISE = 1e-7;
    function noiseFloat32(arr) {
      for (let i = 0; i < arr.length; i++)
        arr[i] += (Math.random() - 0.5) * AUDIO_NOISE;
    }

    if (typeof AudioBuffer !== "undefined") {
      try {
        const _getChannelData = AudioBuffer.prototype.getChannelData;
        const _copyFromChannel = AudioBuffer.prototype.copyFromChannel;

        AudioBuffer.prototype.getChannelData = function (channel) {
          const data = _getChannelData.call(this, channel);
          if (!_offlineBuffers.has(this)) return data;
          if (features.blockAudioFingerprint)
            return new Float32Array(this.length);
          const copy = new Float32Array(data);
          noiseFloat32(copy);
          return copy;
        };

        AudioBuffer.prototype.copyFromChannel = function (
          destination,
          channelNumber,
          startInChannel,
        ) {
          if (features.blockAudioFingerprint && _offlineBuffers.has(this)) {
            if (destination) destination.fill(0);
            return;
          }
          _copyFromChannel.call(
            this,
            destination,
            channelNumber,
            startInChannel,
          );
          if (_offlineBuffers.has(this) && destination)
            noiseFloat32(destination);
        };
      } catch (e) {
        console.warn("[privacy-guard] AudioBuffer patch failed:", e);
      }
    }

    if (typeof AnalyserNode !== "undefined") {
      try {
        const _getFloatFreq = AnalyserNode.prototype.getFloatFrequencyData;
        const _getFloatTime = AnalyserNode.prototype.getFloatTimeDomainData;

        AnalyserNode.prototype.getFloatFrequencyData = function (array) {
          if (features.blockAudioFingerprint) {
            if (array) array.fill(-Infinity);
            return;
          }
          _getFloatFreq.call(this, array);
          if (array) noiseFloat32(array);
        };

        AnalyserNode.prototype.getFloatTimeDomainData = function (array) {
          if (features.blockAudioFingerprint) {
            if (array) array.fill(0);
            return;
          }
          _getFloatTime.call(this, array);
          if (array) noiseFloat32(array);
        };
      } catch (e) {
        console.warn("[privacy-guard] AnalyserNode patch failed:", e);
      }
    }
  }

  if (features.blockFontFingerprint) {
    try {
      const fontStub = {
        check: () => false,
        load: () => Promise.resolve([]),
        get ready() {
          return Promise.resolve(fontStub);
        },
        status: "loaded",
        size: 0,
        forEach: () => {},
        has: () => false,
        [Symbol.iterator]: function* () {},
        keys: function* () {},
        values: function* () {},
        entries: function* () {},
        add() {
          return fontStub;
        },
        delete: () => false,
        clear: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      };
      Object.defineProperty(document, "fonts", {
        get: () => fontStub,
        configurable: true,
      });
    } catch (e) {
      console.warn("[privacy-guard] fonts patch failed:", e);
    }

    try {
      const _getBCR = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function () {
        const r = _getBCR.call(this);

        const nx = (Math.random() - 0.5) * 2;
        const ny = (Math.random() - 0.5) * 2;
        return {
          top: r.top + ny,
          left: r.left + nx,
          bottom: r.bottom + ny,
          right: r.right + nx,
          width: r.width + nx,
          height: r.height + ny,
          x: r.x + nx,
          y: r.y + ny,
          toJSON() {
            return {
              top: this.top,
              left: this.left,
              bottom: this.bottom,
              right: this.right,
              width: this.width,
              height: this.height,
              x: this.x,
              y: this.y,
            };
          },
        };
      };
    } catch (e) {}

    try {
      const _owDesc = Object.getOwnPropertyDescriptor(
        HTMLElement.prototype,
        "offsetWidth",
      );
      if (_owDesc?.get) {
        Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
          get() {
            return Math.round(
              _owDesc.get.call(this) + (Math.random() - 0.5) * 2,
            );
          },
          configurable: true,
        });
      }
    } catch (e) {}
    try {
      const _ohDesc = Object.getOwnPropertyDescriptor(
        HTMLElement.prototype,
        "offsetHeight",
      );
      if (_ohDesc?.get) {
        Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
          get() {
            return Math.round(
              _ohDesc.get.call(this) + (Math.random() - 0.5) * 2,
            );
          },
          configurable: true,
        });
      }
    } catch (e) {}

    try {
      const _getClientRects = Element.prototype.getClientRects;
      Element.prototype.getClientRects = function () {
        const rects = _getClientRects.call(this);
        const nx = (Math.random() - 0.5) * 2;
        const ny = (Math.random() - 0.5) * 2;

        return new Proxy(rects, {
          get(target, prop) {
            const val = target[prop];
            if (
              typeof prop === "string" &&
              /^\d+$/.test(prop) &&
              val instanceof DOMRect
            ) {
              return new DOMRect(
                val.x + nx,
                val.y + ny,
                val.width + nx,
                val.height + ny,
              );
            }
            if (prop === "item") {
              return (i) => {
                const r = target.item(i);
                return r instanceof DOMRect
                  ? new DOMRect(r.x + nx, r.y + ny, r.width + nx, r.height + ny)
                  : r;
              };
            }
            return typeof val === "function" ? val.bind(target) : val;
          },
        });
      };
    } catch (e) {}
  }

  if (features.spoofSpeechSynthesis || features.blockSpeechSynthesis) {
    if (typeof SpeechSynthesis !== "undefined" && globalThis.speechSynthesis) {
      try {
        const _getVoices = SpeechSynthesis.prototype.getVoices;
        SpeechSynthesis.prototype.getVoices = function () {
          if (features.blockSpeechSynthesis) return [];

          const real = _getVoices.call(this);
          const pick =
            real.find((v) => v.lang === "en-US" && !v.localService) ??
            real.find((v) => v.lang === "en-US") ??
            real[0];
          return pick ? [pick] : [];
        };
      } catch (e) {
        console.warn("[privacy-guard] speechSynthesis patch failed:", e);
      }
    }
  }

  if (features.spoofHardwareConcurrency) {
    try {
      Object.defineProperty(navigator, "hardwareConcurrency", {
        get: () => 4,
        configurable: true,
      });
    } catch (e) {
      console.warn("[privacy-guard] hardwareConcurrency patch failed:", e);
    }
  }

  if (features.spoofDeviceMemory) {
    try {
      Object.defineProperty(navigator, "deviceMemory", {
        get: () => 8,
        configurable: true,
      });
    } catch (e) {
      console.warn("[privacy-guard] deviceMemory patch failed:", e);
    }
  }

  if (features.spoofMediaDevices || features.blockMediaDevices) {
    const mdEnum = navigator.mediaDevices;
    if (mdEnum?.enumerateDevices && !mdEnum.enumerateDevices.__pgPatched) {
      try {
        const _enumDevices = mdEnum.enumerateDevices.bind(mdEnum);
        mdEnum.enumerateDevices = async function () {
          if (features.blockMediaDevices) return [];
          const devices = await _enumDevices();
          return devices.map((d) => ({
            kind: d.kind,
            label: "",
            deviceId: d.deviceId === "default" ? "default" : "pg-anonymized",
            groupId: "",
            toJSON() {
              return {
                kind: this.kind,
                label: "",
                deviceId: this.deviceId,
                groupId: "",
              };
            },
          }));
        };
        mdEnum.enumerateDevices.__pgPatched = true;
      } catch (e) {
        console.warn("[privacy-guard] enumerateDevices patch failed:", e);
      }
    }
  }

  if (features.blockNetworkInfo) {
    for (const prop of ["connection", "mozConnection", "webkitConnection"]) {
      try {
        Object.defineProperty(navigator, prop, {
          get: () => undefined,
          configurable: true,
        });
      } catch (e) {}
    }
  }

  if (features.blockPermissionsEnum) {
    if (
      navigator.permissions?.query &&
      !navigator.permissions.query.__pgPatched
    ) {
      try {
        navigator.permissions.query = async function () {
          return { state: "prompt", onchange: null };
        };
        navigator.permissions.query.__pgPatched = true;
      } catch (e) {
        console.warn("[privacy-guard] permissions.query patch failed:", e);
      }
    }
  }

  if (features.spoofStorageEstimate) {
    if (
      navigator.storage?.estimate &&
      !navigator.storage.estimate.__pgPatched
    ) {
      try {
        navigator.storage.estimate = async function () {
          return { quota: 107_374_182_400, usage: 12_345_678 };
        };
        navigator.storage.estimate.__pgPatched = true;
      } catch (e) {
        console.warn("[privacy-guard] storage.estimate patch failed:", e);
      }
    }
  }

  if (features.blockGamepad) {
    try {
      Object.defineProperty(navigator, "getGamepads", {
        value: () => [],
        configurable: true,
        writable: true,
      });
    } catch (e) {}
    for (const type of ["gamepadconnected", "gamepaddisconnected"]) {
      window.addEventListener(type, (e) => e.stopImmediatePropagation(), {
        capture: true,
      });
    }
  }

  if (features.blockLinkPrefetch) {
    const PREFETCH_RELS = new Set(["prefetch", "prerender", "dns-prefetch"]);

    function dropPrefetchLinks(node) {
      if (node.nodeType !== 1) return;
      if (node.tagName === "LINK") {
        const rel = (node.getAttribute("rel") ?? "").toLowerCase().trim();
        if (PREFETCH_RELS.has(rel)) {
          node.remove();
          return;
        }
      }
      node.querySelectorAll?.("link").forEach((link) => {
        const rel = (link.getAttribute("rel") ?? "").toLowerCase().trim();
        if (PREFETCH_RELS.has(rel)) link.remove();
      });
    }

    document.querySelectorAll("link").forEach((link) => {
      const rel = (link.getAttribute("rel") ?? "").toLowerCase().trim();
      if (PREFETCH_RELS.has(rel)) link.remove();
    });

    new MutationObserver((mutations) => {
      for (const m of mutations) m.addedNodes.forEach(dropPrefetchLinks);
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  if (features.stripTrackingParams) {
    const TRACKING_PARAMS = new Set([
      "gclid",
      "gclsrc",
      "dclid",
      "gbraid",
      "wbraid",
      "fbclid",
      "igshid",
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "utm_id",
      "utm_reader",
      "mc_eid",
      "mc_cid",
      "_hsenc",
      "_hsmi",
      "hsCtaTracking",
      "mkt_tok",
      "twclid",
      "msclkid",
      "WT.mc_id",
      "WT.srch",
      "trk",
      "trkInfo",
      "ncid",
      "s_cid",
    ]);

    function stripTracking(url) {
      try {
        const u = new URL(url, location.href);
        let changed = false;
        for (const p of TRACKING_PARAMS) {
          if (u.searchParams.has(p)) {
            u.searchParams.delete(p);
            changed = true;
          }
        }
        return changed ? u.toString() : null;
      } catch {
        return null;
      }
    }

    const cleanedHref = stripTracking(location.href);
    if (cleanedHref) {
      try {
        history.replaceState(history.state, "", cleanedHref);
      } catch (e) {}
    }

    try {
      const _push = history.pushState.bind(history);
      const _replace = history.replaceState.bind(history);
      history.pushState = function (state, title, url) {
        return _push(
          state,
          title,
          url != null ? (stripTracking(String(url)) ?? url) : url,
        );
      };
      history.replaceState = function (state, title, url) {
        return _replace(
          state,
          title,
          url != null ? (stripTracking(String(url)) ?? url) : url,
        );
      };
    } catch (e) {
      console.warn("[privacy-guard] history strip patch failed:", e);
    }
  }

  if (features.spoofTimezone) {
    try {
      const _OrigDTF = Intl.DateTimeFormat;
      const _OrigDTFProto = _OrigDTF.prototype;

      function PgDateTimeFormat(locales, options) {
        const opts = Object.assign({}, options ?? {}, { timeZone: "UTC" });
        if (new.target) {
          return Reflect.construct(_OrigDTF, [locales, opts], new.target);
        }
        return new _OrigDTF(locales, opts);
      }

      PgDateTimeFormat.prototype = _OrigDTFProto;
      try {
        PgDateTimeFormat.supportedLocalesOf =
          _OrigDTF.supportedLocalesOf.bind(_OrigDTF);
      } catch {}

      try {
        Object.defineProperty(Intl, "DateTimeFormat", {
          value: PgDateTimeFormat,
          configurable: true,
          writable: true,
        });
      } catch {}
    } catch {}

    try {
      Date.prototype.getTimezoneOffset = function () {
        return 0;
      };
    } catch {}

    try {
      const _toLS = Date.prototype.toLocaleString;
      Date.prototype.toLocaleString = function (...args) {
        if (args[1]) {
          args[1] = Object.assign({}, args[1], { timeZone: "UTC" });
        } else {
          args[1] = { timeZone: "UTC" };
        }
        return _toLS.apply(this, args);
      };
    } catch {}

    try {
      const _toLDS = Date.prototype.toLocaleDateString;
      Date.prototype.toLocaleDateString = function (...args) {
        if (args[1]) {
          args[1] = Object.assign({}, args[1], { timeZone: "UTC" });
        } else {
          args[1] = { timeZone: "UTC" };
        }
        return _toLDS.apply(this, args);
      };
    } catch {}

    try {
      const _toLTS = Date.prototype.toLocaleTimeString;
      Date.prototype.toLocaleTimeString = function (...args) {
        if (args[1]) {
          args[1] = Object.assign({}, args[1], { timeZone: "UTC" });
        } else {
          args[1] = { timeZone: "UTC" };
        }
        return _toLTS.apply(this, args);
      };
    } catch {}
  }

  if (features.spoofDevicePixelRatio) {
    try {
      Object.defineProperty(window, "devicePixelRatio", {
        get: () => 1,
        configurable: true,
      });
    } catch {}
  }

  if (features.spoofNavigatorPlatform) {
    try {
      Object.defineProperty(navigator, "platform", {
        get: () => "Win32",
        configurable: true,
      });
    } catch {}

    try {
      Object.defineProperty(navigator, "vendor", {
        get: () => "Google Inc.",
        configurable: true,
      });
    } catch {}

    try {
      if (navigator.userAgentData) {
        let _pgChromeVersion = "124";
        try {
          const _uaMatch = navigator.userAgent.match(/Chrome\/(\d+)/);
          if (_uaMatch) _pgChromeVersion = _uaMatch[1];
        } catch {}
        const _pgFullVer = _pgChromeVersion + ".0.0.0";

        const _pgBrands = Object.freeze([
          Object.freeze({ brand: "Google Chrome", version: _pgChromeVersion }),
          Object.freeze({ brand: "Chromium", version: _pgChromeVersion }),
          Object.freeze({ brand: "Not)A;Brand", version: "99" }),
        ]);
        const _pgFullVersionList = Object.freeze([
          Object.freeze({ brand: "Google Chrome", version: _pgFullVer }),
          Object.freeze({ brand: "Chromium", version: _pgFullVer }),
          Object.freeze({ brand: "Not)A;Brand", version: "99.0.0.0" }),
        ]);
        const _pgUAData = {
          brands: _pgBrands,
          mobile: false,
          platform: "Windows",
          getHighEntropyValues: async function () {
            return {
              architecture: "x86",
              bitness: "64",
              brands: _pgBrands,
              fullVersionList: _pgFullVersionList,
              mobile: false,
              model: "",
              platform: "Windows",
              platformVersion: "15.0.0",
              uaFullVersion: _pgFullVer,
            };
          },
          toJSON() {
            return {
              brands: this.brands,
              mobile: this.mobile,
              platform: this.platform,
            };
          },
        };
        Object.defineProperty(navigator, "userAgentData", {
          get: () => _pgUAData,
          configurable: true,
        });
      }
    } catch {}
  }

  if (features.spoofLanguage) {
    const _pgLangs = Object.freeze(["en-US", "en"]);
    try {
      Object.defineProperty(navigator, "language", {
        get: () => "en-US",
        configurable: true,
      });
    } catch {}
    try {
      Object.defineProperty(navigator, "languages", {
        get: () => _pgLangs,
        configurable: true,
      });
    } catch {}
  }

  const active = Object.entries(features)
    .filter(([, v]) => v)
    .map(([k]) => k);

  console.info(
    `[privacy-guard] installed — ${active.length} feature${active.length !== 1 ? "s" : ""} active:`,
    active.join(", "),
  );

  if (exceptions.length) {
    console.info(
      `[privacy-guard] ${exceptions.length} exception(s) active:`,
      exceptions.join(", "),
    );
  }
})();
