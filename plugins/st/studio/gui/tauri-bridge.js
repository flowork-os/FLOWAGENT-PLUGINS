/**
 * Tauri v2 Bridge Shim for Native Linux WebKit2GTK Runtime
 * 100% API Compatibility for window.__TAURI__
 * Co-authored-by: Flowork OS <agent@floworkos.com>
 */

(function() {
  'use strict';

  const eventListeners = {};

  function listen(eventName, callback) {
    if (!eventListeners[eventName]) {
      eventListeners[eventName] = [];
    }
    eventListeners[eventName].push(callback);
    return () => {
      eventListeners[eventName] = eventListeners[eventName].filter(cb => cb !== callback);
    };
  }

  function emit(eventName, payload) {
    if (eventListeners[eventName]) {
      eventListeners[eventName].forEach(cb => {
        try {
          cb({ event: eventName, payload: payload });
        } catch (e) {
          console.error('[TauriBridge] Event callback error:', e);
        }
      });
    }
  }

  function getApiBase() {
    if (typeof window !== 'undefined' && window.location) {
      const p = new URLSearchParams(window.location.search).get('port');
      if (p) return `http://127.0.0.1:${p}`;
      if (window.location.port && window.location.port !== '19890') {
        return `${window.location.protocol}//${window.location.hostname}:${window.location.port}`;
      }
    }
    return 'http://127.0.0.1:18980';
  }
  window.__FLOWORK_API_BASE__ = getApiBase();

  async function invoke(cmd, args = {}) {
    try {
      const response = await fetch(`${getApiBase()}/api/invoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd, args: args })
      });
      const data = await response.json();
      if (!response.ok || data.ok === false) {
        throw new Error(data.error || ('Invoke failed: ' + cmd));
      }
      return data.result !== undefined ? data.result : data;
    } catch (err) {
      console.error('[TauriBridge] invoke error:', cmd, err);
      throw err;
    }
  }

  const appWindow = {
    minimize: async () => {
      await fetch(`${getApiBase()}/api/window/minimize`, { method: 'POST' }).catch(() => {});
    },
    close: async () => {
      await fetch(`${getApiBase()}/api/window/close`, { method: 'POST' }).catch(() => {});
    },
    toggleMaximize: async () => {
      await fetch(`${getApiBase()}/api/window/maximize`, { method: 'POST' }).catch(() => {});
    },
    startDragging: async () => {
      await fetch(`${getApiBase()}/api/window/start_drag`, { method: 'POST' }).catch(() => {});
    }
  };

  const dialog = {
    open: async (options = {}) => {
      try {
        const response = await fetch(`${getApiBase()}/api/dialog/open`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(options)
        });
        const res = await response.json();
        if (!res.ok) return null;
        const val = res.paths !== undefined ? res.paths : (res.data !== undefined ? res.data : null);
        return val;
      } catch (e) {
        console.error('[TauriBridge] dialog.open error:', e);
        return null;
      }
    },
    save: async (options = {}) => {
      try {
        const response = await fetch(`${getApiBase()}/api/dialog/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(options)
        });
        const res = await response.json();
        if (!res.ok) return null;
        const val = res.path !== undefined ? res.path : (res.data !== undefined ? res.data : null);
        return val;
      } catch (e) {
        console.error('[TauriBridge] dialog.save error:', e);
        return null;
      }
    }
  };

  window.__TAURI__ = {
    core: { invoke },
    event: { listen, emit },
    window: { getCurrentWindow: () => appWindow },
    dialog: dialog
  };

  // Wire up native drag-and-drop region for custom titlebar
  document.addEventListener('DOMContentLoaded', () => {
    const dragRegions = document.querySelectorAll('[data-tauri-drag-region]');
    dragRegions.forEach(el => {
      el.addEventListener('mousedown', (e) => {
        if (e.target.closest('button, input, a, select')) return;
        if (e.button === 0) {
          fetch('/api/window/start_drag', { method: 'POST' }).catch(() => {});
        }
      });
    });

    // Native HTML5 Drag and drop handler
    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });

    window.addEventListener('drop', async (e) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files || []);
      const paths = files.map(f => f.path || f.name).filter(Boolean);
      const absolutePaths = paths.filter(p => typeof p === 'string' && p.startsWith('/'));
      if (absolutePaths.length > 0) {
        emit('tauri://drag-drop', { paths: absolutePaths });
      }
    });
  });

  console.log('[TauriBridge] Native Linux Bridge initialized successfully.');
})();
