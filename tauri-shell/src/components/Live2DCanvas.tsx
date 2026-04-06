import { useEffect, useRef } from "react";
import * as PIXI from "pixi.js";
import { Live2DModel } from "pixi-live2d-display";

// Register the Ticker for Live2D updates
Live2DModel.registerTicker(PIXI.Ticker);

interface Props {
  expression: string;
  modelPath?: string;
}

const DEFAULT_MODEL_PATH = "../live2d-models/shizuku/shizuku.model3.json";

/**
 * Renders a Live2D model on a transparent PixiJS canvas.
 * Fills the parent container. Expression changes trigger model motion groups.
 */
export default function Live2DCanvas({
  expression,
  modelPath = DEFAULT_MODEL_PATH,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const modelRef = useRef<InstanceType<typeof Live2DModel> | null>(null);

  // --- Initialize PixiJS app ---
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const app = new PIXI.Application({
      width: container.clientWidth,
      height: container.clientHeight,
      backgroundAlpha: 0, // transparent — critical for overlay
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    });

    container.appendChild(app.view as unknown as HTMLCanvasElement);
    appRef.current = app;

    // Handle resize
    const onResize = () => {
      app.renderer.resize(container.clientWidth, container.clientHeight);
      fitModel();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(container);

    return () => {
      ro.disconnect();
      app.destroy(true, { children: true, texture: true });
      appRef.current = null;
      modelRef.current = null;
    };
  }, []);

  // --- Load the Live2D model ---
  useEffect(() => {
    const app = appRef.current;
    if (!app) return;

    let cancelled = false;

    (async () => {
      try {
        const model = await Live2DModel.from(modelPath, {
          autoInteract: false,
        });

        if (cancelled) {
          model.destroy();
          return;
        }

        // Remove any existing model
        if (modelRef.current) {
          app.stage.removeChild(modelRef.current);
          modelRef.current.destroy();
        }

        model.anchor.set(0.5, 0.5);
        app.stage.addChild(model);
        modelRef.current = model;

        fitModel();
      } catch (err) {
        console.warn("[Live2DCanvas] Failed to load model:", err);
        // Model load failure is non-fatal — the canvas stays transparent
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [modelPath]);

  // --- React to expression changes ---
  useEffect(() => {
    const model = modelRef.current;
    if (!model) return;

    // Map expression names to Live2D motion groups.
    // These group names are model-dependent — shizuku uses "idle", "tap_body", etc.
    // We attempt the expression name directly, then fall back to tap_body.
    const motionMap: Record<string, { group: string; index: number }> = {
      happy: { group: "tap_body", index: 0 },
      neutral: { group: "idle", index: 0 },
      sick: { group: "shake", index: 0 },
    };

    const motion = motionMap[expression] ?? motionMap.neutral;

    try {
      model.motion(motion.group, motion.index);
    } catch {
      // Motion group might not exist in this model — that's fine
    }

    // Also try setting the expression directly if the model supports it
    try {
      model.expression(expression);
    } catch {
      // Not all models have named expressions
    }
  }, [expression]);

  /** Scale and center the model within the canvas. */
  function fitModel() {
    const app = appRef.current;
    const model = modelRef.current;
    if (!app || !model) return;

    const { width: cw, height: ch } = app.renderer;
    const scale = Math.min(cw / model.width, ch / model.height) * 0.85;
    model.scale.set(scale);
    model.x = cw / 2;
    model.y = ch / 2;
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
      }}
    />
  );
}
