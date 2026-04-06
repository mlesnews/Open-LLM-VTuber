import { useEffect, useRef, useState, useCallback } from "react";

interface WebSocketState {
  connected: boolean;
  lastMessage: string | null;
  send: (data: string) => void;
}

const RECONNECT_INTERVAL_MS = 3000;
const MAX_RECONNECT_INTERVAL_MS = 30000;

/**
 * Native browser WebSocket hook with auto-reconnect and exponential backoff.
 * We use the browser WebSocket API (available in Tauri's webview) rather than
 * @tauri-apps/plugin-websocket so the connection lives in the renderer and
 * React state updates are straightforward.
 */
export function useWebSocket(url: string): WebSocketState {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoff = useRef(RECONNECT_INTERVAL_MS);
  const unmounted = useRef(false);

  const connect = useCallback(() => {
    if (unmounted.current) return;
    // Clean up any existing socket
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      if (
        wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING
      ) {
        wsRef.current.close();
      }
    }

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (unmounted.current) return;
        setConnected(true);
        backoff.current = RECONNECT_INTERVAL_MS; // reset backoff on success
      };

      ws.onmessage = (event) => {
        if (unmounted.current) return;
        setLastMessage(typeof event.data === "string" ? event.data : null);
      };

      ws.onclose = () => {
        if (unmounted.current) return;
        setConnected(false);
        scheduleReconnect();
      };

      ws.onerror = () => {
        // onclose will fire after onerror — reconnect happens there
      };
    } catch {
      scheduleReconnect();
    }
  }, [url]);

  const scheduleReconnect = useCallback(() => {
    if (unmounted.current) return;
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    reconnectTimer.current = setTimeout(() => {
      backoff.current = Math.min(backoff.current * 1.5, MAX_RECONNECT_INTERVAL_MS);
      connect();
    }, backoff.current);
  }, [connect]);

  useEffect(() => {
    unmounted.current = false;
    connect();
    return () => {
      unmounted.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onopen = null;
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.onmessage = null;
        wsRef.current.close();
      }
    };
  }, [connect]);

  const send = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    }
  }, []);

  return { connected, lastMessage, send };
}
