// ═══════════════════════════════════════════════════════════════════
// Tree rendering — chunked render, lazy-load children, collapse all
// ═══════════════════════════════════════════════════════════════════

import type { DirEntry, DomNodeInfo, AppState } from "./types";
import { expandDirectory, cancelScan } from "./api";
import { applySizeColor } from "./size-color";
import { showTooltip, hideTooltip } from "./tooltip";
import { t } from "./i18n";

// ── Internal module state ──────────────────────────────────────────

const domNodes = new Map<string, DomNodeInfo>();
const loadingPaths = new Set<string>();

export function getDomNodes(): Map<string, DomNodeInfo> {
  return domNodes;
}

export function clearDomNodes(): void {
  domNodes.clear();
}

export function resetLoadingPaths(): void {
  loadingPaths.clear();
}

// ── Node building helpers ──────────────────────────────────────────

function makeToggle(hasKids: boolean, open: boolean): HTMLSpanElement {
  const s = document.createElement("span");
  s.className = "node-toggle";
  if (hasKids) {
    s.classList.add("has-children");
    s.textContent = "▶";
    if (open) s.classList.add("expanded");
  }
  return s;
}

function makeIcon(isDir: boolean): HTMLSpanElement {
  const s = document.createElement("span");
  s.className = "node-icon " + (isDir ? "dir" : "file");
  s.textContent = isDir ? "◈" : "○";
  return s;
}

interface NodeRowResult {
  row: HTMLDivElement;
  toggle: HTMLSpanElement;
  bar: HTMLDivElement;
}

function renderNodeRow(
  entry: DirEntry, depth: number, isDir: boolean, hasKids: boolean, parentSize: number | null
): NodeRowResult {
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
  applySizeColor(name, entry.size, parentSize ?? 0);
  row.appendChild(name);

  const sz = document.createElement("span");
  sz.className = "node-size";
  sz.textContent = entry.sizeHuman;
  applySizeColor(sz, entry.size, parentSize ?? 0);
  row.appendChild(sz);

  const bar = document.createElement("div");
  bar.className = "node-size-bar-bg";
  row.appendChild(bar);

  return { row, toggle, bar };
}

// ── Render tree ────────────────────────────────────────────────────

export function renderTree(
  container: HTMLElement,
  children: DirEntry[],
  depth = 0,
  parentSize: number | null = null,
  stagger = 0,
  showHiddenCheckbox: HTMLInputElement,
  setAppState: (state: AppState) => void,
  showToastFn: (msg: string) => void
): void {
  const CHUNK = 40;
  const useStagger = children.length <= 200;
  let idx = 0;

  function processChunk(): void {
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

      let kidContainer: HTMLDivElement | null = null;

      if (isDir && hasKids) {
        kidContainer = document.createElement("div");
        kidContainer.className = "node-children";

        row.addEventListener("click", async (e) => {
          e.stopPropagation();

          if (kidContainer!.classList.contains("expanded")) {
            if (loadingPaths.has(entry.path)) {
              cancelScan();
            }
            kidContainer!.classList.remove("expanded");
            toggle.classList.remove("expanded");
            return;
          }

          if (kidContainer!.children.length === 0 && !loadingPaths.has(entry.path)) {
            toggle.classList.add("expanded");
            kidContainer!.classList.add("expanded");

            const miniLoad = document.createElement("div");
            miniLoad.className = "node-loading";
            miniLoad.textContent = t("loading");
            miniLoad.style.paddingLeft = `${(depth + 1) * 18 + 6}px`;
            kidContainer!.appendChild(miniLoad);

            loadingPaths.add(entry.path);
            setAppState("scanning");
            try {
              await cancelScan();
              const kids = await expandDirectory(entry.path, showHiddenCheckbox.checked);
              kidContainer!.innerHTML = "";
              if (kids.length > 0) {
                renderTree(kidContainer!, kids, depth + 1, entry.size, 0, showHiddenCheckbox, setAppState, showToastFn);
              }
              setAppState("done");
            } catch (err) {
              kidContainer!.innerHTML = "";
              if (String(err) !== "CANCELLED") {
                showToastFn(String(err));
              }
              kidContainer!.classList.remove("expanded");
              toggle.classList.remove("expanded");
              setAppState("done");
            } finally {
              loadingPaths.delete(entry.path);
            }
          } else if (!kidContainer!.classList.contains("expanded")) {
            kidContainer!.classList.add("expanded");
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

// ── Collapse all ───────────────────────────────────────────────────

export function collapseAll(): void {
  for (const [, node] of domNodes) {
    if (node.childrenContainer) {
      node.childrenContainer.classList.remove("expanded");
      const tgl = node.wrapper.querySelector(".node-toggle");
      if (tgl) tgl.classList.remove("expanded");
    }
  }
}
