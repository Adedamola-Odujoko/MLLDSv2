// src/dataClient.js (REVISED)
const DEFAULT_WS_URL = "wss://8649e45c8a00.ngrok-free.app/"; // CRITICAL: Replace this URL.
// src/dataClient.js (FINAL VERSION WITH WORKAROUND)

export function connectData({ onOpen, onMessage, onError, onClose, url }) {
  const wsUrl = url || DEFAULT_WS_URL;
  let ws = null;
  let reconnectTimer = null;
  let reconnectAttempts = 0;

  function open() {
    ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      console.log("[WS] Connection opened.");
      reconnectAttempts = 0;
      if (onOpen) onOpen();
    };
    ws.onmessage = async (ev) => {
      try {
        let text;
        // ======================================================================
        // TEMPORARY WORKAROUND: If data is a Blob, read it as text.
        // This is a patch for a backend misconfiguration.
        // The correct fix is for the backend to send a text frame.
        if (ev.data instanceof Blob) {
          console.warn(
            "[WS] Received Blob instead of String. Applying workaround."
          );
          text = await ev.data.text();
        } else {
          text = ev.data;
        }
        // ======================================================================
        const obj = JSON.parse(text);
        if (onMessage) onMessage(obj);
      } catch (e) {
        console.error(
          "[WS] Failed to parse message:",
          e,
          "Received data:",
          ev.data
        );
      }
    };
    ws.onerror = (err) => {
      console.error("[WS] WebSocket error:", err);
      if (onError) onError(err);
      ws.close();
    };
    ws.onclose = (ev) => {
      console.warn(`[WS] Connection closed (code: ${ev.code}).`);
      if (onClose) onClose(ev);
      scheduleReconnect();
    };
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    const delay = Math.min(1000 + 2 ** reconnectAttempts * 100, 30000);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      reconnectAttempts++;
      console.log(`[WS] Reconnecting (attempt ${reconnectAttempts})...`);
      open();
    }, delay);
  }
  open();
}
