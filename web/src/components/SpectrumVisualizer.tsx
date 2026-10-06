import { useEffect, useRef } from "react";
import { ensureAnalyser, getAnalyser } from "../audioEngine";

/** Canvas FFT spectrum for the now-playing view. */
export function SpectrumVisualizer({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active) return;
    ensureAnalyser();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const draw = () => {
      const analyser = getAnalyser();
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      if (!analyser) {
        raf = requestAnimationFrame(draw);
        return;
      }
      const bins = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(bins);
      const barCount = 48;
      const step = Math.floor(bins.length / barCount);
      const gap = 2;
      const barW = (width - gap * (barCount - 1)) / barCount;
      for (let i = 0; i < barCount; i++) {
        const v = bins[i * step] / 255;
        const h = Math.max(2, v * height);
        const x = i * (barW + gap);
        const y = height - h;
        const grad = ctx.createLinearGradient(0, height, 0, 0);
        grad.addColorStop(0, "rgba(251,113,133,0.35)");
        grad.addColorStop(1, "rgba(255,255,255,0.85)");
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, barW, h);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      width={480}
      height={56}
      className="mt-4 h-14 w-full max-w-md"
      aria-hidden
    />
  );
}
