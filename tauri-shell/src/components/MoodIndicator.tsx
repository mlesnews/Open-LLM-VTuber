interface Props {
  healthPct: number;
}

/**
 * Small mood badge anchored to the bottom-left of the companion window.
 * happy >= 90%, neutral 70-90%, sick < 70%.
 */
export default function MoodIndicator({ healthPct }: Props) {
  const { emoji, label, color, glow } = getMood(healthPct);

  return (
    <div
      title={`Ecosystem health: ${healthPct.toFixed(1)}%`}
      style={{
        position: "absolute",
        bottom: 12,
        left: 12,
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 12,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(6px)",
        color,
        fontSize: 13,
        fontFamily:
          "'SF Mono', 'Cascadia Code', 'JetBrains Mono', monospace",
        boxShadow: `0 0 8px ${glow}`,
        pointerEvents: "auto",
        zIndex: 150,
        transition: "all 0.4s ease",
      }}
    >
      <span style={{ fontSize: 18 }}>{emoji}</span>
      <span>
        {label}{" "}
        <span style={{ opacity: 0.7, fontSize: 11 }}>
          {healthPct.toFixed(0)}%
        </span>
      </span>
    </div>
  );
}

function getMood(pct: number) {
  if (pct >= 90)
    return {
      emoji: "\u2728",
      label: "Happy",
      color: "#00ff88",
      glow: "rgba(0,255,136,0.3)",
    };
  if (pct >= 70)
    return {
      emoji: "\u2014",
      label: "Neutral",
      color: "#ffcc00",
      glow: "rgba(255,204,0,0.2)",
    };
  return {
    emoji: "\u26a0",
    label: "Sick",
    color: "#ff4444",
    glow: "rgba(255,68,68,0.3)",
  };
}
