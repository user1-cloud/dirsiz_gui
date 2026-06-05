import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { initI18n, t, toggleLang, getLang } from "./i18n.js";

// ═══════════════════════════════════════════════════════════════════
// OUTRUN PERSPECTIVE GRID
// ═══════════════════════════════════════════════════════════════════

function initOutrunGrid() {
  const canvas = document.getElementById("outrunGrid");
  const ctx = canvas.getContext("2d");

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  let frame = 0;
  function draw() {
    frame++;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const horizonY = h * 0.58;
    const vanishX = w / 2;

    const hGrad = ctx.createLinearGradient(0, horizonY, 0, horizonY + 120);
    hGrad.addColorStop(0, 'rgba(0,229,255,0.08)');
    hGrad.addColorStop(0.5, 'rgba(255,45,120,0.05)');
    hGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = hGrad;
    ctx.fillRect(0, horizonY, w, 120);

    ctx.strokeStyle = 'rgba(0,229,255,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(w, horizonY);
    ctx.stroke();

    const numLines = 30;
    for (let i = -numLines; i <= numLines; i++) {
      const groundX = vanishX + i * 60;
      if (groundX < -200 || groundX > w + 200) continue;
      const topX = vanishX + (groundX - vanishX) * 0.18;
      const topY = horizonY;
      const bottomY = h + 40;
      const alpha = 0.04 + 0.02 * (1 - Math.abs(i) / numLines);
      ctx.strokeStyle = `rgba(0,229,255,${alpha})`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(topX, topY + 2);
      ctx.lineTo(groundX, bottomY);
      ctx.stroke();
    }

    const numHoriz = 18;
    for (let j = 0; j < numHoriz; j++) {
      const t = (j + 1) / numHoriz;
      const y = horizonY + Math.pow(t, 1.8) * (h - horizonY + 60);
      const alpha = 0.03 + 0.015 * (1 - t);
      ctx.strokeStyle = `rgba(255,45,120,${alpha})`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      const spread = Math.pow(t, 1.4) * w * 0.9;
      ctx.moveTo(vanishX - spread, y);
      ctx.lineTo(vanishX + spread, y);
      ctx.stroke();
    }

    const pulse = Math.sin(frame * 0.015) * 0.5 + 0.5;
    const glowAlpha = 0.04 + pulse * 0.04;
    const glow = ctx.createRadialGradient(vanishX, horizonY, 0, vanishX, horizonY, w * 0.6);
    glow.addColorStop(0, `rgba(0,229,255,${glowAlpha})`);
    glow.addColorStop(0.5, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    requestAnimationFrame(draw);
  }

  resize();
  draw();
  window.addEventListener("resize", resize);
}

// ═══════════════════════════════════════════════════════════════════
// DOM REFS
// ═══════════════════════════════════════════════════════════════════

const pathInput      = document.getElementById("pathInput");
const scanBtn        = document.getElementById("scanBtn");
const showHidden     = document.getElementById("showHidden");
const collapseAllBtn = document.getElementById("collapseAll");
const statsBar       = document.getElementById("statsBar");
const statSize       = document.getElementById("statSize");
const statFiles      = document.getElementById("statFiles");
const statDirs       = document.getElementById("statDirs");
const statTime       = document.getElementById("statTime");
const loadingInd     = document.getElementById("loadingIndicator");
const emptyState     = document.getElementById("emptyState");
const treeContent    = document.getElementById("treeContent");
const footerText     = document.getElementById("footerText");
const footerBlink    = document.querySelector(".footer-blink");
const footerProgress = document.getElementById("footerProgress");
const langToggle     = document.getElementById("langToggle");
const fontToggle     = document.getElementById("fontToggle");

// ═══════════════════════════════════════════════════════════════════
// PROGRESS EVENTS FROM BACKEND
// ═══════════════════════════════════════════════════════════════════

let unlistenProgress = null;

async function setupProgressListener() {
  let pending = null;
  let rafId = null;
  unlistenProgress = await listen("scan-progress", (event) => {
    pending = event.payload;
    if (!rafId) {
      rafId = requestAnimationFrame(() => {
        if (pending) {
          const p = pending;
          footerProgress.textContent = `${p.files.toLocaleString()} files  |  ${p.bytesHuman}`;
          pending = null;
        }
        rafId = null;
      });
    }
  });
}

function clearProgress() { footerProgress.textContent = ""; }

// ── Phase events ──────────────────────────────────────────────────

let appState = "idle"; // idle | scanning | building | done | error

async function setupPhaseListener() {
  await listen("scan-phase", (event) => {
    if (event.payload === "building") {
      setAppState("building");
    }
  });
}

function setAppState(state) {
  appState = state;
  // Update footer text
  const labels = {
    idle:     "footerReady",
    scanning: "footerScanning",
    building: "footerBuilding",
    done:     "footerAnalyzed",
    error:    "footerError",
  };
  footerText.textContent = t(labels[state] || "footerReady");
  // Update blink indicator
  footerBlink.className = `footer-blink blink-${state}`;
  if (state === "done" || state === "error") {
    clearProgress();
  }
}

setupProgressListener();
setupPhaseListener();

// ═══════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════

let currentData        = null;
let domNodes           = new Map();   // path -> { wrapper, childrenContainer, hasChildren, depth }
let totalRenderedNodes = 0;
let loadingPaths       = new Set();   // paths currently being loaded from backend

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function showLoading() {
  loadingInd.classList.remove("hidden");
  emptyState.style.display = "none";
  treeContent.innerHTML = "";
  statsBar.classList.add("hidden");
  clearProgress();
  setAppState("scanning");
}

function hideLoading() {
  loadingInd.classList.add("hidden");
}

function showToast(msg, dur = 4000) {
  const old = document.querySelector(".toast-outer");
  if (old) old.remove();
  const outer = document.createElement("div");
  outer.className = "toast-outer";
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  outer.appendChild(t);
  document.body.appendChild(outer);
  setTimeout(() => {
    outer.classList.add("out");
    outer.addEventListener("animationend", () => outer.remove());
  }, dur);
}

// ═══════════════════════════════════════════════════════════════════
// SIZE COLOR — Synthwave gradient
// ═══════════════════════════════════════════════════════════════════

function sizeColor(ratio) {
  if (ratio < 0.03) return { color: '#3a4470', glow: 'none' };
  if (ratio < 0.08) return { color: '#00ccbb', glow: '0 0 4px #00ccbb33' };
  if (ratio < 0.20) return { color: '#00e5ff', glow: '0 0 5px #00e5ff44' };
  if (ratio < 0.40) return { color: '#ffb627', glow: '0 0 6px #ffb62744' };
  if (ratio < 0.65) return { color: '#ff6b3d', glow: '0 0 8px #ff6b3d55' };
  return { color: '#ff2d78', glow: '0 0 10px #ff2d7866' };
}

function applySizeColor(el, entrySize, parentSize) {
  if (!parentSize || parentSize === 0) return;
  const r = entrySize / parentSize;
  const { color, glow } = sizeColor(r);
  el.style.color = color;
  el.style.textShadow = glow;
}

// ═══════════════════════════════════════════════════════════════════
// TREE RENDERING
// ═══════════════════════════════════════════════════════════════════

function makeToggle(hasKids, open) {
  const s = document.createElement("span");
  s.className = "node-toggle";
  if (hasKids) {
    s.classList.add("has-children");
    s.textContent = "▶";
    if (open) s.classList.add("expanded");
  }
  return s;
}

function makeIcon(isDir) {
  const s = document.createElement("span");
  s.className = "node-icon " + (isDir ? "dir" : "file");
  s.textContent = isDir ? "◈" : "○";
  return s;
}

function renderNodeRow(entry, depth, isDir, hasKids, parentSize) {
  const row = document.createElement("div");
  row.className = "node-row";
  if (isDir) row.classList.add("dir-row");
  row.style.paddingLeft = `${depth * 22 + 8}px`;

  const toggle = makeToggle(hasKids && isDir, false);
  row.appendChild(toggle);

  const icon = makeIcon(isDir);
  row.appendChild(icon);

  const name = document.createElement("span");
  name.className = "node-name";
  name.textContent = entry.name + (isDir ? "/" : "");
  name.title = entry.path;
  applySizeColor(name, entry.size, parentSize);
  row.appendChild(name);

  const sz = document.createElement("span");
  sz.className = "node-size";
  sz.textContent = entry.sizeHuman;
  applySizeColor(sz, entry.size, parentSize);
  row.appendChild(sz);

  const bar = document.createElement("div");
  bar.className = "node-size-bar-bg";
  row.appendChild(bar);

  return { row, toggle, bar };
}

function renderTree(container, children, depth = 0, parentSize = null, stagger = 0) {
  const CHUNK = 40;
  const useStagger = children.length <= 200;
  let idx = 0;

  function processChunk() {
    const frag = document.createDocumentFragment();
    const end = Math.min(idx + CHUNK, children.length);

    for (let i = idx; i < end; i++) {
      const entry = children[i];
      const isDir = entry.isDir;
      const hasKids = entry.childCount > 0;

      const wrap = document.createElement("div");
      wrap.className = "tree-node";
      if (useStagger) wrap.style.animationDelay = `${stagger + i * 0.01}s`;
      wrap.dataset.path = entry.path;

      const { row, toggle, bar } = renderNodeRow(entry, depth, isDir, hasKids, parentSize);

      if (parentSize && parentSize > 0) {
        bar.style.width = `${Math.max((entry.size / parentSize) * 100, 0.2)}%`;
      }

      let kidContainer = null;

      if (isDir && hasKids) {
        kidContainer = document.createElement("div");
        kidContainer.className = "node-children";

        row.addEventListener("click", async (e) => {
          e.stopPropagation();

          if (kidContainer.classList.contains("expanded")) {
            // Collapse: cancel loading if in progress
            if (loadingPaths.has(entry.path)) {
              invoke("cancel_scan");
            }
            kidContainer.classList.remove("expanded");
            toggle.classList.remove("expanded");
            return;
          }

          if (kidContainer.children.length === 0 && !loadingPaths.has(entry.path)) {
            toggle.classList.add("expanded");
            kidContainer.classList.add("expanded");

            const miniLoad = document.createElement("div");
            miniLoad.className = "node-loading";
            miniLoad.textContent = t("loading");
            miniLoad.style.paddingLeft = `${(depth + 1) * 18 + 6}px`;
            kidContainer.appendChild(miniLoad);

            loadingPaths.add(entry.path);
            setAppState("scanning");
            try {
              await invoke("cancel_scan");
              const kids = await invoke("expand_directory", {
                path: entry.path,
                showHidden: showHidden.checked,
              });
              kidContainer.innerHTML = "";
              if (kids.length > 0) {
                renderTree(kidContainer, kids, depth + 1, entry.size);
              }
              setAppState("done");
            } catch (err) {
              kidContainer.innerHTML = "";
              if (String(err) !== "CANCELLED") {
                showToast(String(err));
              }
              kidContainer.classList.remove("expanded");
              toggle.classList.remove("expanded");
              setAppState("done");
            } finally {
              loadingPaths.delete(entry.path);
            }
          } else if (!kidContainer.classList.contains("expanded")) {
            kidContainer.classList.add("expanded");
            toggle.classList.add("expanded");
          }
        });

        wrap.appendChild(row);
        wrap.appendChild(kidContainer);
      } else {
        wrap.appendChild(row);
      }

      domNodes.set(entry.path, {
        wrapper: wrap,
        childrenContainer: kidContainer,
        hasChildren: isDir && hasKids,
        depth,
      });

      row.addEventListener("mouseenter", () => showTooltip(entry.path, row));
      row.addEventListener("mouseleave", hideTooltip);

      frag.appendChild(wrap);
      totalRenderedNodes++;
    }

    container.appendChild(frag);
    idx = end;

    if (idx < children.length) {
      requestAnimationFrame(processChunk);
    }
  }

  if (children.length > 0) {
    processChunk();
  }
}

// ═══════════════════════════════════════════════════════════════════
// INLINE TOOLTIP
// ═══════════════════════════════════════════════════════════════════

let activeTooltip = null;

function showTooltip(text, row) {
  hideTooltip();
  const tip = document.createElement("div");
  tip.className = "node-tooltip-inline";
  tip.textContent = text;
  row.insertAdjacentElement("afterend", tip);
  activeTooltip = { tip };
}

function hideTooltip() {
  if (activeTooltip) {
    activeTooltip.tip.remove();
    activeTooltip = null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// COLLAPSE ALL
// ═══════════════════════════════════════════════════════════════════

function collapseAll() {
  for (const [, node] of domNodes) {
    if (node.childrenContainer) {
      node.childrenContainer.classList.remove("expanded");
      const tgl = node.wrapper.querySelector(".node-toggle");
      if (tgl) tgl.classList.remove("expanded");
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// PATH HISTORY DROPDOWN
// ═══════════════════════════════════════════════════════════════════

const HIST_KEY = "dirsiz-history";
const MAX_HIST = 10;

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HIST_KEY)) || []; }
  catch { return []; }
}

function saveHistory(h) {
  localStorage.setItem(HIST_KEY, JSON.stringify(h));
}

function addHistory(path) {
  let hist = loadHistory();
  hist = hist.filter(p => p !== path);
  hist.unshift(path);
  if (hist.length > MAX_HIST) hist.length = MAX_HIST;
  saveHistory(hist);
}

function removeHistory(path) {
  let hist = loadHistory();
  hist = hist.filter(p => p !== path);
  saveHistory(hist);
}

const histDrop = document.createElement("div");
histDrop.className = "hist-dropdown hidden";
document.querySelector(".path-input-anchor").appendChild(histDrop);

let histSelected = -1;

function showHistory(filter) {
  const hist = loadHistory();
  const items = filter
    ? hist.filter(p => p.toLowerCase().includes(filter.toLowerCase()))
    : hist;
  if (items.length === 0) { histDrop.classList.add("hidden"); return; }
  histSelected = -1;
  histDrop.innerHTML = items.map((p, i) =>
    `<div class="hist-item" data-idx="${i}" data-path="${escapeHtml(p)}">
       <span class="hist-path">${escapeHtml(p)}</span>
       <button class="hist-del" data-idx="${i}" title="Remove">&times;</button>
     </div>`
  ).join("");
  histDrop.classList.remove("hidden");
  // Click on item (not delete button)
  histDrop.querySelectorAll(".hist-item").forEach(el => {
    el.addEventListener("mousedown", e => {
      e.preventDefault();
      const path = el.dataset.path;
      pathInput.value = path;
      histDrop.classList.add("hidden");
      doScan();
    });
  });
  // Click on delete button
  histDrop.querySelectorAll(".hist-del").forEach(btn => {
    btn.addEventListener("mousedown", e => {
      e.preventDefault();
      e.stopPropagation();
      removeHistory(btn.parentElement.dataset.path);
      showHistory(filter);
    });
  });
}

function hideHistory() {
  histDrop.classList.add("hidden");
  histSelected = -1;
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

pathInput.addEventListener("focus", () => {
  if (!histDrop.classList.contains("hidden")) return;
  showHistory(null);
});
pathInput.addEventListener("input", () => {
  showHistory(pathInput.value.trim());
});
pathInput.addEventListener("keydown", e => {
  if (e.key === "Escape") { hideHistory(); return; }
  const items = histDrop.querySelectorAll(".hist-item");
  if (items.length === 0) return;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    histSelected = Math.min(histSelected + 1, items.length - 1);
    items.forEach((el, i) => el.classList.toggle("active", i === histSelected));
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    histSelected = Math.max(histSelected - 1, 0);
    items.forEach((el, i) => el.classList.toggle("active", i === histSelected));
  } else if (e.key === "Enter" && histSelected >= 0) {
    e.preventDefault();
    pathInput.value = items[histSelected].dataset.path;
    hideHistory();
    doScan();
  }
});
document.addEventListener("mousedown", e => {
  if (!histDrop.contains(e.target) && e.target !== pathInput) {
    hideHistory();
  }
});

// ═══════════════════════════════════════════════════════════════════
// SCAN
// ═══════════════════════════════════════════════════════════════════

async function doScan() {
  let p = pathInput.value.trim();
  if (!p) { p = "."; pathInput.value = "."; }

  hideHistory();
  showLoading();

  try {
    await invoke("cancel_scan");
    const result = await invoke("scan_directory", { path: p, showHidden: showHidden.checked });

    currentData = result;
    domNodes.clear();
    totalRenderedNodes = 0;
    loadingPaths.clear();

    statSize.textContent  = result.totalSizeHuman;
    statFiles.textContent = result.fileCount.toLocaleString();
    statDirs.textContent  = result.dirCount.toLocaleString();
    statTime.textContent  = `${(result.elapsedMs / 1000).toFixed(2)}s`;
    statsBar.classList.remove("hidden");

    emptyState.style.display = "none";
    treeContent.innerHTML = "";

    // Root header
    const rootWrap = document.createElement("div");
    rootWrap.className = "tree-root";

    const rootHdr = document.createElement("div");
    rootHdr.className = "tree-root-header";

    const rootIco = document.createElement("span");
    rootIco.className = "node-icon dir";
    rootIco.textContent = "◉";
    rootHdr.appendChild(rootIco);

    const rootNm = document.createElement("span");
    rootNm.className = "tree-root-name";
    rootNm.textContent = result.rootName + "/";
    rootNm.title = result.rootPath;
    rootHdr.appendChild(rootNm);

    const rootSz = document.createElement("span");
    rootSz.className = "tree-root-size";
    rootSz.textContent = result.totalSizeHuman;
    rootHdr.appendChild(rootSz);

    rootWrap.appendChild(rootHdr);

    const rootKids = document.createElement("div");
    rootKids.className = "node-children expanded";
    rootWrap.appendChild(rootKids);

    treeContent.appendChild(rootWrap);

    if (result.children.length > 0) {
      renderTree(rootKids, result.children, 0, result.totalSize);
    }

    addHistory(result.rootPath);
    hideLoading();
    setAppState("done");
  } catch (err) {
    hideLoading();
    if (String(err) === "CANCELLED") return;
    emptyState.style.display = "flex";
    treeContent.innerHTML = "";
    domNodes.clear();
    totalRenderedNodes = 0;
    loadingPaths.clear();
    setAppState("error");
    showToast(String(err));
  }

  pathInput.focus();
}

// ═══════════════════════════════════════════════════════════════════
// EVENTS
// ═══════════════════════════════════════════════════════════════════

scanBtn.addEventListener("click", doScan);
pathInput.addEventListener("keydown", e => { if (e.key === "Enter") doScan(); });
collapseAllBtn.addEventListener("click", collapseAll);
langToggle.addEventListener("click", () => {
  toggleLang();
  // refresh footer text with current state after language switch
  setAppState(currentData ? "done" : "idle");
  langToggle.textContent = getLang() === "zh" ? "EN / 中" : "中 / EN";
});
pathInput.focus();

// ═══════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════

initI18n();
langToggle.textContent = getLang() === "zh" ? "EN / 中" : "中 / EN";

// Font toggle
const FONT_KEY = "dirsiz-font";
if (localStorage.getItem(FONT_KEY) === "system") {
  document.documentElement.classList.add("font-system");
  fontToggle.textContent = "pixel";
} else {
  fontToggle.textContent = "font";
}
fontToggle.addEventListener("click", () => {
  const el = document.documentElement;
  el.classList.toggle("font-system");
  if (el.classList.contains("font-system")) {
    localStorage.setItem(FONT_KEY, "system");
    fontToggle.textContent = "pixel";
  } else {
    localStorage.setItem(FONT_KEY, "pixel");
    fontToggle.textContent = "font";
  }
});

initOutrunGrid();

// Initial blink state
footerBlink.className = "footer-blink blink-idle";
