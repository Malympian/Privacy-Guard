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

  const features            = cfg.features        ?? {};

  
  
  
  
  const _nativeCaptureStream =
    typeof HTMLCanvasElement !== "undefined"
      ? HTMLCanvasElement.prototype.captureStream
      : null;

  const blockedPatterns     = cfg.blockedPatterns  ?? [];
  const exceptions          = cfg.exceptions       ?? [];   
  const extraBlockedDomains = cfg.blockedDomains   ?? [];   

  
  
  
  
  
  
  
  
  

  const KNOWN_TRACKER_DOMAINS = [
    

    
    "hotjar.com",
    "fullstory.com",
    "logrocket.io",
    "mouseflow.com",
    "inspectlet.com",
    "crazyegg.com",
    "luckyorange.com",
    "smartlook.com",
    "contentsquare.com",   
    "heapanalytics.com",
    "heap.io",

    
    "google-analytics.com",
    "googletagmanager.com",
    "doubleclick.net",
    "amplitude.com",
    "api.mixpanel.com",    
    "segment.io",          
    "clarity.microsoft.com",
  ];

  

  
  function emitPgMessage(message) {
    message.id ??= `pg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    
    
    
    
    window.postMessage(message, "*");

    try {
      const raw = JSON.stringify(message);
      document.documentElement.dataset.privacyGuardMessage = raw;
      document.dispatchEvent(
        new CustomEvent("__privacyGuardMessage", { detail: raw })
      );
    } catch {
      
    }
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
        matchedDomain = allDomains.find((d) => h === d || h.endsWith("." + d)) ?? null;
      } catch {  }
    }

    emitPgMessage({
      __privacyGuard: true,
      type: "observe",
      detail: { url: s, via, blocked, matchedPattern: matchedPattern ?? matchedDomain },
    });
  }

  
  function isBlocked(url) {
    const s = url instanceof Request ? url.url : String(url ?? "");

    
    if (exceptions.some((e) => s.includes(e))) return false;

    
    if (features.blockTrackingRequests && blockedPatterns.some((p) => s.includes(p))) return true;

    
    
    if (features.blockKnownTrackers) {
      try {
        const h = new URL(s).hostname;
        const allDomains = [...KNOWN_TRACKER_DOMAINS, ...extraBlockedDomains];
        if (allDomains.some((d) => h === d || h.endsWith("." + d))) return true;
      } catch {  }
    }

    return false;
  }

  
  function gaussMs(mean, std) {
    const u1 = Math.random(), u2 = Math.random();
    const z  = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) *
               Math.cos(2 * Math.PI * u2);
    return Math.max(0, Math.round(mean + z * std));
  }

  
  function beaconDelayMs() {
    return Math.random() < 0.10
      ? 300 + Math.round(Math.random() * 200)   
      : gaussMs(150, 50);
  }

  
  function randPx(range) { return (Math.random() - 0.5) * range * 2; }

  

  if (globalThis.__privacyGuardObservesRequests ||
      features.blockTrackingRequests ||
      features.blockKnownTrackers) {

    
    const _fetch = globalThis.fetch;
    globalThis.fetch = function (...args) {
      const url = args[0] instanceof Request ? args[0].url : String(args[0] ?? "");
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
      this.__pgUrl     = String(url ?? "");
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
      setTimeout(() => { try { _beacon(url, data); } catch {  } }, delay);
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
      Object.defineProperty(document, "hidden",                { get: () => false,     configurable: true });
      Object.defineProperty(document, "visibilityState",       { get: () => "visible", configurable: true });
      Object.defineProperty(document, "webkitHidden",          { get: () => false,     configurable: true });
      Object.defineProperty(document, "webkitVisibilityState", { get: () => "visible", configurable: true });
    } catch (e) {
      console.warn("[privacy-guard] visibilityState patch failed:", e);
    }
  }

  

  
  
  
  
  
  
  const MOUSE_TIMING = { mean: 12, std: 5  };
  const KB_TIMING    = { mean: 35, std: 15 };
  const CLICK_TIMING = { mean: 50, std: 20 };
  const TOUCH_TIMING = { mean: 35, std: 15 };
  const INPUT_TIMING = { mean: 35, std: 15 };
  const COORD_JITTER_PX  = 3;

  const KB_TYPES        = new Set(["keydown", "keyup", "keypress"]);
  const MOUSE_TYPES     = new Set(["mousemove", "mousedown", "mouseup",
                                    "pointermove", "pointerdown", "pointerup"]);
  const CLICK_TYPES     = new Set(["click", "dblclick", "contextmenu", "auxclick"]);
  const TOUCH_TYPES     = new Set(["touchstart", "touchend", "touchmove", "touchcancel"]);
  const BLUR_TYPES      = new Set(["blur", "focusout"]);
  const VIS_TYPES       = new Set(["visibilitychange"]);
  const INPUT_TYPES     = new Set(["input", "change"]);
  const CLIP_TYPES      = new Set(["copy", "cut", "paste"]);
  const SELECTION_TYPES = new Set(["selectionchange", "selectstart"]);
  const SCROLL_TYPES    = new Set(["scroll", "wheel", "scrollend", "touchmove"]);
  const STORAGE_TYPES   = new Set(["storage"]);

  const needsWrap =
    features.spoofKeyboardTiming  || features.blockKeyboardEvents  ||
    features.spoofMouseMovement   || features.blockMouseEvents     ||
    features.spoofClicks          || features.blockClickEvents     ||
    features.spoofTouch           || features.blockTouchEvents     ||
    features.spoofFormInput       || features.blockFormEvents      ||
    features.spoofFocus           ||
    features.spoofTabVisibility   ||
    features.blockClipboard       ||
    features.blockSelection       ||
    features.blockScrollTracking  ||
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
      _ael.call(window,   "blur",     stopSignal, true);
      _ael.call(document, "blur",     stopSignal, true);
      _ael.call(document, "focusout", stopSignal, true);
    }

    const wrapMap = new WeakMap();

    function getWrap(target) {
      
      
      
      
      
      
      
      
      
      
      if (target === null || target === undefined ||
          (typeof target !== "object" && typeof target !== "function")) {
        return new Map(); 
      }
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

    EventTarget.prototype.addEventListener = function (type, listener, options) {
      const eventType = String(type);

      if (typeof listener !== "function" && typeof listener !== "object") {
        return _ael.call(this, type, listener, options);
      }
      if (typeof listener !== "function") {
        return _ael.call(this, type, listener, options);
      }

      if (features.spoofFocus           && BLUR_TYPES.has(eventType))      return;
      if (features.spoofTabVisibility   && VIS_TYPES.has(eventType))       return;
      
      if (features.blockKeyboardEvents  && KB_TYPES.has(eventType))        return;
      if (features.blockMouseEvents     && MOUSE_TYPES.has(eventType))     return;
      if (features.blockClickEvents     && CLICK_TYPES.has(eventType))     return;
      if (features.blockTouchEvents     && TOUCH_TYPES.has(eventType))     return;
      if (features.blockFormEvents      && INPUT_TYPES.has(eventType))     return;
      if (features.blockClipboard       && CLIP_TYPES.has(eventType))      return;
      if (features.blockSelection       && SELECTION_TYPES.has(eventType)) return;
      if (features.blockScrollTracking  && SCROLL_TYPES.has(eventType))    return;
      if (features.blockTabEnumeration  && STORAGE_TYPES.has(eventType))   return;

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
            const delay   = gaussMs(MOUSE_TIMING.mean, MOUSE_TIMING.std);
            if (delay < 2) { listener.call(this, proxied); }
            else { const ctx = this; setTimeout(() => listener.call(ctx, proxied), delay); }
          };
        } else if (features.spoofClicks && CLICK_TYPES.has(eventType)) {
          wrapped = function (event) {
            const proxied = coordProxy(event);
            const delay   = gaussMs(CLICK_TIMING.mean, CLICK_TIMING.std);
            if (delay < 2) { listener.call(this, proxied); }
            else { const ctx = this; setTimeout(() => listener.call(ctx, proxied), delay); }
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

    const X_PROPS = ["clientX", "screenX", "pageX", "x", "offsetX", "movementX"];
    const Y_PROPS = ["clientY", "screenY", "pageY", "y", "offsetY", "movementY"];

    function patchProtoCoords(proto) {
      for (const prop of [...X_PROPS, ...Y_PROPS]) {
        const desc = Object.getOwnPropertyDescriptor(proto, prop);
        if (!desc?.get) continue;
        const origGet = desc.get;
        const isX     = X_PROPS.includes(prop);
        try {
          Object.defineProperty(proto, prop, {
            get() {
              const j = getEventJitter(this);
              return origGet.call(this) + (isX ? j.x : j.y);
            },
            configurable: true,
            enumerable:   desc.enumerable,
          });
        } catch {  }
      }
    }

    try { patchProtoCoords(MouseEvent.prototype);  } catch {  }
    try { if (globalThis.PointerEvent) patchProtoCoords(PointerEvent.prototype); } catch {  }
    try { if (globalThis.DragEvent)    patchProtoCoords(DragEvent.prototype);    } catch {  }
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
        if (typeof callback !== "function") return _raf.call(globalThis, callback);
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
        "NotAllowedError"
      );
    };
    ["RTCPeerConnection", "webkitRTCPeerConnection", "mozRTCPeerConnection"].forEach(name => {
      if (!globalThis[name]) return;
      try {
        const orig = globalThis[name];
        const shim  = function (...args) { _rtcBlocked(); };
        shim.prototype = orig.prototype;
        
        Object.getOwnPropertyNames(orig).forEach(p => {
          try { if (p !== "prototype") shim[p] = orig[p]; } catch {  }
        });
        Object.defineProperty(globalThis, name, {
          value: shim, configurable: true, writable: true,
        });
      } catch {  }
    });
  }

  
  
  
  
  
  
  

  if (features.spoofScrollDepth) {
    const _defProp = (obj, prop, val) => {
      try {
        Object.defineProperty(obj, prop, { get: () => val, configurable: true, enumerable: true });
      } catch {  }
    };

    
    _defProp(window, "scrollX",      0);
    _defProp(window, "scrollY",      0);
    _defProp(window, "pageXOffset",  0);
    _defProp(window, "pageYOffset",  0);

    
    try { _defProp(document.documentElement, "scrollTop",  0); } catch {  }
    try { _defProp(document.documentElement, "scrollLeft", 0); } catch {  }
    try { _defProp(document.body,            "scrollTop",  0); } catch {  }
    try { _defProp(document.body,            "scrollLeft", 0); } catch {  }

    
    try {
      const origGet = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop")?.get;
      if (origGet) {
        Object.defineProperty(Element.prototype, "scrollTop", {
          get() {
            
            if (this === document.documentElement || this === document.body) return 0;
            return origGet.call(this);
          },
          configurable: true,
        });
      }
    } catch {  }
  }

  
  
  
  
  

  if (features.blockBattery) {
    try {
      Object.defineProperty(navigator, "getBattery", {
        value: () => Promise.reject(
          new DOMException("Battery API blocked by Privacy Guard", "NotAllowedError")
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
        Math.abs(curr - noisy) < Math.abs(prev - noisy) ? curr : prev
      );
    }

    const sw = snapTo(BUCKETS_W, screen.width);
    const sh = snapTo(BUCKETS_H, screen.height);

    const screenProps = [
      ["width",       sw],
      ["height",      sh],
      ["availWidth",  sw],
      ["availHeight", sh - 40],   
      ["colorDepth",  24],
      ["pixelDepth",  24],
    ];
    for (const [prop, val] of screenProps) {
      try {
        Object.defineProperty(screen, prop, { get: () => val, configurable: true });
      } catch {  }
    }

    try { Object.defineProperty(window, "outerWidth",  { get: () => sw, configurable: true }); } catch { }
    try { Object.defineProperty(window, "outerHeight", { get: () => sh, configurable: true }); } catch { }
  }

  
  
  
  
  
  
  

  if (features.blockClipboard) {
    const _stopClip = (e) => { e.stopImmediatePropagation(); };
    const _clipOpts = { capture: true, passive: false };
    for (const type of ["copy", "cut", "paste"]) {
      try { document.addEventListener(type, _stopClip, _clipOpts); } catch { }
      try { window.addEventListener(type,   _stopClip, _clipOpts); } catch { }
    }
  }

  
  
  
  

  if (features.blockSelection) {
    const _stopSel  = (e) => { e.stopImmediatePropagation(); };
    const _selOpts  = { capture: true, passive: false };
    for (const type of ["selectionchange", "selectstart"]) {
      try { document.addEventListener(type, _stopSel, _selOpts); } catch { }
      try { window.addEventListener(type,   _stopSel, _selOpts); } catch { }
    }
  }

  
  
  
  
  

  if (features.blockScreenCapture) {
    
    
    if (navigator.mediaDevices?.getDisplayMedia) {
      try {
        Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
          value: () => Promise.reject(
            new DOMException("Screen capture blocked by Privacy Guard", "NotAllowedError")
          ),
          configurable: true,
          writable: true,
        });
      } catch (e) {
        console.warn("[privacy-guard] getDisplayMedia patch failed:", e);
      }
    }

    
    for (const proto of [HTMLCanvasElement.prototype, HTMLVideoElement.prototype]) {
      if (typeof proto.captureStream === "function") {
        try {
          Object.defineProperty(proto, "captureStream", {
            value() {
              throw new DOMException("Screen capture blocked by Privacy Guard", "NotAllowedError");
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
        console.warn("[privacy-guard] MediaStreamTrack.getSettings patch failed:", e);
      }
    }
  }

  
  
  
  
  
  
  
  
  

  function makeFilteredVideoTrack(realTrack, draw, fps = 15) {
    const settings = realTrack.getSettings?.() ?? {};
    const w = settings.width  || 640;
    const h = settings.height || 480;

    const video = document.createElement("video");
    video.muted = true;
    video.srcObject = new MediaStream([realTrack]);
    video.play().catch(() => {  });

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");

    let rafId = null;
    function tick() {
      try { draw(ctx, video, w, h); } catch {  }
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
      try { realTrack.stop(); } catch {  }
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
      audioCtx = new (globalThis.AudioContext || globalThis.webkitAudioContext)();
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
      try { realTrack.stop(); } catch {  }
      try { audioCtx.close(); } catch {  }
      nativeStop();
    };
    return outTrack;
  }

  
  
  
  
  
  
  
  

  function makeSilentBlackVideoTrack(fps = 10) {
    try {
      const canvas = document.createElement("canvas");
      canvas.width  = 640;
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
      const audioCtx = new (globalThis.AudioContext || globalThis.webkitAudioContext)();
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
          try { osc.stop(); } catch {  }
          try { audioCtx.close(); } catch {  }
          nativeStop();
        };
      }
      return outTrack;
    } catch {
      return null;
    }
  }

  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  

  if (features.blockCamera || features.spoofCamera ||
      features.blockMicrophone || features.spoofMicrophone) {

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

    
    
    for (const name of ["getUserMedia", "webkitGetUserMedia", "mozGetUserMedia"]) {
      if (md && typeof navigator[name] === "function" && !navigator[name].__pgPatched) {
        const legacy = function (constraints, successCb, errorCb) {
          md.getUserMedia(constraints).then(successCb, errorCb);
        };
        legacy.__pgPatched = true;
        try { navigator[name] = legacy; } catch {  }
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
        NoopChannel.prototype.postMessage = function () {  };
        NoopChannel.prototype.close = function () {  };
        NoopChannel.prototype.addEventListener = function () {  };
        NoopChannel.prototype.removeEventListener = function () { };
        Object.defineProperty(globalThis, "BroadcastChannel", {
          value: NoopChannel, configurable: true, writable: true,
        });
      } catch (e) {
        console.warn("[privacy-guard] BroadcastChannel patch failed:", e);
      }
    }

    if (typeof SharedWorker !== "undefined") {
      try {
        const blockedSharedWorker = function () {
          throw new DOMException("SharedWorker blocked by Privacy Guard", "NotAllowedError");
        };
        Object.defineProperty(globalThis, "SharedWorker", {
          value: blockedSharedWorker, configurable: true, writable: true,
        });
      } catch (e) {
        console.warn("[privacy-guard] SharedWorker patch failed:", e);
      }
    }
  }

  
  
  
  
  
  
  

  if (features.spoofReferrer) {
    try {
      Object.defineProperty(document, "referrer", { get: () => "", configurable: true });
    } catch (e) {
      console.warn("[privacy-guard] referrer patch failed:", e);
    }
  }

  
  
  
  
  
  
  
  
  

  if (features.blockCacheTimingProbe && typeof performance !== "undefined") {
    const TIMING_FIELDS = ["transferSize", "encodedBodySize", "decodedBodySize"];

    function scrubTimingEntry(entry) {
      if (entry.entryType !== "resource" && entry.entryType !== "navigation") return entry;
      for (const f of TIMING_FIELDS) {
        try { Object.defineProperty(entry, f, { value: 0, configurable: true }); } catch {  }
      }
      return entry;
    }

    try {
      const _getEntries        = Performance.prototype.getEntries;
      const _getEntriesByType  = Performance.prototype.getEntriesByType;
      const _getEntriesByName  = Performance.prototype.getEntriesByName;

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
          value: WrappedPO, configurable: true, writable: true,
        });
      } catch (e) {
        console.warn("[privacy-guard] PerformanceObserver patch failed:", e);
      }
    }
  }

  
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
