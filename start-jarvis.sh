#!/usr/bin/env bash
# JARVIS Desktop Companion — Launcher (C-000003928)
# Sources vault secrets, starts backend + Tauri shell.
# Usage: bash start-jarvis.sh [--backend-only | --shell-only]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LUMINA_ROOT="${LUMINA_ROOT:-$HOME/my_projects/lumina}"

# ── Source vault helper for secret injection ──
if [[ -f "$LUMINA_ROOT/scripts/bash/vault-helper.sh" ]]; then
    source "$LUMINA_ROOT/scripts/bash/vault-helper.sh"
else
    echo "WARN: vault-helper.sh not found at $LUMINA_ROOT/scripts/bash/vault-helper.sh"
    echo "ElevenLabs TTS will not work without API key."
fi

# ── Inject secrets as env vars (never touch disk) ──
if command -v vault_get &>/dev/null; then
    export ELEVENLABS_API_KEY="$(vault_get elevenlabs-api-key 2>/dev/null || echo '')"
    export ELEVENLABS_VOICE_ID="$(vault_get elevenlabs-voice-id 2>/dev/null || echo '')"
fi

export LUMINA_ROOT="$LUMINA_ROOT"

MODE="${1:-all}"

start_backend() {
    echo "[JARVIS] Starting Open-LLM-VTuber backend on :12393..."
    cd "$SCRIPT_DIR"
    # Use character override for JARVIS personality
    if [[ -f "conf.yaml" ]]; then
        uv run run_server.py --verbose &
    else
        echo "[JARVIS] No conf.yaml found — copying JARVIS template..."
        cp config_templates/conf.default.yaml conf.yaml
        uv run run_server.py --verbose &
    fi
    BACKEND_PID=$!
    echo "[JARVIS] Backend PID: $BACKEND_PID"
}

start_shell() {
    echo "[JARVIS] Starting Tauri shell..."
    cd "$SCRIPT_DIR/tauri-shell"
    if [[ ! -d "node_modules" ]]; then
        echo "[JARVIS] Installing Tauri dependencies..."
        npm install
    fi
    npm run tauri dev &
    SHELL_PID=$!
    echo "[JARVIS] Tauri shell PID: $SHELL_PID"
}

case "$MODE" in
    --backend-only)
        start_backend
        wait $BACKEND_PID
        ;;
    --shell-only)
        start_shell
        wait $SHELL_PID
        ;;
    all|*)
        start_backend
        sleep 3  # Let backend initialize before shell connects
        start_shell
        echo "[JARVIS] All systems online. Press Ctrl+C to shutdown."
        trap "kill $BACKEND_PID $SHELL_PID 2>/dev/null; exit 0" INT TERM
        wait
        ;;
esac
