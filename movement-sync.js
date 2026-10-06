// Limit optimistic movement to a few acknowledged steps. No timers or retries:
// after network delay, movement resumes at its normal cadence instead of bursting.
(function(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ValadaresMovementSync = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    class MovementSync {
        constructor() { this.disconnect(); this.corrections = 0; this.lastReason = null; }
        disconnect() {
            this.ready = false; this.enabled = false; this.epoch = 0;
            this.seq = 0; this.pending = new Set(); this.limit = 4;
        }
        reset(config) {
            this.ready = true;
            this.enabled = config?.v === 1 && Number.isSafeInteger(config.epoch) && config.epoch > 0;
            this.epoch = this.enabled ? config.epoch : 0;
            this.seq = 0; this.pending.clear();
            this.limit = this.enabled ? Math.min(4, Math.max(1, config.window || 4)) : 4;
        }
        canMove() { return this.ready && (!this.enabled || this.pending.size < this.limit); }
        step(x, y, dir, floor, respawn = false) {
            // Death has one existing server-authorized reconciliation step. Keep it
            // ordered after pending moves; it is not a normal held-key movement.
            if (!this.ready || (!respawn && !this.canMove())) return null;
            const msg = { t:'pos', x, y, dir };
            if (this.enabled) {
                msg.seq = ++this.seq; msg.epoch = this.epoch; msg.floor = floor || 0;
                if (respawn) msg.respawn = true;
                this.pending.add(msg.seq);
            }
            return msg;
        }
        ack(msg) {
            if (!this.enabled || msg.epoch !== this.epoch || !Number.isSafeInteger(msg.seq) || msg.seq > this.seq) return;
            for (const seq of this.pending) if (seq <= msg.seq) this.pending.delete(seq);
        }
        correct(msg) {
            if (this.enabled && (!msg.movement || msg.movement.epoch <= this.epoch)) return false;
            this.corrections++; this.lastReason = msg.reason || 'legacy';
            this.reset(msg.movement);
            return true;
        }
        diagnostics() {
            return { version:this.enabled ? 1 : 0, ready:this.ready, pending:this.pending.size,
                corrections:this.corrections, lastReason:this.lastReason };
        }
    }
    return { MovementSync };
});
