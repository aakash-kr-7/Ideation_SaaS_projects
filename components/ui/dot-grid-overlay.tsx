"use client";

import {
  useEffect,
  useRef,
  type CanvasHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

type DotGridOverlayProps = Omit<
  CanvasHTMLAttributes<HTMLCanvasElement>,
  "children"
> & {
  maxDots?: number;
  minSpacing?: number;
  interactive?: boolean;
};

type Dot = {
  x: number;
  y: number;
  phase: number;
  buildColor: boolean;
};

function rgbFromHex(value: string, fallback: [number, number, number]) {
  const normalized = value.trim().replace(/^#/, "");
  if (!/^[\da-f]{6}$/i.test(normalized)) return fallback;
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ] as const;
}

function rgba(color: readonly number[], alpha: number) {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
}

/**
 * A capped, canvas-rendered dot field that inherits ShouldBuild's accent and
 * build-verdict colors. The parent element owns pointer interaction so the
 * overlay never blocks forms, links, report controls, or card hover states.
 */
export function DotGridOverlay({
  className,
  maxDots = 260,
  minSpacing = 18,
  interactive = true,
  ...props
}: DotGridOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const mountedCanvas = canvasRef.current;
    if (!mountedCanvas) return;
    const mountedHost = mountedCanvas.parentElement;
    if (!mountedHost) return;
    const mountedContext = mountedCanvas.getContext("2d");
    if (!mountedContext) return;

    const canvas: HTMLCanvasElement = mountedCanvas;
    const host: HTMLElement = mountedHost;
    const context: CanvasRenderingContext2D = mountedContext;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches;
    let width = 0;
    let height = 0;
    let dots: Dot[] = [];
    let frame = 0;
    let revealStartedAt: number | null = null;
    let hasRevealed = false;
    let observer: IntersectionObserver | null = null;
    let pointer: { x: number; y: number } | null = null;

    const styles = getComputedStyle(canvas);
    const accent = rgbFromHex(
      styles.getPropertyValue("--sb-accent"),
      [74, 95, 232],
    );
    const build = rgbFromHex(
      styles.getPropertyValue("--sb-verdict-build"),
      [74, 222, 128],
    );

    function buildGrid() {
      const bounds = canvas.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);

      const safeMaximum = Math.max(24, Math.min(520, Math.floor(maxDots)));
      let spacing = Math.max(
        12,
        minSpacing,
        Math.sqrt((width * height) / safeMaximum),
      );
      let columns = Math.max(1, Math.floor(width / spacing));
      let rows = Math.max(1, Math.floor(height / spacing));

      while (columns * rows > safeMaximum) {
        spacing += 1;
        columns = Math.max(1, Math.floor(width / spacing));
        rows = Math.max(1, Math.floor(height / spacing));
      }

      const offsetX = (width - (columns - 1) * spacing) / 2;
      const offsetY = (height - (rows - 1) * spacing) / 2;
      dots = [];

      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const seed = (row * 37 + column * 17) % 29;
          dots.push({
            x: offsetX + column * spacing,
            y: offsetY + row * spacing,
            phase: seed / 28,
            buildColor: (row + column * 2) % 7 === 0,
          });
        }
      }

      const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(width * pixelRatio));
      canvas.height = Math.max(1, Math.round(height * pixelRatio));
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    }

    function draw(timestamp = performance.now()) {
      context.clearRect(0, 0, width, height);
      const elapsed = revealStartedAt === null
        ? 0
        : Math.max(0, timestamp - revealStartedAt);
      const revealProgress = reducedMotion || revealStartedAt === null
        ? 1
        : Math.min(1, elapsed / 1050);
      const pointerRadius = Math.min(132, Math.max(86, width * 0.12));

      for (const dot of dots) {
        let cursorBoost = 0;
        if (!reducedMotion && interactive && pointer) {
          const distance = Math.hypot(dot.x - pointer.x, dot.y - pointer.y);
          if (distance < pointerRadius) {
            cursorBoost = Math.pow(1 - distance / pointerRadius, 2);
          }
        }

        let revealBoost = 0;
        if (!reducedMotion && revealStartedAt !== null) {
          const dotPosition = (dot.x / width) * 0.58 + (dot.y / height) * 0.42;
          const sweepPosition = revealProgress * 1.45;
          revealBoost = Math.max(
            0,
            1 - Math.abs(sweepPosition - dotPosition) / 0.2,
          ) * 0.72;
        }

        const boost = Math.max(cursorBoost, revealBoost);
        const color = dot.buildColor ? build : accent;
        const baseAlpha = reducedMotion
          ? 0.105 + dot.phase * 0.025
          : 0.065 + dot.phase * 0.018;
        const alpha = Math.min(0.82, baseAlpha + boost * 0.68);
        const radius = 0.7 + boost * 1.25;

        context.beginPath();
        context.fillStyle = rgba(color, alpha);
        if (boost > 0.08) {
          context.shadowBlur = 4 + boost * 10;
          context.shadowColor = rgba(color, 0.52 * boost);
        } else {
          context.shadowBlur = 0;
          context.shadowColor = "transparent";
        }
        context.arc(dot.x, dot.y, radius, 0, Math.PI * 2);
        context.fill();
      }

      context.shadowBlur = 0;
      context.shadowColor = "transparent";
    }

    function requestDraw() {
      if (frame) return;
      frame = window.requestAnimationFrame((timestamp) => {
        frame = 0;
        draw(timestamp);
        if (
          !reducedMotion &&
          revealStartedAt !== null &&
          timestamp - revealStartedAt < 1050
        ) {
          requestDraw();
        } else if (revealStartedAt !== null) {
          revealStartedAt = null;
          draw(timestamp);
        }
      });
    }

    function startEntryObserver() {
      observer?.disconnect();
      observer = null;
      if (reducedMotion || hasRevealed) return;

      observer = new IntersectionObserver(
        ([entry]) => {
          if (!entry?.isIntersecting) return;
          hasRevealed = true;
          revealStartedAt = performance.now();
          requestDraw();
          observer?.disconnect();
          observer = null;
        },
        { threshold: 0.12 },
      );
      observer.observe(canvas);
    }

    function handlePointerMove(event: PointerEvent) {
      if (reducedMotion || !interactive) return;
      const bounds = canvas.getBoundingClientRect();
      pointer = {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      };
      requestDraw();
    }

    function handlePointerLeave() {
      if (reducedMotion || !interactive) return;
      pointer = null;
      requestDraw();
    }

    function handleMotionChange(event: MediaQueryListEvent) {
      reducedMotion = event.matches;
      pointer = null;
      revealStartedAt = null;
      if (reducedMotion) {
        observer?.disconnect();
        observer = null;
      } else {
        startEntryObserver();
      }
      requestDraw();
    }

    const resizeObserver = new ResizeObserver(() => {
      buildGrid();
      requestDraw();
    });

    resizeObserver.observe(canvas);
    if (interactive) {
      host.addEventListener("pointermove", handlePointerMove, { passive: true });
      host.addEventListener("pointerleave", handlePointerLeave, { passive: true });
    }
    motionQuery.addEventListener("change", handleMotionChange);
    buildGrid();
    draw();
    startEntryObserver();

    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      resizeObserver.disconnect();
      host.removeEventListener("pointermove", handlePointerMove);
      host.removeEventListener("pointerleave", handlePointerLeave);
      motionQuery.removeEventListener("change", handleMotionChange);
    };
  }, [interactive, maxDots, minSpacing]);

  return (
    <canvas
      {...props}
      ref={canvasRef}
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 h-full w-full", className)}
      data-dot-grid-overlay
    />
  );
}
