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
    key: "blockLinkPrefetch",
    label: "Block link prefetch & prerender",
    hint: "Removes <link rel='prefetch'>, <link rel='prerender'>, and <link rel='dns-prefetch'> tags added by page scripts — prevents the browser from silently fetching or resolving resources in the background on behalf of a page.",
  },
  {
    key: "stripTrackingParams",
    label: "Strip tracking URL parameters",
    hint: "Removes known tracking query parameters (fbclid, gclid, utm_*, _hsenc, mc_eid, mkt_tok, and more) from the current page URL via history.replaceState, and from SPA navigations via pushState. The server still receives them on the initial page load.",
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

  // ── Fingerprinting surface ──────────────────────────────────────────────
  {
    key: "spoofCanvasNoise",
    label: "Add noise to canvas reads",
    hint: "Flips the least-significant bit of ~5% of colour-channel pixels returned by toDataURL(), toBlob(), and getImageData() — imperceptible visually but breaks pixel-level canvas fingerprinting. The original canvas is never modified.",
  },
  {
    key: "blockCanvas",
    label: "Block canvas data reads entirely",
    hint: "toDataURL() and toBlob() return a blank canvas of the same dimensions; getImageData() returns zeroed pixel data. Eliminates all canvas-based fingerprinting but may break sites that rely on canvas for CAPTCHAs or image processing.",
    parentKey: "spoofCanvasNoise",
  },
  {
    key: "spoofWebGL",
    label: "Mask WebGL renderer & vendor info",
    hint: "Hides the WEBGL_debug_renderer_info extension (GPU make/model), spoofs getParameter() renderer strings, and adds imperceptible noise to readPixels() output. GPU identity is the most stable component of a WebGL fingerprint.",
  },
  {
    key: "blockWebGL",
    label: "Disable WebGL entirely",
    hint: "getContext('webgl') and getContext('webgl2') return null — no WebGL context is created. Prevents all WebGL fingerprinting but will break 3D graphics and WebGL-based CAPTCHAs.",
    parentKey: "spoofWebGL",
  },
  {
    key: "spoofAudioFingerprint",
    label: "Add noise to AudioContext output",
    hint: "Adds imperceptible sub-LSB noise (~1e-7) to OfflineAudioContext rendered buffers (getChannelData, copyFromChannel) and AnalyserNode reads. The offline audio rendering pipeline produces a hardware-specific signature detectable from audio processing alone.",
  },
  {
    key: "blockAudioFingerprint",
    label: "Return silence from audio buffer reads",
    hint: "OfflineAudioContext rendered buffer reads and AnalyserNode reads return all-zero (silent) data, stripping device-specific characteristics from the audio chain. Does not affect audio playback.",
    parentKey: "spoofAudioFingerprint",
  },
  {
    key: "blockFontFingerprint",
    label: "Block font enumeration",
    hint: "Replaces document.fonts with a stub that reports no fonts loaded — prevents sites from probing which installed system fonts resolve vs. fall back, a common and stable fingerprinting technique.",
  },
  {
    key: "spoofSpeechSynthesis",
    label: "Limit speech synthesis voices",
    hint: "Returns a single generic voice from speechSynthesis.getVoices() instead of the full device-specific list. Installed OS language packs produce a highly unique voice inventory.",
  },
  {
    key: "blockSpeechSynthesis",
    label: "Return empty voice list",
    hint: "speechSynthesis.getVoices() returns an empty array, preventing any voice enumeration fingerprinting entirely.",
    parentKey: "spoofSpeechSynthesis",
  },
  {
    key: "spoofHardwareConcurrency",
    label: "Spoof CPU core count",
    hint: "Reports navigator.hardwareConcurrency as 4 — the most common desktop value. The real core count directly identifies the processor model.",
  },
  {
    key: "spoofDeviceMemory",
    label: "Spoof device memory",
    hint: "Reports navigator.deviceMemory as 8 GB. The actual value is rounded to a power of two but still narrows down device class.",
  },
  {
    key: "spoofMediaDevices",
    label: "Anonymize media device list",
    hint: "enumerateDevices() returns devices with stripped labels and anonymized IDs. The real device ID is a persistent browser-level identifier, stable across sessions for the same origin.",
  },
  {
    key: "blockMediaDevices",
    label: "Hide media device list entirely",
    hint: "enumerateDevices() returns an empty array, preventing any camera or microphone enumeration even when permission was previously granted.",
    parentKey: "spoofMediaDevices",
  },
  {
    key: "blockNetworkInfo",
    label: "Block Network Information API",
    hint: "Returns undefined for navigator.connection — the connection type (4g/3g/wifi), effective bandwidth, and RTT are a soft fingerprint and also reveal rough network conditions.",
  },
  {
    key: "blockPermissionsEnum",
    label: "Block permissions enumeration",
    hint: "navigator.permissions.query() always returns 'prompt', preventing sites from probing which permissions (camera, clipboard, notifications, etc.) have already been granted or denied in your browser profile.",
  },
  {
    key: "spoofStorageEstimate",
    label: "Spoof storage quota",
    hint: "navigator.storage.estimate() returns a fixed 100 GB quota and minimal usage. The real available storage quota varies by device and browser profile.",
  },
  {
    key: "blockGamepad",
    label: "Block gamepad enumeration",
    hint: "navigator.getGamepads() returns an empty array and gamepadconnected/gamepaddisconnected events are suppressed. Connected controller models and their axis/button counts are a stable fingerprint signal.",
  },
];

const DEFAULT_FEATURES = {
  ...Object.fromEntries(SETTINGS_META.map(({ key }) => [key, false])),
};
