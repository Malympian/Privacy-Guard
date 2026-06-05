/** Shared labels for popup UI (loaded by popup.html only). */
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
    key: "spoofTabVisibility",
    label: "Pretend the tab is always visible",
    hint: "Hides tab-switch / minimize detection via Page Visibility API.",
  },
  {
    key: "spoofKeyboardTiming",
    label: "Obscure typing rhythm",
    hint: "keydown, keyup, keypress timing.",
  },
  {
    key: "spoofMouseMovement",
    label: "Obscure mouse movement",
    hint: "mousemove, mousedown, mouseup, and pointer equivalents.",
  },
  {
    key: "spoofClicks",
    label: "Obscure click positions",
    hint: "click, double-click, and right-click.",
  },
  {
    key: "spoofTouch",
    label: "Obscure touch gestures",
    hint: "touchstart, touchend, touchmove.",
  },
  {
    key: "spoofFocus",
    label: "Pretend the window always has focus",
    hint: "focus and blur events; patches document.hasFocus().",
  },
  {
    key: "spoofFormInput",
    label: "Obscure form field activity",
    hint: "input and change event timing.",
  },
];

const DEFAULT_FEATURES = Object.fromEntries(
  SETTINGS_META.map(({ key }) => [key, true]),
);