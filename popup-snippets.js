{\rtf1\ansi\ansicpg1252\cocoartf2758
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fswiss\fcharset0 Helvetica;}
{\colortbl;\red255\green255\blue255;}
{\*\expandedcolortbl;;}
\margl1440\margr1440\vieww11520\viewh8400\viewkind0
\pard\tx720\tx1440\tx2160\tx2880\tx3600\tx4320\tx5040\tx5760\tx6480\tx7200\tx7920\tx8640\pardirnatural\partightenfactor0

\f0\fs24 \cf0 // \uc0\u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \
// popup.js REPLACEMENT SNIPPETS\
//\
// Drop these functions in, replacing the existing renderDiscover and\
// renderBlockLog bodies. They work with the new full-URL storage format\
// produced by the updated background.js.\
//\
// ALSO requires:\
//   1. A <div id="exceptions-list"></div> section in your HTML (for the\
//      managed exceptions panel \'97 see popup.html notes below).\
//   2. The CSS additions at the bottom of this file in your popup's <style>.\
// \uc0\u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \
\
\
// \uc0\u9472 \u9472  Block log (Home panel) \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \
// Replaces the existing renderBlockLog() body.\
// Adds an "Allow" button per entry that writes an exception via background.js.\
\
async function renderBlockLog() \{\
  if (currentTabId == null) return;\
  const stats = await sendBg(\{ type: "getTabStats", tabId: currentTabId \});\
  const count = stats?.count ?? 0;\
  const log   = stats?.log   ?? [];\
\
  blockBigEl.textContent = count;\
\
  if (navBlockBadgeEl) \{\
    navBlockBadgeEl.textContent = count > 99 ? "99+" : String(count);\
    navBlockBadgeEl.classList.toggle("show", count > 0);\
  \}\
\
  if (count === 0) \{\
    blockSubEl.textContent = "none yet";\
    blockLogEl.textContent = "";\
    activityEl.classList.add("hidden");\
    return;\
  \}\
\
  activityEl.classList.remove("hidden");\
  blockSubEl.textContent = `request$\{count === 1 ? "" : "s"\} blocked`;\
\
  blockLogEl.textContent = "";\
\
  for (const entry of log.slice(0, 15)) \{\
    const li = document.createElement("li");\
    li.className = "log-entry";\
\
    const timeEl = document.createElement("span");\
    timeEl.className = "t";\
    timeEl.textContent = new Date(entry.at).toLocaleTimeString();\
\
    const urlEl = document.createElement("span");\
    urlEl.className = "log-url";\
    urlEl.textContent = entry.url;\
    urlEl.title = entry.url; // show full URL on hover\
\
    const allowBtn = document.createElement("button");\
    allowBtn.className = "log-allow-btn";\
    allowBtn.textContent = "Allow";\
    allowBtn.title = "Add exception so this URL is no longer blocked";\
    allowBtn.addEventListener("click", async () => \{\
      allowBtn.disabled = true;\
      allowBtn.textContent = "\'85";\
      const res = await sendBg(\{ type: "addException", url: entry.url \});\
      if (res?.ok) \{\
        allowBtn.textContent = "\uc0\u10003  Allowed";\
        li.classList.add("excepted");\
        // Show a one-time reload notice\
        showReloadNotice();\
      \} else \{\
        allowBtn.textContent = "Error";\
        allowBtn.disabled = false;\
      \}\
    \});\
\
    li.append(timeEl, urlEl, allowBtn);\
    blockLogEl.appendChild(li);\
  \}\
\}\
\
\
// \uc0\u9472 \u9472  Discovery panel \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \
// Replaces the existing renderDiscover() body.\
// Shows full request objects: URL \'b7 decision badge \'b7 matched patterns \'b7 action btn.\
\
async function renderDiscover() \{\
  if (currentTabId == null || !discoverListEl) return;\
  await syncObservedQueue();\
\
  const \{ items = [] \} = await sendBg(\{ type: "getDiscovered", tabId: currentTabId \});\
  discoverListEl.textContent = "";\
  setDiscoverPing(items.length);\
\
  if (!items.length) \{\
    const li = document.createElement("li");\
    li.innerHTML =\
      `<span class="empty-note">Nothing captured yet \'97 reload or interact with the page.</span>`;\
    discoverListEl.appendChild(li);\
    return;\
  \}\
\
  // Sort: blocked first, then by hit count\
  items.sort((a, b) => \{\
    if (a.blocked !== b.blocked) return a.blocked ? -1 : 1;\
    return (b.hits ?? 0) - (a.hits ?? 0);\
  \});\
\
  for (const item of items) \{\
    if (!item?.url) continue; // guard against malformed entries\
\
    const li = document.createElement("li");\
    li.className = [\
      "disc-entry",\
      item.blocked    ? "is-blocked"  : "",\
      item.isExcepted ? "is-excepted" : "",\
    ].filter(Boolean).join(" ");\
\
    // \uc0\u9472 \u9472  Decision badge \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \
    const badge = document.createElement("span");\
    badge.className =\
      "disc-decision " +\
      (item.blocked ? "dec-block" : item.isExcepted ? "dec-except" : "dec-allow");\
    badge.textContent = item.blocked\
      ? "BLOCKED"\
      : item.isExcepted\
        ? "EXCEPTED"\
        : "ALLOWED";\
\
    // \uc0\u9472 \u9472  URL + matched pattern tags \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \
    const urlLine = document.createElement("div");\
    urlLine.className = "disc-url";\
    urlLine.textContent = item.url.slice(0, 120);\
    urlLine.title = item.url;\
\
    if (item.matchedPatterns?.length) \{\
      const tagRow = document.createElement("div");\
      tagRow.className = "disc-tags";\
      for (const p of item.matchedPatterns) \{\
        const tag = document.createElement("span");\
        tag.className = "event-tag disc-blocked-tag";\
        tag.textContent = p;\
        tagRow.appendChild(tag);\
      \}\
      urlLine.appendChild(tagRow);\
    \}\
\
    // \uc0\u9472 \u9472  Meta line \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \
    const meta = document.createElement("div");\
    meta.className = "disc-meta";\
    const reasonStr = item.reason ? ` \'b7 matched: $\{item.reason\}` : "";\
    const timeStr   = item.lastSeen\
      ? ` \'b7 $\{new Date(item.lastSeen).toLocaleTimeString()\}`\
      : "";\
    meta.textContent =\
      `$\{item.hits ?? 1\}\'d7 via $\{item.via || "?"\}$\{reasonStr\}$\{timeStr\}`;\
\
    // \uc0\u9472 \u9472  Action button \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \
    const body = document.createElement("div");\
    body.className = "disc-body";\
    body.append(urlLine, meta);\
\
    if (item.blocked && !item.isExcepted) \{\
      // Allow this URL (add exception)\
      const allowBtn = document.createElement("button");\
      allowBtn.className = "disc-action-btn disc-allow-btn";\
      allowBtn.textContent = "Allow this URL";\
      allowBtn.addEventListener("click", async (e) => \{\
        e.stopPropagation();\
        allowBtn.disabled = true;\
        allowBtn.textContent = "\'85";\
        const res = await sendBg(\{ type: "addException", url: item.url \});\
        if (res?.ok) \{\
          allowBtn.textContent = "\uc0\u10003  Allowed (reload to apply)";\
          li.classList.remove("is-blocked");\
          li.classList.add("is-excepted");\
          badge.className = "disc-decision dec-except";\
          badge.textContent = "EXCEPTED";\
          showReloadNotice();\
        \} else \{\
          allowBtn.textContent = "Error";\
          allowBtn.disabled = false;\
        \}\
      \});\
      body.appendChild(allowBtn);\
\
    \} else if (item.isExcepted) \{\
      // Re-block (remove exception)\
      const reblockBtn = document.createElement("button");\
      reblockBtn.className = "disc-action-btn disc-reblock-btn";\
      reblockBtn.textContent = "Re-block";\
      reblockBtn.addEventListener("click", async (e) => \{\
        e.stopPropagation();\
        reblockBtn.disabled = true;\
        reblockBtn.textContent = "\'85";\
        // Derive the exception key the same way background.js does\
        let pattern = item.url;\
        try \{ const u = new URL(item.url); pattern = u.origin + u.pathname; \} catch \{\}\
        const res = await sendBg(\{ type: "removeException", pattern \});\
        if (res?.ok) \{\
          reblockBtn.textContent = "\uc0\u10003  Re-blocked (reload to apply)";\
          showReloadNotice();\
        \} else \{\
          reblockBtn.textContent = "Error";\
          reblockBtn.disabled = false;\
        \}\
      \});\
      body.appendChild(reblockBtn);\
    \}\
\
    // \uc0\u9472 \u9472  Row layout: badge + body \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \
    const row = document.createElement("div");\
    row.className = "disc-row";\
    row.append(badge, body);\
    li.appendChild(row);\
    discoverListEl.appendChild(li);\
  \}\
\}\
\
\
// \uc0\u9472 \u9472  Exceptions panel \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \
// New function \'97 call this when the Exceptions panel is shown.\
// Needs <ul id="exceptions-list"></ul> in your popup.html.\
\
async function renderExceptions() \{\
  const listEl = document.getElementById("exceptions-list");\
  if (!listEl) return;\
\
  const \{ exceptions = [] \} = await sendBg(\{ type: "getExceptions" \});\
  listEl.textContent = "";\
\
  if (!exceptions.length) \{\
    const li = document.createElement("li");\
    li.innerHTML =\
      `<span class="empty-note">No exceptions yet. Use "Allow" on a blocked request to add one.</span>`;\
    listEl.appendChild(li);\
    return;\
  \}\
\
  for (const pattern of exceptions) \{\
    const li = document.createElement("li");\
\
    const span = document.createElement("span");\
    span.className = "s-domain";\
    span.textContent = pattern;\
    span.title = pattern;\
\
    const btn = document.createElement("button");\
    btn.className = "rm-btn";\
    btn.textContent = "\'d7";\
    btn.title = "Remove exception (re-block)";\
    btn.addEventListener("click", async () => \{\
      btn.disabled = true;\
      await sendBg(\{ type: "removeException", pattern \});\
      await renderExceptions();\
      showReloadNotice();\
    \});\
\
    li.append(span, btn);\
    listEl.appendChild(li);\
  \}\
\}\
\
\
// \uc0\u9472 \u9472  Reload notice \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \
// Shows a one-time "Reload the page to apply changes" banner.\
// Needs <div id="reload-notice" class="reload-notice hidden">\'85</div> in HTML.\
\
let _reloadNoticePending = false;\
function showReloadNotice() \{\
  if (_reloadNoticePending) return;\
  _reloadNoticePending = true;\
  const el = document.getElementById("reload-notice");\
  if (!el) return;\
  el.classList.remove("hidden");\
  el.addEventListener("click", () => \{\
    if (currentTabId != null) chrome.tabs.reload(currentTabId);\
    el.classList.add("hidden");\
    _reloadNoticePending = false;\
  \}, \{ once: true \});\
\}\
\
\
// \uc0\u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \
// CSS to add inside popup.html <style>\
// \uc0\u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \
/*\
\
  \uc0\u9472 \u9472  Discovery list items \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \
\
  .disc-entry           \{ padding: 6px 0; border-bottom: 1px solid var(--border); \}\
  .disc-row             \{ display: flex; gap: 8px; align-items: flex-start; \}\
  .disc-body            \{ flex: 1; min-width: 0; \}\
\
  .disc-decision        \{ flex-shrink: 0; font-size: 9px; font-weight: 700;\
                          padding: 2px 5px; border-radius: 3px; margin-top: 2px;\
                          letter-spacing: .04em; \}\
  .dec-block            \{ background: #fee2e2; color: #991b1b; \}\
  .dec-allow            \{ background: #dcfce7; color: #166534; \}\
  .dec-except           \{ background: #fef9c3; color: #854d0e; \}\
\
  .disc-url             \{ font-size: 11px; word-break: break-all;\
                          color: var(--text-primary); margin-bottom: 2px; \}\
  .disc-tags            \{ margin-top: 3px; display: flex; flex-wrap: wrap; gap: 3px; \}\
  .disc-meta            \{ font-size: 10px; color: var(--text-muted); \}\
\
  .disc-action-btn      \{ margin-top: 5px; padding: 2px 8px; font-size: 10px;\
                          border-radius: 4px; border: 1px solid; cursor: pointer; \}\
  .disc-allow-btn       \{ background: #dcfce7; color: #166534; border-color: #86efac; \}\
  .disc-allow-btn:hover \{ background: #bbf7d0; \}\
  .disc-reblock-btn     \{ background: #fee2e2; color: #991b1b; border-color: #fca5a5; \}\
  .disc-reblock-btn:hover \{ background: #fecaca; \}\
\
  .is-excepted .disc-url \{ opacity: .65; \}\
\
  \uc0\u9472 \u9472  Block log Allow button \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \
\
  .log-entry            \{ display: flex; align-items: baseline; gap: 6px; \}\
  .log-url              \{ flex: 1; overflow: hidden; text-overflow: ellipsis;\
                          white-space: nowrap; font-size: 11px; \}\
  .log-allow-btn        \{ flex-shrink: 0; padding: 1px 7px; font-size: 10px;\
                          border-radius: 4px; border: 1px solid #86efac;\
                          background: #dcfce7; color: #166534; cursor: pointer; \}\
  .log-allow-btn:hover  \{ background: #bbf7d0; \}\
  .log-entry.excepted .log-url \{ opacity: .6; text-decoration: line-through; \}\
\
  \uc0\u9472 \u9472  Reload notice banner \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \u9472 \
\
  .reload-notice        \{ background: #fef9c3; color: #854d0e; font-size: 11px;\
                          padding: 6px 10px; border-radius: 6px; margin: 6px 0;\
                          cursor: pointer; text-align: center; border: 1px solid #fde68a; \}\
  .reload-notice:hover  \{ background: #fef08a; \}\
  .reload-notice.hidden \{ display: none; \}\
\
*/}