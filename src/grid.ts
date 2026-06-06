// ═══════════════════════════════════════════════════════════════════
// Outrun perspective grid — animated canvas background
// ═══════════════════════════════════════════════════════════════════

export function initOutrunGrid(): void {
  const canvas = document.getElementById("outrunGrid") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;

  function resize(): void {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  let frame = 0;
  function draw(): void {
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
