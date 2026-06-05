async function renderBlockLog() {
  if (currentTabId == null) return;
  const stats = await sendBg({ type: "getTabStats", tabId: currentTabId });
  const count = stats?.count ?? 0;
  const log   = stats?.log   ?? [];

  blockBigEl.textContent = count;

  if (navBlockBadgeEl) {
    navBlockBadgeEl.textContent = count > 99 ? "99+" : String(count);
    navBlockBadgeEl.classList.toggle("show", count > 0);
  }

  if (count === 0) {
    blockSubEl.textContent = "none yet";
    blockLogEl.textContent = "";
    activityEl.classList.add("hidden");
    return;
  }

  activityEl.classList.remove("hidden");
  blockSubEl.textContent = `request${count === 1 ? "" : "s"} blocked`;
  blockLogEl.textContent = "";

  for (const entry of log.slice(0, 15)) {
    const li = document.createElement("li");
    li.className = "log-entry";

    const timeEl = document.createElement("span");
    timeEl.className = "t";
    timeEl.textContent = new Date(entry.at).toLocaleTimeString();

    const urlEl = document.createElement("span");
    urlEl.className = "log-url";
    urlEl.textContent = entry.url;
    urlEl.title = entry.url;

    const allowBtn = document.createElement("button");
    allowBtn.className = "log-allow-btn";
    allowBtn.textContent = "Allow";
    allowBtn.title = "Add exception so this URL is no longer blocked";
    allowBtn.addEventListener("click", async () => {
      allowBtn.disabled = true;
      allowBtn.textContent = "...";
      const res = await sendBg({ type: "addException", url: entry.url });
      if (res?.ok) {
        allowBtn.textContent = "✓ Allowed";
        li.classList.add("excepted");
        showReloadNotice();
      } else {
        allowBtn.textContent = "Error";
        allowBtn.disabled = false;
      }
    });

    li.append(timeEl, urlEl, allowBtn);
    blockLogEl.appendChild(li);
  }
}

async function renderDiscover() {
  if (currentTabId == null || !discoverListEl) return;
  await syncObservedQueue();

  const { items = [] } = await sendBg({ type: "getDiscovered", tabId: currentTabId });
  discoverListEl.textContent = "";
  setDiscoverPing(items.length);

  if (!items.length) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="empty-note">Nothing captured yet — reload or interact with the page.</span>`;
    discoverListEl.appendChild(li);
    return;
  }

  items.sort((a, b) => {
    if (a.blocked !== b.blocked) return a.blocked ? -1 : 1;
    return (b.hits ?? 0) - (a.hits ?? 0);
  });

  for (const item of items) {
    if (!item?.url) continue;

    const li = document.createElement("li");
    li.className = [
      "disc-entry",
      item.blocked    ? "is-blocked"  : "",
      item.isExcepted ? "is-excepted" : "",
    ].filter(Boolean).join(" ");

    const badge = document.createElement("span");
    badge.className = "disc-decision " + (item.blocked ? "dec-block" : item.isExcepted ? "dec-except" : "dec-allow");
    badge.textContent = item.blocked ? "BLOCKED" : item.isExcepted ? "EXCEPTED" : "ALLOWED";

    const urlLine = document.createElement("div");
    urlLine.className = "disc-url";
    urlLine.textContent = item.url.slice(0, 120);
    urlLine.title = item.url;

    if (item.matchedPatterns?.length) {
      const tagRow = document.createElement("div");
      tagRow.className = "disc-tags";
      for (const p of item.matchedPatterns) {
        const tag = document.createElement("span");
        tag.className = "event-tag disc-blocked-tag";
        tag.textContent = p;
        tagRow.appendChild(tag);
      }
      urlLine.appendChild(tagRow);
    }

    const meta = document.createElement("div");
    meta.className = "disc-meta";
    const reasonStr = item.reason ? ` · matched: ${item.reason}` : "";
    const timeStr = item.lastSeen ? ` · ${new Date(item.lastSeen).toLocaleTimeString()}` : "";
    meta.textContent = `${item.hits ?? 1}× via ${item.via || "?"}${reasonStr}${timeStr}`;

    const body = document.createElement("div");
    body.className = "disc-body";
    body.append(urlLine, meta);

    if (item.blocked && !item.isExcepted) {
      const allowBtn = document.createElement("button");
      allowBtn.className = "disc-action-btn disc-allow-btn";
      allowBtn.textContent = "Allow this URL";
      allowBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        allowBtn.disabled = true;
        allowBtn.textContent = "...";
        const res = await sendBg({ type: "addException", url: item.url });
        if (res?.ok) {
          allowBtn.textContent = "✓ Allowed (reload to apply)";
          li.classList.remove("is-blocked");
          li.classList.add("is-excepted");
          badge.className = "disc-decision dec-except";
          badge.textContent = "EXCEPTED";
          showReloadNotice();
        } else {
          allowBtn.textContent = "Error";
          allowBtn.disabled = false;
        }
      });
      body.appendChild(allowBtn);

    } else if (item.isExcepted) {
      const reblockBtn = document.createElement("button");
      reblockBtn.className = "disc-action-btn disc-reblock-btn";
      reblockBtn.textContent = "Re-block";
      reblockBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        reblockBtn.disabled = true;
        reblockBtn.textContent = "...";
        let pattern = item.url;
        try { const u = new URL(item.url); pattern = u.origin + u.pathname; } catch {}
        const res = await sendBg({ type: "removeException", pattern });
        if (res?.ok) {
          reblockBtn.textContent = "✓ Re-blocked (reload to apply)";
          showReloadNotice();
        } else {
          reblockBtn.textContent = "Error";
          reblockBtn.disabled = false;
        }
      });
      body.appendChild(reblockBtn);
    }

    const row = document.createElement("div");
    row.className = "disc-row";
    row.append(badge, body);
    li.appendChild(row);
    discoverListEl.appendChild(li);
  }
}

async function renderExceptions() {
  const listEl = document.getElementById("exceptions-list");
  if (!listEl) return;

  const { exceptions = [] } = await sendBg({ type: "getExceptions" });
  listEl.textContent = "";

  if (!exceptions.length) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="empty-note">No exceptions yet. Use "Allow" on a blocked request to add one.</span>`;
    listEl.appendChild(li);
    return;
  }

  for (const pattern of exceptions) {
    const li = document.createElement("li");

    const span = document.createElement("span");
    span.className = "s-domain";
    span.textContent = pattern;
    span.title = pattern;

    const btn = document.createElement("button");
    btn.className = "rm-btn";
    btn.textContent = "×";
    btn.title = "Remove exception (re-block)";
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      await sendBg({ type: "removeException", pattern });
      await renderExceptions();
      showReloadNotice();
    });

    li.append(span, btn);
    listEl.appendChild(li);
  }
}

let _reloadNoticePending = false;
function showReloadNotice() {
  if (_reloadNoticePending) return;
  _reloadNoticePending = true;
  const el = document.getElementById("reload-notice");
  if (!el) return;
  el.classList.remove("hidden");
  el.addEventListener("click", () => {
    if (currentTabId != null) chrome.tabs.reload(currentTabId);
    el.classList.add("hidden");
    _reloadNoticePending = false;
  }, { once: true });
}
