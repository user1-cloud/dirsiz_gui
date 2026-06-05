import { invoke } from "@tauri-apps/api/core";

// ── Starfield ────────────────────────────────────────────────────────

function initStarfield() {
  const canvas = document.getElementById("starfield");
  const ctx = canvas.getContext("2d");

  let stars = [];
  const STAR_COUNT = 160;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function createStars() {
    stars = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.2 + 0.3,
        speed: Math.random() * 0.3 + 0.05,
        opacity: Math.random() * 0.6 + 0.2,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  let frame = 0;
  function draw() {
    frame++;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const star of stars) {
      const twinkle = Math.sin(frame * 0.02 + star.phase) * 0.3 + 0.7;
      const alpha = star.opacity * twinkle;

      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(180,200,255,${alpha})`;
      ctx.fill();

      if (twinkle > 0.85 && star.r > 0.8) {
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,229,255,${alpha * 0.25})`;
        ctx.fill();
      }
    }

    requestAnimationFrame(draw);
  }

  resize();
  createStars();
  draw();

  window.addEventListener("resize", () => {
    resize();
    createStars();
  });
}

// ── DOM refs ─────────────────────────────────────────────────────────

const pathInput = document.getElementById("pathInput");
const scanBtn = document.getElementById("scanBtn");
const showHidden = document.getElementById("showHidden");
const collapseAllBtn = document.getElementById("collapseAll");
const expandAllBtn = document.getElementById("expandAll");
const statsBar = document.getElementById("statsBar");
const statSize = document.getElementById("statSize");
const statFiles = document.getElementById("statFiles");
const statDirs = document.getElementById("statDirs");
const statTime = document.getElementById("statTime");
const treeContainer = document.getElementById("treeContainer");
const loadingIndicator = document.getElementById("loadingIndicator");
const emptyState = document.getElementById("emptyState");
const treeContent = document.getElementById("treeContent");

// ── State ────────────────────────────────────────────────────────────

let currentData = null;
let entryMap = new Map();        // path -> DirEntry
let domNodes = new Map();        // path -> { wrapper, childrenContainer, hasChildren, depth }
let totalRenderedNodes = 0;
const MAX_EXPAND_NODES = 3000;  // hard cap for expandAll

// ── Helpers ──────────────────────────────────────────────────────────

function showLoading() {
  loadingIndicator.classList.remove("hidden");
  emptyState.style.display = "none";
  treeContent.innerHTML = "";
  statsBar.classList.add("hidden");
}

function hideLoading() {
  loadingIndicator.classList.add("hidden");
}

function showToast(msg, duration = 4000) {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = msg;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("out");
    toast.addEventListener("animationend", () => toast.remove());
  }, duration);
}

// ── Entry map builder ────────────────────────────────────────────────

function buildEntryMap(children) {
  for (const entry of children) {
    entryMap.set(entry.path, entry);
    if (entry.children.length > 0) {
      buildEntryMap(entry.children);
    }
  }
}

// ── Tree Rendering ───────────────────────────────────────────────────

function createToggleIcon(hasChildren, expanded) {
  const span = document.createElement("span");
  span.className = "node-toggle";
  if (hasChildren) {
    span.classList.add("has-children");
    span.textContent = "▶";
    if (expanded) span.classList.add("expanded");
  }
  return span;
}

function createIcon(isDir) {
  const span = document.createElement("span");
  span.className = "node-icon";
  span.classList.add(isDir ? "dir" : "file");
  span.textContent = isDir ? "◆" : "◇";
  return span;
}

function renderNodeRow(entry, depth, isDir, hasChildren) {
  const row = document.createElement("div");
  row.className = "node-row";
  if (isDir) row.classList.add("dir-row");
  row.style.paddingLeft = `${depth * 18 + 4}px`;

  const toggle = createToggleIcon(hasChildren && isDir, false);
  row.appendChild(toggle);

  const icon = createIcon(isDir);
  row.appendChild(icon);

  const name = document.createElement("span");
  name.className = "node-name";
  name.textContent = entry.name + (isDir ? "/" : "");
  name.title = entry.path;
  row.appendChild(name);

  const size = document.createElement("span");
  size.className = "node-size";
  size.textContent = entry.sizeHuman;
  row.appendChild(size);

  const bar = document.createElement("div");
  bar.className = "node-size-bar-bg";
  row.appendChild(bar);

  return { row, toggle, bar };
}

function renderTree(container, children, depth = 0, parentSize = null, stagger = 0) {
  const fragment = document.createDocumentFragment();
  const useStagger = children.length <= 200;

  for (let i = 0; i < children.length; i++) {
    const entry = children[i];
    const isDir = entry.isDir;
    const hasChildren = entry.children && entry.children.length > 0;

    const nodeWrapper = document.createElement("div");
    nodeWrapper.className = "tree-node";
    if (useStagger) {
      nodeWrapper.style.animationDelay = `${stagger + i * 0.012}s`;
    }
    nodeWrapper.dataset.path = entry.path;

    const { row, toggle, bar } = renderNodeRow(entry, depth, isDir, hasChildren);

    if (parentSize && parentSize > 0) {
      const ratio = entry.size / parentSize;
      bar.style.width = `${Math.max(ratio * 100, 0.2)}%`;
    }

    let childrenContainer = null;

    if (isDir && hasChildren) {
      childrenContainer = document.createElement("div");
      childrenContainer.className = "node-children";

      row.addEventListener("click", (e) => {
        e.stopPropagation();
        const isExpanded = childrenContainer.classList.contains("expanded");

        if (isExpanded) {
          childrenContainer.classList.remove("expanded");
          toggle.classList.remove("expanded");
        } else {
          if (childrenContainer.children.length === 0) {
            const data = entryMap.get(entry.path);
            if (data) {
              renderTree(childrenContainer, data.children, depth + 1, entry.size);
            }
          }
          childrenContainer.classList.add("expanded");
          toggle.classList.add("expanded");
        }
      });

      nodeWrapper.appendChild(row);
      nodeWrapper.appendChild(childrenContainer);
    } else {
      nodeWrapper.appendChild(row);
    }

    domNodes.set(entry.path, {
      wrapper: nodeWrapper,
      childrenContainer,
      hasChildren: isDir && hasChildren,
      depth,
    });

    row.addEventListener("mouseenter", () => showTooltip(entry.path, row));
    row.addEventListener("mouseleave", hideTooltip);

    fragment.appendChild(nodeWrapper);
    totalRenderedNodes++;
  }

  container.appendChild(fragment);
}

// ── Inline tooltip ───────────────────────────────────────────────────
// Inserted as a sibling after the hovered node-wrapper, so it pushes
// rows below down instead of floating over them.

let activeTooltip = null;

function showTooltip(text, row) {
  hideTooltip();

  const wrapper = row.closest(".tree-node") || row.parentElement;

  const tip = document.createElement("div");
  tip.className = "node-tooltip-inline";
  tip.textContent = text;

  wrapper.insertAdjacentElement("afterend", tip);
  activeTooltip = { tip, wrapper, row };
}

function hideTooltip() {
  if (activeTooltip) {
    activeTooltip.tip.remove();
    activeTooltip = null;
  }
}

// ── Expand / Collapse All ────────────────────────────────────────────

async function expandAll() {
  if (!currentData) return;

  const startTotal = totalRenderedNodes;
  let batchChanged = true;
  let safety = 0;

  // Expand level by level, using rAF to keep UI alive between levels
  while (batchChanged && safety < 60) {
    batchChanged = false;
    safety++;

    const pending = [];

    for (const [path, node] of domNodes) {
      if (totalRenderedNodes - startTotal >= MAX_EXPAND_NODES) break;
      if (!node.hasChildren || !node.childrenContainer) continue;
      if (node.childrenContainer.classList.contains("expanded")) continue;

      const entry = entryMap.get(path);
      if (!entry) continue;

      pending.push({ node, entry });
    }

    if (pending.length === 0) break;

    // Render in small chunks with rAF to avoid blocking
    const CHUNK = 30;
    for (let i = 0; i < pending.length; i += CHUNK) {
      if (totalRenderedNodes - startTotal >= MAX_EXPAND_NODES) break;

      const chunk = pending.slice(i, i + CHUNK);

      for (const { node, entry } of chunk) {
        if (totalRenderedNodes - startTotal >= MAX_EXPAND_NODES) break;

        if (node.childrenContainer.children.length === 0) {
          renderTree(node.childrenContainer, entry.children, node.depth + 1, entry.size);
        }
        node.childrenContainer.classList.add("expanded");
        const toggle = node.wrapper.querySelector(".node-toggle");
        if (toggle) toggle.classList.add("expanded");
        batchChanged = true;
      }

      // Yield to the browser to keep UI responsive
      await new Promise((r) => requestAnimationFrame(r));
    }
  }

  if (totalRenderedNodes - startTotal >= MAX_EXPAND_NODES) {
    showToast(
      `Expansion capped at ${MAX_EXPAND_NODES} nodes to keep UI responsive. Collapse and expand specific folders manually.`,
      5000
    );
  }
}

function collapseAll() {
  for (const [, node] of domNodes) {
    if (node.childrenContainer) {
      node.childrenContainer.classList.remove("expanded");
      const toggle = node.wrapper.querySelector(".node-toggle");
      if (toggle) toggle.classList.remove("expanded");
    }
  }
}

// ── Scan ─────────────────────────────────────────────────────────────

async function doScan() {
  let path = pathInput.value.trim();
  if (!path) {
    path = ".";
    pathInput.value = ".";
  }

  showLoading();

  try {
    const result = await invoke("scan_directory", {
      path: path,
      showHidden: showHidden.checked,
    });

    currentData = result;
    entryMap.clear();
    domNodes.clear();
    totalRenderedNodes = 0;
    buildEntryMap(result.children);

    statSize.textContent = result.totalSizeHuman;
    statFiles.textContent = result.fileCount.toLocaleString();
    statDirs.textContent = result.dirCount.toLocaleString();
    statTime.textContent = `${(result.elapsedMs / 1000).toFixed(2)}s`;
    statsBar.classList.remove("hidden");

    emptyState.style.display = "none";
    treeContent.innerHTML = "";

    // Root header
    const rootWrapper = document.createElement("div");
    rootWrapper.className = "tree-root";

    const rootHeader = document.createElement("div");
    rootHeader.className = "tree-root-header";

    const rootIcon = document.createElement("span");
    rootIcon.className = "node-icon dir";
    rootIcon.textContent = "◈";
    rootHeader.appendChild(rootIcon);

    const rootName = document.createElement("span");
    rootName.className = "tree-root-name";
    rootName.textContent = result.rootName + "/";
    rootName.title = result.rootPath;
    rootHeader.appendChild(rootName);

    const rootSize = document.createElement("span");
    rootSize.className = "tree-root-size";
    rootSize.textContent = result.totalSizeHuman;
    rootHeader.appendChild(rootSize);

    rootWrapper.appendChild(rootHeader);

    const rootChildren = document.createElement("div");
    rootChildren.className = "node-children expanded";
    rootWrapper.appendChild(rootChildren);

    treeContent.appendChild(rootWrapper);

    if (result.children.length > 0) {
      renderTree(rootChildren, result.children, 0, result.totalSize);
    }

    hideLoading();
  } catch (err) {
    hideLoading();
    emptyState.style.display = "flex";
    treeContent.innerHTML = "";
    entryMap.clear();
    domNodes.clear();
    totalRenderedNodes = 0;
    showToast(String(err));
  }

  // Keep input focused so the user can immediately type a new path
  pathInput.focus();
}

// ── Event Listeners ──────────────────────────────────────────────────

scanBtn.addEventListener("click", doScan);

pathInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") doScan();
});

collapseAllBtn.addEventListener("click", collapseAll);
expandAllBtn.addEventListener("click", expandAll);

pathInput.focus();

// ── Init ─────────────────────────────────────────────────────────────

initStarfield();
