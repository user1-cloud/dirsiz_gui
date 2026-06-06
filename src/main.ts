// ═══════════════════════════════════════════════════════════════════
// DirSiz — Entry point. Wires modules, binds events, initializes.
// ═══════════════════════════════════════════════════════════════════

import type { ScanResult } from "./types";
import { scanDirectory, cancelScan } from "./api";
import { initOutrunGrid } from "./grid";
import { createStateManager } from "./state";
import { showToast } from "./toast";
import { setupProgressListener, clearProgress } from "./progress";
import { initPathHistory } from "./history";
import { renderTree, collapseAll, clearDomNodes, resetLoadingPaths } from "./tree-renderer";
import { initI18n, toggleLang, getLang } from "./i18n";

// ── DOM refs ──────────────────────────────────────────────────────

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const pathInput      = $<HTMLInputElement>("pathInput");
const scanBtn        = $<HTMLButtonElement>("scanBtn");
const showHidden     = $<HTMLInputElement>("showHidden");
const forceWalkdir   = $<HTMLInputElement>("forceWalkdir");
const collapseAllBtn = $<HTMLButtonElement>("collapseAll");
const statsBar       = $<HTMLDivElement>("statsBar");
const statSize       = $("statSize");
const statFiles      = $("statFiles");
const statDirs       = $("statDirs");
const statTime       = $("statTime");
const loadingInd     = $("loadingIndicator");
const emptyState     = $<HTMLDivElement>("emptyState");
const treeContent    = $("treeContent");
const footerText     = $("footerText");
const footerBlink    = document.querySelector(".footer-blink") as HTMLElement;
const footerProgress = $("footerProgress");
const langToggle     = $<HTMLButtonElement>("langToggle");
const fontToggle     = $<HTMLButtonElement>("fontToggle");

// ── State ─────────────────────────────────────────────────────────

const stateMgr = createStateManager({
  footerText,
  footerBlink,
  onDone: () => clearProgress(footerProgress),
});

// ── History ───────────────────────────────────────────────────────

const anchorEl = document.querySelector(".path-input-anchor") as HTMLElement;
const pathHist = initPathHistory(pathInput, anchorEl, doScan);

// ── Scan ──────────────────────────────────────────────────────────

function showLoading(): void {
  loadingInd.classList.remove("hidden");
  emptyState.style.display = "none";
  treeContent.innerHTML = "";
  statsBar.classList.add("hidden");
  clearProgress(footerProgress);
  stateMgr.setState("scanning");
}

function hideLoading(): void {
  loadingInd.classList.add("hidden");
}

async function doScan(): Promise<void> {
  let p = pathInput.value.trim();
  if (!p) { p = "."; pathInput.value = "."; }

  showLoading();

  try {
    await cancelScan();
    const result: ScanResult = await scanDirectory(p, showHidden.checked, forceWalkdir.checked);

    domNodesClear();
    resetLoadingPaths();

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
      renderTree(rootKids, result.children, 0, result.totalSize, 0, showHidden, stateMgr.setState.bind(stateMgr), showToast);
    }

    pathHist.addPath(result.rootPath);
    hideLoading();
    stateMgr.setState("done");
  } catch (err) {
    hideLoading();
    if (String(err) === "CANCELLED") return;
    emptyState.style.display = "flex";
    treeContent.innerHTML = "";
    domNodesClear();
    resetLoadingPaths();
    stateMgr.setState("error");
    showToast(String(err));
  }

  pathInput.focus();
}

function domNodesClear(): void {
  clearDomNodes();
}

// ── Event bindings ────────────────────────────────────────────────

scanBtn.addEventListener("click", doScan);
pathInput.addEventListener("keydown", e => { if (e.key === "Enter") doScan(); });
collapseAllBtn.addEventListener("click", () => collapseAll());
langToggle.addEventListener("click", () => {
  toggleLang();
  stateMgr.setState(stateMgr.getState());
  langToggle.textContent = getLang() === "zh" ? "EN / 中" : "中 / EN";
});

// ── Init ──────────────────────────────────────────────────────────

initI18n();
langToggle.textContent = getLang() === "zh" ? "EN / 中" : "中 / EN";

// Font toggle (persisted to localStorage)
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
footerBlink.className = "footer-blink blink-idle";

// Start progress listener
setupProgressListener(footerProgress, stateMgr.setState.bind(stateMgr));
pathInput.focus();
