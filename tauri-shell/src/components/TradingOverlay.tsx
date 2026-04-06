import type { TradingState } from "../hooks/useTradingState";

interface Props {
  state: TradingState;
}

const CB_COLORS: Record<string, string> = {
  GREEN: "#00ff88",
  YELLOW: "#ffcc00",
  RED: "#ff4444",
};

const ALERT_COLORS: Record<string, string> = {
  info: "#88ccff",
  warn: "#ffcc00",
  critical: "#ff4444",
};

/**
 * Compact trading info overlay anchored bottom-right.
 * Shows confidence %, circuit breaker status, HITL count, and recent alerts.
 */
export default function TradingOverlay({ state }: Props) {
  const { confidencePct, circuitBreaker, alerts, hitlCount, lastUpdate } =
    state;

  // Don't render anything until we've received at least one update
  if (lastUpdate === 0) return null;

  const stale = Date.now() - lastUpdate > 60_000; // > 60s since last msg
  const cbColor = CB_COLORS[circuitBreaker] ?? CB_COLORS.GREEN;
  const latestAlerts = alerts.slice(-3); // show at most 3

  return (
    <div
      style={{
        position: "absolute",
        bottom: 12,
        right: 12,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "6px 10px",
        borderRadius: 10,
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(6px)",
        color: "#e0e0e0",
        fontSize: 12,
        fontFamily:
          "'SF Mono', 'Cascadia Code', 'JetBrains Mono', monospace",
        maxWidth: 180,
        pointerEvents: "auto",
        zIndex: 150,
        opacity: stale ? 0.5 : 1,
        transition: "opacity 0.3s",
      }}
    >
      {/* Confidence */}
      <Row label="Conf" value={`${confidencePct.toFixed(1)}%`} />

      {/* Circuit Breaker */}
      <Row
        label="CB"
        value={
          <span style={{ color: cbColor, fontWeight: 700 }}>
            {circuitBreaker}
          </span>
        }
      />

      {/* HITL count */}
      {hitlCount > 0 && (
        <Row
          label="HITL"
          value={
            <span style={{ color: "#ff8800" }}>{hitlCount}</span>
          }
        />
      )}

      {/* Alerts */}
      {latestAlerts.length > 0 && (
        <div
          style={{
            marginTop: 2,
            borderTop: "1px solid rgba(255,255,255,0.15)",
            paddingTop: 3,
          }}
        >
          {latestAlerts.map((a, i) => (
            <div
              key={i}
              style={{
                color: ALERT_COLORS[a.level] ?? ALERT_COLORS.info,
                fontSize: 10,
                lineHeight: 1.3,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {a.message}
            </div>
          ))}
        </div>
      )}

      {stale && (
        <div style={{ fontSize: 9, color: "#888", marginTop: 2 }}>
          STALE
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 8,
      }}
    >
      <span style={{ color: "#888" }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
