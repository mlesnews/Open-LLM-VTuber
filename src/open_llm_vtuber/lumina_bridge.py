"""
Lumina Trading State Bridge — WebSocket endpoint for JARVIS companion.

Reads Lumina ecosystem state files and streams updates to the Tauri shell.
The Tauri frontend connects to /lumina-ws and receives periodic trading state
updates including confidence, circuit breaker, alerts, ecosystem health, and
human-in-the-loop count.

C-000003928 — JARVIS Desktop Companion
"""

import asyncio
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, WebSocket
from loguru import logger
from starlette.websockets import WebSocketDisconnect, WebSocketState

# ── Lumina state file paths ──────────────────────────────────────────────
# These match the paths used by Lumina's confidence aggregator, circuit breaker,
# and ecosystem health modules.
LUMINA_ROOT = Path(os.environ.get("LUMINA_ROOT", str(Path.home() / "my_projects" / "lumina")))
TRADING_STATE_DIR = LUMINA_ROOT / "docker" / "cluster-ui" / "data" / "trading" / "state"
TRADING_DATA_DIR = LUMINA_ROOT / "docker" / "cluster-ui" / "data" / "trading"

STATE_FILES = {
    "confidence": TRADING_STATE_DIR / "confidence_aggregator.json",
    "circuit_breaker": TRADING_STATE_DIR / "circuit_breaker.json",
    "ecosystem_health": TRADING_STATE_DIR / "ecosystem_health.json",
    "alerts": TRADING_STATE_DIR / "alerts.json",
}

ESTOP_PATHS = [
    TRADING_DATA_DIR / "EMERGENCY_STOP",
    Path.home() / ".lumina" / "data" / "trading" / "EMERGENCY_STOP",
]

# Update interval in seconds
POLL_INTERVAL = 5.0


def _read_json_safe(path: Path) -> dict[str, Any]:
    """Read a JSON file safely, returning empty dict on failure."""
    try:
        if path.exists():
            return json.loads(path.read_text())
    except (json.JSONDecodeError, OSError) as e:
        logger.warning(f"Failed to read {path}: {e}")
    return {}


def _check_estop() -> tuple[bool, str | None]:
    """Check if EMERGENCY_STOP sentinel files exist."""
    for p in ESTOP_PATHS:
        if p.exists():
            try:
                data = json.loads(p.read_text())
                return True, data.get("reason", "UNKNOWN")
            except Exception:
                return True, "ESTOP_FILE_EXISTS"
    return False, None


def gather_trading_state() -> dict[str, Any]:
    """Gather current trading state from Lumina state files.

    Returns a JSON-serializable dict matching the schema expected by
    the Tauri shell's useTradingState hook.
    """
    confidence = _read_json_safe(STATE_FILES["confidence"])
    circuit_breaker = _read_json_safe(STATE_FILES["circuit_breaker"])
    ecosystem = _read_json_safe(STATE_FILES["ecosystem_health"])
    alerts_data = _read_json_safe(STATE_FILES["alerts"])

    estop_active, estop_reason = _check_estop()

    # Determine effective circuit breaker status
    if estop_active:
        cb_status = f"ESTOP:{estop_reason or 'ARMED'}"
    else:
        cb_status = circuit_breaker.get("level", "UNKNOWN").upper()

    # Extract alerts list
    alerts = []
    if isinstance(alerts_data, dict):
        alerts = alerts_data.get("alerts", alerts_data.get("active", []))
    elif isinstance(alerts_data, list):
        alerts = alerts_data

    return {
        "type": "trading_state",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "confidence_pct": confidence.get("readiness_pct", 0.0),
        "confidence_label": confidence.get("readiness_label", "UNKNOWN"),
        "circuit_breaker": cb_status,
        "ecosystem_health_pct": ecosystem.get("readiness_pct", 0.0),
        "ecosystem_health_label": ecosystem.get("label", "UNKNOWN"),
        "hitl_count": confidence.get("hitl_count", 0),
        "alerts": alerts[-10:] if alerts else [],  # Last 10 alerts max
        "cycle_count": confidence.get("cycle_count", 0),
        "recommendation": confidence.get("recommendation", ""),
    }


def _compute_mood(health_pct: float) -> str:
    """Compute companion mood from ecosystem health percentage.

    Returns: 'happy' (>=90), 'neutral' (70-89), 'sick' (<70)
    """
    if health_pct >= 90:
        return "happy"
    elif health_pct >= 70:
        return "neutral"
    else:
        return "sick"


def init_lumina_bridge_route() -> APIRouter:
    """Create the Lumina trading state WebSocket route.

    The Tauri shell connects here to receive periodic trading state updates.
    Also supports request/response for on-demand queries.
    """
    router = APIRouter()
    connected_clients: set[WebSocket] = set()

    @router.websocket("/lumina-ws")
    async def lumina_ws_endpoint(websocket: WebSocket):
        """WebSocket endpoint for Lumina trading state streaming."""
        await websocket.accept()
        connected_clients.add(websocket)
        logger.info(f"Lumina bridge: client connected ({len(connected_clients)} total)")

        try:
            # Start streaming task
            stream_task = asyncio.create_task(_stream_state(websocket))

            # Handle incoming messages (commands from Tauri shell)
            while True:
                try:
                    raw = await websocket.receive_text()
                    msg = json.loads(raw)
                    await _handle_command(websocket, msg)
                except json.JSONDecodeError:
                    await websocket.send_json({
                        "type": "error",
                        "message": "Invalid JSON",
                    })
        except WebSocketDisconnect:
            pass
        except Exception as e:
            logger.error(f"Lumina bridge error: {e}")
        finally:
            stream_task.cancel()
            connected_clients.discard(websocket)
            logger.info(f"Lumina bridge: client disconnected ({len(connected_clients)} remaining)")

    async def _stream_state(websocket: WebSocket):
        """Periodically send trading state updates to the client."""
        last_state_hash = None
        while True:
            try:
                state = gather_trading_state()
                state["mood"] = _compute_mood(state["ecosystem_health_pct"])

                # Only send if state changed (avoid unnecessary traffic)
                state_hash = hash(json.dumps(state, sort_keys=True))
                if state_hash != last_state_hash:
                    if websocket.client_state == WebSocketState.CONNECTED:
                        await websocket.send_json(state)
                    last_state_hash = state_hash

                await asyncio.sleep(POLL_INTERVAL)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Lumina bridge stream error: {e}")
                await asyncio.sleep(POLL_INTERVAL)

    async def _handle_command(websocket: WebSocket, msg: dict):
        """Handle commands from the Tauri shell."""
        cmd = msg.get("type", "")

        if cmd == "get_state":
            # On-demand state request
            state = gather_trading_state()
            state["mood"] = _compute_mood(state["ecosystem_health_pct"])
            await websocket.send_json(state)

        elif cmd == "get_mood":
            state = gather_trading_state()
            await websocket.send_json({
                "type": "mood",
                "mood": _compute_mood(state["ecosystem_health_pct"]),
                "health_pct": state["ecosystem_health_pct"],
            })

        elif cmd == "ping":
            await websocket.send_json({"type": "pong"})

        else:
            await websocket.send_json({
                "type": "error",
                "message": f"Unknown command: {cmd}",
            })

    return router
