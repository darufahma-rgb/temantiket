type SyncEvent = {
  type: "trips" | "packages" | "jamaah" | "docs";
  action: "create" | "update" | "delete";
  id?: string;
};

type SyncListener = (event: SyncEvent) => void;

const CHANNEL_NAME = "igh-tour-sync-v1";

class SyncBus {
  private channel: BroadcastChannel | null = null;
  private listeners: SyncListener[] = [];

  constructor() {
    if (typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.onmessage = (e) => {
        this.listeners.forEach((fn) => fn(e.data as SyncEvent));
      };
    }
  }

  emit(event: SyncEvent) {
    this.channel?.postMessage(event);
  }

  on(listener: SyncListener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }
}

export const syncBus = new SyncBus();
