// ═══════════════════════════════════════════════════════════════════
// Path history dropdown with localStorage persistence
// ═══════════════════════════════════════════════════════════════════

const HIST_KEY = "dirsiz-history";
const MAX_HIST = 10;

function loadHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(HIST_KEY) || "[]"); }
  catch { return []; }
}

function saveHistory(h: string[]): void {
  localStorage.setItem(HIST_KEY, JSON.stringify(h));
}

function escapeHtml(s: string): string {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

export interface PathHistory {
  addPath(path: string): void;
  destroy(): void;
}

export function initPathHistory(
  inputEl: HTMLInputElement,
  anchorEl: HTMLElement,
  onSelect: () => void
): PathHistory {
  const histDrop = document.createElement("div");
  histDrop.className = "hist-dropdown hidden";
  anchorEl.appendChild(histDrop);

  let histSelected = -1;

  function addPath(path: string): void {
    let hist = loadHistory();
    hist = hist.filter(p => p !== path);
    hist.unshift(path);
    if (hist.length > MAX_HIST) hist.length = MAX_HIST;
    saveHistory(hist);
  }

  function removeHistory(path: string): void {
    let hist = loadHistory();
    hist = hist.filter(p => p !== path);
    saveHistory(hist);
  }

  function showHistory(filter: string | null): void {
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

    histDrop.querySelectorAll(".hist-item").forEach(el => {
      el.addEventListener("mousedown", e => {
        e.preventDefault();
        const path = (el as HTMLElement).dataset.path!;
        inputEl.value = path;
        histDrop.classList.add("hidden");
        onSelect();
      });
    });

    histDrop.querySelectorAll(".hist-del").forEach(btn => {
      btn.addEventListener("mousedown", e => {
        e.preventDefault();
        e.stopPropagation();
        const parent = (btn as HTMLElement).parentElement!;
        removeHistory(parent.dataset.path!);
        showHistory(filter);
      });
    });
  }

  function hideHistory(): void {
    histDrop.classList.add("hidden");
    histSelected = -1;
  }

  inputEl.addEventListener("focus", () => {
    if (!histDrop.classList.contains("hidden")) return;
    showHistory(null);
  });

  inputEl.addEventListener("input", () => {
    showHistory(inputEl.value.trim());
  });

  inputEl.addEventListener("keydown", e => {
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
      inputEl.value = (items[histSelected] as HTMLElement).dataset.path!;
      hideHistory();
      onSelect();
    }
  });

  document.addEventListener("mousedown", e => {
    if (!histDrop.contains(e.target as Node) && e.target !== inputEl) {
      hideHistory();
    }
  });

  return { addPath, destroy: hideHistory };
}
