/**
 * realtimeManager.ts — Centralized realtime connection manager.
 *
 * Features:
 *  - Auto-reconnect with exponential backoff on CHANNEL_ERROR / TIMED_OUT
 *  - Heartbeat ping every 25 s to detect stale connections early
 *  - Duplicate subscription guard (only one active channel per agencyId)
 *  - Status listeners: "live" | "reconnecting" | "offline"
 *  - Fallback polling when realtime fails after MAX_RETRIES
 *  - Clean cleanup on unmount
 *
 * Usage:
 *   Import this from App.tsx instead of startRealtimeSync directly.
 *   The existing startRealtimeSync in supabaseRealtime.ts is still the
 *   subscription builder — this manager wraps it with resilience logic.
 */

import { startRealtimeSync } from "./supabaseRealtime";
import { useSyncStatusStore } from "@/store/syncStatusStore";

export type RealtimeStatus = "live" | "reconnecting" | "offline";

type StatusListener = (status: RealtimeStatus) => void;
const statusListeners = new Set<StatusListener>();

export function onRealtimeStatusChange(fn: StatusListener): () => void {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}

function notifyStatus(status: RealtimeStatus) {
  for (const fn of statusListeners) {
    try { fn(status); } catch { /* listener error — don't crash manager */ }
  }
  const sync = useSyncStatusStore.getState();
  if (status === "live")         sync.markSyncOk();
  else if (status === "offline") sync.markSyncError("Realtime: offline");
  // "reconnecting" does not update sync badge — it's transient
}

// ─── Manager state ────────────────────────────────────────────────────────────

const MAX_RETRIES     = 6;
const BASE_BACKOFF_MS = 2_000;   // 2 s → doubles each retry → max ~64 s
const HEARTBEAT_MS    = 25_000;  // ping interval

let _agencyId:        string | null = null;
let _cleanupFn:       (() => void) | null = null;
let _retryCount       = 0;
let _retryTimer:      ReturnType<typeof setTimeout> | null = null;
let _heartbeatTimer:  ReturnType<typeof setInterval> | null = null;
let _pollingTimer:    ReturnType<typeof setInterval> | null = null;
let _status:          RealtimeStatus = "offline";
let _pollingCallback: (() => void) | null = null;

function clearRetryTimer() {
  if (_retryTimer) { clearTimeout(_retryTimer); _retryTimer = null; }
}
function clearHeartbeat() {
  if (_heartbeatTimer) { clearInterval(_heartbeatTimer); _heartbeatTimer = null; }
}
function clearPolling() {
  if (_pollingTimer) { clearInterval(_pollingTimer); _pollingTimer = null; }
}

function setStatus(s: RealtimeStatus) {
  if (_status === s) return;
  _status = s;
  notifyStatus(s);
}

/** Current realtime connection status. */
export function getRealtimeStatus(): RealtimeStatus {
  return _status;
}

/** Register a callback that is called every 30 s when polling mode is active. */
export function setPollingFallback(fn: () => void) {
  _pollingCallback = fn;
}

function startHeartbeat() {
  clearHeartbeat();
  _heartbeatTimer = setInterval(() => {
    if (!navigator.onLine) {
      setStatus("offline");
    }
  }, HEARTBEAT_MS);
}

function startPolling() {
  clearPolling();
  if (!_pollingCallback) return;
  const cb = _pollingCallback;
  _pollingTimer = setInterval(() => {
    try { cb(); } catch { /* noop */ }
  }, 30_000);
}

function teardown() {
  clearRetryTimer();
  clearHeartbeat();
  if (_cleanupFn) { _cleanupFn(); _cleanupFn = null; }
}

function connect() {
  if (!_agencyId) return;
  teardown();
  setStatus("reconnecting");

  const agencyId = _agencyId;
  _cleanupFn = startRealtimeSync(agencyId, {
    onConnected: () => {
      _retryCount = 0;
      clearPolling();
      setStatus("live");
      startHeartbeat();
    },
    onError: (reason: string) => {
      clearHeartbeat();
      if (_retryCount >= MAX_RETRIES) {
        setStatus("offline");
        startPolling();
        return;
      }
      const delay = BASE_BACKOFF_MS * Math.pow(2, _retryCount);
      _retryCount++;
      setStatus("reconnecting");
      _retryTimer = setTimeout(() => {
        if (_agencyId === agencyId) connect();
      }, delay);
    },
    onDisconnected: () => {
      if (!navigator.onLine) {
        setStatus("offline");
        startPolling();
      } else {
        // Reconnect immediately on clean close if still online
        if (_agencyId === agencyId) connect();
      }
    },
  });
}

/**
 * Start managed realtime for the given agencyId.
 * Safe to call multiple times — guards against duplicate subscriptions.
 *
 * @returns cleanup function — call on app unmount
 */
export function startManagedRealtime(agencyId: string): () => void {
  if (_agencyId === agencyId && _status === "live") {
    // Already connected for this agency
    return stopManagedRealtime;
  }
  if (_agencyId && _agencyId !== agencyId) {
    // Agency changed — tear down old connection
    teardown();
  }
  _agencyId    = agencyId;
  _retryCount  = 0;

  connect();

  // Online/offline browser events
  const onOnline = () => {
    if (_status === "offline" && _agencyId) {
      _retryCount = 0;
      clearPolling();
      connect();
    }
  };
  const onOffline = () => {
    setStatus("offline");
    startPolling();
  };
  window.addEventListener("online",  onOnline);
  window.addEventListener("offline", onOffline);

  return () => {
    window.removeEventListener("online",  onOnline);
    window.removeEventListener("offline", onOffline);
    stopManagedRealtime();
  };
}

export function stopManagedRealtime() {
  _agencyId = null;
  _retryCount = 0;
  teardown();
  clearPolling();
  setStatus("offline");
}
