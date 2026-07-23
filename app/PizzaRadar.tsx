"use client";

import { useEffect, useRef } from "react";
import type { RadarMetric } from "@/lib/scouting";

const COLORS = ["#e95b3f", "#d7a62c", "#43a8a0"];

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const corner = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + corner, y);
  ctx.arcTo(x + width, y, x + width, y + height, corner);
  ctx.arcTo(x + width, y + height, x, y + height, corner);
  ctx.arcTo(x, y + height, x, y, corner);
  ctx.arcTo(x, y, x + width, y, corner);
  ctx.closePath();
}

export function PizzaRadar({ metrics, score }: { metrics: RadarMetric[]; score: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !metrics.length) return;
    const draw = () => {
      const size = Math.max(420, Math.min(680, canvas.clientWidth * 2));
      const ratio = window.devicePixelRatio || 1;
      canvas.width = size * ratio;
      canvas.height = size * ratio;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(ratio, ratio);
      ctx.clearRect(0, 0, size, size);
      const cx = size / 2;
      const cy = size / 2;
      const outer = size * 0.31;
      const inner = size * 0.085;
      const gap = 0.025;
      const step = Math.PI * 2 / metrics.length;

      ctx.strokeStyle = "rgba(26, 43, 56, .1)";
      ctx.lineWidth = 1;
      [0.25, 0.5, 0.75, 1].forEach((fraction) => {
        ctx.beginPath();
        ctx.arc(cx, cy, outer * fraction, 0, Math.PI * 2);
        ctx.stroke();
      });

      metrics.forEach((metric, index) => {
        const start = -Math.PI / 2 + index * step + gap;
        const end = -Math.PI / 2 + (index + 1) * step - gap;
        const radius = Math.max(inner + 8, outer * Math.max(0.08, metric.percentile / 100));
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(start) * inner, cy + Math.sin(start) * inner);
        ctx.arc(cx, cy, radius, start, end);
        ctx.lineTo(cx + Math.cos(end) * inner, cy + Math.sin(end) * inner);
        ctx.arc(cx, cy, inner, end, start, true);
        ctx.closePath();
        ctx.fillStyle = COLORS[metric.group] ?? COLORS[0];
        ctx.globalAlpha = 0.94;
        ctx.fill();
        ctx.globalAlpha = 1;

        const middle = start + step / 2 - gap;
        const valueRadius = Math.max(inner + 18, radius - 18);
        const value = String(metric.percentile);
        const valueFontSize = Math.max(10, size * 0.019);
        const valueX = cx + Math.cos(middle) * valueRadius;
        const valueY = cy + Math.sin(middle) * valueRadius;
        ctx.font = `800 ${valueFontSize}px Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const pillWidth = Math.max(valueFontSize * 1.85, ctx.measureText(value).width + valueFontSize * 0.85);
        const pillHeight = valueFontSize * 1.55;
        ctx.save();
        ctx.shadowColor = "rgba(3, 10, 17, .34)";
        ctx.shadowBlur = Math.max(3, size * 0.009);
        roundedRect(ctx, valueX - pillWidth / 2, valueY - pillHeight / 2, pillWidth, pillHeight, pillHeight / 2);
        ctx.fillStyle = "rgba(8, 18, 28, .82)";
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "rgba(255, 255, 255, .42)";
        ctx.lineWidth = Math.max(1, size * 0.0018);
        ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.fillText(value, valueX, valueY + valueFontSize * 0.02);
        ctx.restore();

        const labelRadius = outer + size * 0.065;
        const lx = cx + Math.cos(middle) * labelRadius;
        const ly = cy + Math.sin(middle) * labelRadius;
        ctx.fillStyle = "#445366";
        ctx.font = `600 ${Math.max(9, size * 0.017)}px Arial`;
        ctx.textAlign = Math.cos(middle) > 0.18 ? "left" : Math.cos(middle) < -0.18 ? "right" : "center";
        ctx.fillText(metric.label, lx, ly);
      });

      ctx.beginPath();
      ctx.arc(cx, cy, inner - 2, 0, Math.PI * 2);
      ctx.fillStyle = "#122431";
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `800 ${size * 0.042}px Arial`;
      ctx.fillText(String(score), cx, cy - size * 0.008);
      ctx.fillStyle = "#9fb0bb";
      ctx.font = `700 ${size * 0.013}px Arial`;
      ctx.fillText("ÍNDICE", cx, cy + size * 0.032);
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [metrics, score]);

  return (
    <canvas
      ref={canvasRef}
      className="pizza-radar"
      role="img"
      aria-label={`Radar de percentiles con índice global ${score} de 100`}
    />
  );
}
