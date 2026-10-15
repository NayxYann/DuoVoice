// One startup session, one attempt at a time. Discovery and native connection
// arbitration stay in Rust so tray actions cannot race a pending auto-connect.
export function createStartupFavorites({ enabled, favorites, discover, connect, onError = () => {}, now = Date.now }) {
  let stopped = !enabled();
  let busy = false;
  const attempts = new Map();
  return {
    get active() { return !stopped; },
    stop() { stopped = true; },
    async tick() {
      if (stopped || busy) return;
      if (!enabled()) { stopped = true; return; }
      busy = true;
      try {
        const peers = await discover();
        if (stopped || !enabled()) return;
        const available = new Set(peers.map(peer => peer.address));
        // Stored order is intentional: simultaneous discoveries must not select
        // a different peer merely because UDP replies arrived in another order.
        const address = favorites().map(favorite => favorite.address).find(address => {
          const attempt = attempts.get(address);
          return available.has(address) && (!attempt || (attempt.count < 3 && now() >= attempt.next));
        });
        if (!address) return;
        try {
          const result = await connect(address);
          // null means discovery expired; false means manual action disarmed
          // startup; true means the local audio connection was started.
          if (result !== null) stopped = true;
        } catch (error) {
          const count = (attempts.get(address)?.count || 0) + 1;
          attempts.set(address, { count, next: now() + (count === 1 ? 5000 : 15000) });
          if (!stopped && enabled()) onError(error, count === 3);
        }
      } catch {
        // Discovery can be temporarily unavailable during network initialization.
        // Keep waiting without reporting a connection failure or consuming retries.
      } finally {
        busy = false;
      }
    },
  };
}
