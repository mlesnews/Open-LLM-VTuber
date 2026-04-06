import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Live2DCanvas from "./components/Live2DCanvas";
import MoodIndicator from "./components/MoodIndicator";
import TradingOverlay from "./components/TradingOverlay";
import { useWebSocket } from "./hooks/useWebSocket";
import { useTradingState, type TradingState } from "./hooks/useTradingState";

const BACKEND_WS = "ws://localhost:12393/client-ws";
const LUMINA_WS = "ws://localhost:12393/lumina-ws";

function App() {
  const [clickThrough, setClickThrough] = useState(false);
  const [expression, setExpression] = useState<string>("neutral");

  // --- WebSocket connections ---
  const backend = useWebSocket(BACKEND_WS);
  const lumina = useWebSocket(LUMINA_WS);

  // --- Trading state derived from Lumina WS ---
  const tradingState: TradingState = useTradingState(lumina.lastMessage);

  // --- Map ecosystem health to expression ---
  useEffect(() => {
    const h = tradingState.ecosystemHealthPct;
    if (h >= 90) setExpression("happy");
    else if (h >= 70) setExpression("neutral");
    else setExpression("sick");
  }, [tradingState.ecosystemHealthPct]);

  // --- Route backend messages (e.g. lip-sync, emotion triggers) ---
  useEffect(() => {
    if (!backend.lastMessage) return;
    try {
      const msg = JSON.parse(backend.lastMessage);
      if (msg.type === "expression") {
        setExpression(msg.value ?? "neutral");
      }
      // Future: lip-sync audio data, subtitle text, etc.
    } catch {
      // non-JSON messages are ignored
    }
  }, [backend.lastMessage]);

  // --- Click-through toggle (Alt+T) ---
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.key === "t") {
        const next = !clickThrough;
        setClickThrough(next);
        invoke("set_click_through", { enabled: next });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [clickThrough]);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        background: "transparent",
        overflow: "hidden",
        userSelect: "none",
        // Drag region for the frameless window (top 32px)
      }}
    >
      {/* Drag handle */}
      <div
        data-tauri-drag-region
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 32,
          zIndex: 100,
          cursor: "move",
        }}
      />

      {/* Live2D character canvas — fills window */}
      <Live2DCanvas expression={expression} />

      {/* Mood indicator — bottom-left */}
      <MoodIndicator healthPct={tradingState.ecosystemHealthPct} />

      {/* Trading overlay — bottom-right */}
      <TradingOverlay state={tradingState} />

      {/* Connection status dots */}
      <div
        style={{
          position: "absolute",
          top: 6,
          right: 8,
          display: "flex",
          gap: 4,
          zIndex: 200,
        }}
      >
        <StatusDot
          connected={backend.connected}
          title={`Backend: ${backend.connected ? "connected" : "disconnected"}`}
        />
        <StatusDot
          connected={lumina.connected}
          title={`Lumina: ${lumina.connected ? "connected" : "disconnected"}`}
        />
      </div>

      {/* Click-through indicator */}
      {clickThrough && (
        <div
          style={{
            position: "absolute",
            top: 6,
            left: 8,
            fontSize: 10,
            color: "rgba(255,255,255,0.5)",
            fontFamily: "monospace",
            zIndex: 200,
          }}
        >
          CLICK-THROUGH (Alt+T)
        </div>
      )}
    </div>
  );
}

function StatusDot({
  connected,
  title,
}: {
  connected: boolean;
  title: string;
}) {
  return (
    <div
      title={title}
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: connected ? "#00ff88" : "#ff4444",
        boxShadow: connected
          ? "0 0 4px #00ff88"
          : "0 0 4px #ff4444",
        transition: "background 0.3s",
      }}
    />
  );
}

export default App;
