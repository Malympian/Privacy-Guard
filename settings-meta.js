const SETTINGS_META = [
  {
    key: "blockTrackingRequests",
    label: "Block analytics & tracking requests",
    hint: "Stops fetch, XHR, and sendBeacon calls to common tracking URLs.",
  },
  {
    key: "blockTrackingPixels",
    label: "Block tracking pixels",
    hint: "Prevents invisible images used as beacons.",
  },
  {
    key: "blockKnownTrackers",
    label: "Block known tracker domains",
    hint: "Domain-level block for known analytics, session-recording, and ad-tracking vendors.",
  },
  {
    key: "blockWebRTC",
    label: "Block WebRTC IP leakage",
    hint: "Disables RTCPeerConnection so STUN/TURN handshakes cannot reveal your real IP address, even through a VPN.",
  },
  {
    key: "blockBattery",
    label: "Block Battery Status API",
    hint: "Replaces navigator.getBattery() with a rejected Promise — battery level and charge rate are a stable fingerprint.",
  },

  {
    key: "spoofCamera",
    label: "Blur camera feed",
    hint: "getUserMedia still resolves with a live video track — it's just constantly blurred, never your real image. Off by default; turn on per-site.",
  },
  {
    key: "blockCamera",
    label: "Block camera access entirely",
    hint: "getUserMedia rejects camera requests outright with the same error a site sees when you decline the permission prompt yourself.",
    parentKey: "spoofCamera",
  },
  {
    key: "fakeGrantCamera",
    label: "Pretend camera was granted (return black video)",
    hint: "When camera is blocked, getUserMedia resolves with a silent black-frame track instead of rejecting — the site believes it has camera access but receives no real image. Useful when you want to block silently without triggering a site's 'no camera' error flow.",
    parentKey: "blockCamera",
  },
  {
    key: "spoofMicrophone",
    label: "Muffle microphone audio",
    hint: "Audio is routed through a low-pass filter before the page ever sees it — present, but unintelligible. Off by default; turn on per-site.",
  },
  {
    key: "blockMicrophone",
    label: "Block microphone access entirely",
    hint: "getUserMedia rejects microphone requests outright with the same error a site sees when you decline the permission prompt yourself.",
    parentKey: "spoofMicrophone",
  },
  {
    key: "fakeGrantMicrophone",
    label: "Pretend microphone was granted (return silent audio)",
    hint: "When microphone is blocked, getUserMedia resolves with a truly silent audio track instead of rejecting — the site believes it has mic access but receives no real audio. Useful when you want to block silently without triggering a site's 'no mic' error flow.",
    parentKey: "blockMicrophone",
  },

  {
    key: "spoofTabVisibility",
    label: "Pretend the tab is always visible",
    hint: "Hides tab-switch / minimize detection via Page Visibility API.",
  },
  {
    key: "spoofFocus",
    label: "Pretend the window always has focus",
    hint: "focus and blur events; patches document.hasFocus().",
  },

  {
    key: "blockTabEnumeration",
    label: "Hide other open tabs & windows",
    hint: "Neuters BroadcastChannel and SharedWorker (common leader-election tricks for counting tabs) and drops page-registered 'storage' event listeners — a site can no longer tell how many other tabs or windows of it you have open.",
  },

  {
    key: "spoofReferrer",
    label: "Hide the page that linked you here",
    hint: "Clears document.referrer so a site can't see which page sent you to it.",
  },
  {
    key: "blockCacheTimingProbe",
    label: "Block cache-timing history sniffing",
    hint: "Strips transferSize/encodedBodySize and rounds timing precision in the Resource Timing API, so a site can't infer your other browsing history by checking whether a shared resource (CDN script, font, pixel) is already in your cache.",
  },

  {
    key: "spoofScreenSize",
    label: "Spoof screen dimensions",
    hint: "Snaps screen.width/height and window.outerWidth/Height to the nearest common resolution bucket, preventing display fingerprinting.",
  },
  {
    key: "spoofScrollDepth",
    label: "Spoof scroll depth & position",
    hint: "Returns 0 for window.scrollY / scrollX and document.documentElement.scrollTop, masking scroll position from page scripts.",
  },
  {
    key: "spoofPerformanceTiming",
    label: "Noise timing APIs",
    hint: "Adds ±0.5 ms noise to performance.now(), requestAnimationFrame timestamps, and Date.now() — defeats direct-poll timing fingerprints.",
  },

  {
    key: "spoofKeyboardTiming",
    label: "Obscure typing rhythm",
    hint: "Delays keydown, keyup, and keypress events by a small random amount (averaging ~35 ms) so scripts cannot profile your keystroke cadence or typing speed.",
  },
  {
    key: "blockKeyboardEvents",
    label: "Block keyboard listeners entirely",
    hint: "Silently drops all addEventListener registrations for keydown / keyup / keypress — nothing reaches page scripts.",
    parentKey: "spoofKeyboardTiming",
  },

  {
    key: "spoofMouseMovement",
    label: "Obscure mouse movement",
    hint: "Adds small random offsets (±3 px) to mouse and pointer event coordinates, and slightly delays delivery, so scripts cannot reconstruct an accurate map of how you move the cursor.",
  },
  {
    key: "blockMouseEvents",
    label: "Block mouse movement listeners entirely",
    hint: "Drops all mousemove / pointermove / mousedown / mouseup listeners — no movement data reaches page scripts.",
    parentKey: "spoofMouseMovement",
  },

  {
    key: "spoofClicks",
    label: "Obscure click positions",
    hint: "Adds small random offsets (±3 px) to click, double-click, and right-click coordinates, and slightly delays delivery, so scripts cannot pinpoint exactly where on a page you click.",
  },
  {
    key: "blockClickEvents",
    label: "Block click listeners entirely",
    hint: "Drops all click / dblclick / contextmenu listeners. Caution: may break interactive page elements.",
    parentKey: "spoofClicks",
  },

  {
    key: "spoofTouch",
    label: "Obscure touch gestures",
    hint: "Slightly delays touchstart, touchend, and touchmove events so scripts cannot build a precise fingerprint of your touch timing patterns.",
  },
  {
    key: "blockTouchEvents",
    label: "Block touch listeners entirely",
    hint: "Drops all touch event listeners from page scripts.",
    parentKey: "spoofTouch",
  },

  {
    key: "spoofFormInput",
    label: "Obscure form field activity",
    hint: "Slightly delays input and change events so scripts cannot measure how quickly you type into fields or determine your editing cadence.",
  },
  {
    key: "blockFormEvents",
    label: "Block form event listeners entirely",
    hint: "Drops all input / change listeners from page scripts. Caution: may break live validation.",
    parentKey: "spoofFormInput",
  },

  {
    key: "blockClipboard",
    label: "Block clipboard event tracking",
    hint: "Prevents page scripts from listening to copy, cut, and paste events. Browser clipboard still works normally.",
  },
  {
    key: "blockSelection",
    label: "Block selection / highlight tracking",
    hint: "Drops selectionchange and selectstart listeners — page scripts cannot detect when you highlight text.",
  },

  {
    key: "spoofScreenCapture",
    label: "Pixelate screen capture instead of blocking",
    hint: "getDisplayMedia still succeeds, but the frames are heavily downsampled and pixelated before the page receives them. Has no effect when 'Block screen capture' is on.",
  },
  {
    key: "blockScreenCapture",
    label: "Block screen capture & recording detection",
    hint: "Blocks getDisplayMedia so pages cannot request screen sharing or detect if your screen is being captured. Also strips capture metadata from MediaStreamTracks and blocks canvas/video captureStream().",
    parentKey: "spoofScreenCapture",
  },

  {
    key: "blockScrollTracking",
    label: "Block scroll event tracking",
    hint: "Drops all scroll, wheel, and scrollend listeners registered by page scripts. Note: may affect scroll-dependent UI (infinite loaders, sticky headers).",
  },
];

const DEFAULT_FEATURES = {
  ...Object.fromEntries(
    SETTINGS_META.map(({ key, parentKey }) => [key, parentKey ? false : true]),
  ),

  spoofCamera: false,
  spoofMicrophone: false,
};
