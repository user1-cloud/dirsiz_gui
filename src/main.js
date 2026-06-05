import { invoke } from "@tauri-apps/api/core";

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

    // Horizon line glow
    const hGrad = ctx.createLinearGradient(0, horizonY, 0, horizonY + 120);
    hGrad.addColorStop(0, 'rgba(0,229,255,0.08)');
    hGrad.addColorStop(0.5, 'rgba(255,45,120,0.05)');
    hGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = hGrad;
    ctx.fillRect(0, horizonY, w, 120);

    // Horizon line
    ctx.strokeStyle = 'rgba(0,229,255,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(w, horizonY);
    ctx.stroke();

    // Vertical grid lines (perspective)
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

    // Horizontal grid lines (perspective)
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

    // Pulsing grid glow near horizon
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

const pathInput   = document.getElementById("pathInput");
const scanBtn     = document.getElementById("scanBtn");
const showHidden  = document.getElementById("showHidden");
const collapseAllBtn = document.getElementById("collapseAll");
const expandAllBtn   = document.getElementById("expandAll");
const statsBar    = document.getElementById("statsBar");
const statSize    = document.getElementById("statSize");
const statFiles   = document.getElementById("statFiles");
const statDirs    = document.getElementById("statDirs");
const statTime    = document.getElementById("statTime");
const treeCont    = document.getElementById("treeContainer");
const loadingInd  = document.getElementById("loadingIndicator");
const emptyState  = document.getElementById("emptyState");
const treeContent = document.getElementById("treeContent");
const footerText  = document.querySelector(".footer-text");

// ═══════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════

let currentData        = null;
let entryMap           = new Map();
let domNodes           = new Map();
let totalRenderedNodes = 0;
const MAX_EXPAND_NODES = 3000;

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function showLoading() {
  loadingInd.classList.remove("hidden");
  emptyState.style.display = "none";
  treeContent.innerHTML = "";
  statsBar.classList.add("hidden");
  footerText.textContent = "SCANNING";
}

function hideLoading() {
  loadingInd.classList.add("hidden");
  footerText.textContent = "READY";
}

function showToast(msg, dur = 4000) {
  const old = document.querySelector(".toast");
  if (old) old.remove();
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => {
    t.classList.add("out");
    t.addEventListener("animationend", () => t.remove());
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
// ENTRY MAP
// ═══════════════════════════════════════════════════════════════════

function buildEntryMap(children) {
  for (const e of children) {
    entryMap.set(e.path, e);
    if (e.children.length > 0) buildEntryMap(e.children);
  }
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
  row.style.paddingLeft = `${depth * 18 + 6}px`;

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
  const frag = document.createDocumentFragment();
  const useStagger = children.length <= 200;

  for (let i = 0; i < children.length; i++) {
    const entry = children[i];
    const isDir = entry.isDir;
    const hasKids = entry.children && entry.children.length > 0;

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

      row.addEventListener("click", (e) => {
        e.stopPropagation();
        if (kidContainer.classList.contains("expanded")) {
          kidContainer.classList.remove("expanded");
          toggle.classList.remove("expanded");
        } else {
          if (kidContainer.children.length === 0) {
            const data = entryMap.get(entry.path);
            if (data) renderTree(kidContainer, data.children, depth + 1, entry.size);
          }
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
}

// ═══════════════════════════════════════════════════════════════════
// INLINE TOOLTIP
// ═══════════════════════════════════════════════════════════════════

let activeTooltip = null;

function showTooltip(text, row) {
  hideTooltip();
  const wrapper = row.closest(".tree-node") || row.parentElement;
  const tip = document.createElement("div");
  tip.className = "node-tooltip-inline";
  tip.textContent = text;
  wrapper.insertAdjacentElement("afterend", tip);
  activeTooltip = { tip };
}

function hideTooltip() {
  if (activeTooltip) {
    activeTooltip.tip.remove();
    activeTooltip = null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// EXPAND / COLLAPSE ALL
// ═══════════════════════════════════════════════════════════════════

async function expandAll() {
  if (!currentData) return;
  const start = totalRenderedNodes;
  let changed = true;
  let safety = 0;

  while (changed && safety < 60) {
    changed = false;
    safety++;
    const pending = [];

    for (const [path, node] of domNodes) {
      if (totalRenderedNodes - start >= MAX_EXPAND_NODES) break;
      if (!node.hasChildren || !node.childrenContainer) continue;
      if (node.childrenContainer.classList.contains("expanded")) continue;
      const entry = entryMap.get(path);
      if (!entry) continue;
      pending.push({ node, entry });
    }

    if (pending.length === 0) break;

    const CHUNK = 30;
    for (let i = 0; i < pending.length; i += CHUNK) {
      if (totalRenderedNodes - start >= MAX_EXPAND_NODES) break;
      const chunk = pending.slice(i, i + CHUNK);
      for (const { node, entry } of chunk) {
        if (totalRenderedNodes - start >= MAX_EXPAND_NODES) break;
        if (node.childrenContainer.children.length === 0) {
          renderTree(node.childrenContainer, entry.children, node.depth + 1, entry.size);
        }
        node.childrenContainer.classList.add("expanded");
        const tgl = node.wrapper.querySelector(".node-toggle");
        if (tgl) tgl.classList.add("expanded");
        changed = true;
      }
      await new Promise(r => requestAnimationFrame(r));
    }
  }

  if (totalRenderedNodes - start >= MAX_EXPAND_NODES) {
    showToast(
      `Expansion capped at ${MAX_EXPAND_NODES} nodes. Manually expand specific folders for deeper inspection.`,
      5000
    );
  }
}

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
// SCAN
// ═══════════════════════════════════════════════════════════════════

async function doScan() {
  let p = pathInput.value.trim();
  if (!p) { p = "."; pathInput.value = "."; }

  showLoading();

  try {
    const result = await invoke("scan_directory", { path: p, showHidden: showHidden.checked });

    currentData = result;
    entryMap.clear();
    domNodes.clear();
    totalRenderedNodes = 0;
    buildEntryMap(result.children);

    statSize.textContent  = result.totalSizeHuman;
    statFiles.textContent = result.fileCount.toLocaleString();
    statDirs.textContent  = result.dirCount.toLocaleString();
    statTime.textContent  = `${(result.elapsedMs / 1000).toFixed(2)}s`;
    statsBar.classList.remove("hidden");
    footerText.textContent = "ANALYZED";

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

    hideLoading();
  } catch (err) {
    hideLoading();
    emptyState.style.display = "flex";
    treeContent.innerHTML = "";
    entryMap.clear();
    domNodes.clear();
    totalRenderedNodes = 0;
    footerText.textContent = "ERROR";
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
expandAllBtn.addEventListener("click", expandAll);
pathInput.focus();

// ═══════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════

initOutrunGrid();
