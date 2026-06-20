/**
 * GARUDA Frontend — WebSocket Handler
 * =====================================
 * Connects to /ws/feed and dispatches events to registered listeners.
 * Auto-reconnects on disconnect with exponential backoff.
 */

const GarudaWS = (() => {
  const WS_URL = 'ws://localhost:8000/ws/feed';
  let ws = null;
  let reconnectDelay = 1000;
  let reconnectTimer = null;
  const listeners = {};

  function on(event, callback) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(callback);
  }

  function emit(event, data) {
    (listeners[event] || []).forEach(cb => {
      try { cb(data); } catch (e) { console.error('WS listener error:', e); }
    });
    (listeners['*'] || []).forEach(cb => {
      try { cb(event, data); } catch (e) {}
    });
  }

  function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      reconnectDelay = 1000;
      _setStatus('connected');
      emit('connected', {});
      // Start keepalive ping every 25s
      startPing();
    };

    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        emit(data.event || 'message', data);
      } catch (e) {
        console.warn('WS parse error:', e);
      }
    };

    ws.onclose = () => {
      _setStatus('error');
      emit('disconnected', {});
      stopPing();
      // Exponential backoff reconnect
      reconnectTimer = setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 2, 30000);
        connect();
      }, reconnectDelay);
    };

    ws.onerror = (err) => {
      _setStatus('error');
      emit('error', err);
    };
  }

  let pingTimer = null;
  function startPing() {
    stopPing();
    pingTimer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send('ping');
      }
    }, 25000);
  }
  function stopPing() {
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
  }

  function _setStatus(state) {
    const dot   = document.getElementById('ws-dot');
    const label = document.getElementById('ws-label');
    if (!dot || !label) return;
    dot.className = 'status-dot ' + state;
    label.textContent = state === 'connected' ? 'Live Connected' : 'Reconnecting…';
  }

  function disconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    stopPing();
    if (ws) { ws.close(); ws = null; }
  }

  function isConnected() {
    return ws && ws.readyState === WebSocket.OPEN;
  }

  return { connect, disconnect, on, isConnected, WS_URL };
})();
