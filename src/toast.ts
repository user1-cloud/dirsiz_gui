// ═══════════════════════════════════════════════════════════════════
// Toast notification
// ═══════════════════════════════════════════════════════════════════

export function showToast(message: string, dur = 4000): void {
  const old = document.querySelector(".toast-outer");
  if (old) old.remove();

  const outer = document.createElement("div");
  outer.className = "toast-outer";
  const inner = document.createElement("div");
  inner.className = "toast";
  inner.textContent = message;
  outer.appendChild(inner);
  document.body.appendChild(outer);

  setTimeout(() => {
    outer.classList.add("out");
    outer.addEventListener("animationend", () => outer.remove());
  }, dur);
}
