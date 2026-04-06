import { useEffect, useState } from "react";

export interface TradingAlert {
  level: "info" | "warn" | "critical";
  message: string;
  ts?: string;
}

export interface TradingState {
  confidencePct: number;
  circuitBreaker: "GREEN" | "YELLOW" | "RED";
  alerts: TradingAlert[];
  ecosystemHealthPct: number;
  hitlCount: number;
  lastUpdate: number; // unix ms
}

const DEFAULT_STATE: TradingState = {
  confidencePct: 0,
  circuitBreaker: "GREEN",
  alerts: [],
  ecosystemHealthPct: 80, // safe default until real data arrives
  hitlCount: 0,
  lastUpdate: 0,
};

/**
 * Parses Lumina trading state messages from the WebSocket.
 * Expected JSON shape:
 * {
 *   "type": "trading_state",
 *   "confidence_pct": 83.5,
 *   "circuit_breaker": "GREEN",
 *   "alerts": [{ "level": "warn", "message": "Vol spike" }],
 *   "ecosystem_health_pct": 89.9,
 *   "hitl_count": 0
 * }
 */
export function useTradingState(lastMessage: string | null): TradingState {
  const [state, setState] = useState<TradingState>(DEFAULT_STATE);

  useEffect(() => {
    if (!lastMessage) return;

    try {
      const msg = JSON.parse(lastMessage);
      if (msg.type !== "trading_state") return;

      setState({
        confidencePct:
          typeof msg.confidence_pct === "number" ? msg.confidence_pct : state.confidencePct,
        circuitBreaker: validateCircuitBreaker(msg.circuit_breaker),
        alerts: Array.isArray(msg.alerts) ? msg.alerts.map(parseAlert) : state.alerts,
        ecosystemHealthPct:
          typeof msg.ecosystem_health_pct === "number"
            ? msg.ecosystem_health_pct
            : state.ecosystemHealthPct,
        hitlCount: typeof msg.hitl_count === "number" ? msg.hitl_count : state.hitlCount,
        lastUpdate: Date.now(),
      });
    } catch {
      // Malformed JSON — ignore silently
    }
  }, [lastMessage]);

  return state;
}

function validateCircuitBreaker(
  val: unknown,
): "GREEN" | "YELLOW" | "RED" {
  if (val === "GREEN" || val === "YELLOW" || val === "RED") return val;
  return "GREEN";
}

function parseAlert(raw: unknown): TradingAlert {
  if (typeof raw === "object" && raw !== null) {
    const obj = raw as Record<string, unknown>;
    return {
      level:
        obj.level === "info" || obj.level === "warn" || obj.level === "critical"
          ? obj.level
          : "info",
      message: typeof obj.message === "string" ? obj.message : "Unknown alert",
      ts: typeof obj.ts === "string" ? obj.ts : undefined,
    };
  }
  return { level: "info", message: String(raw) };
}
