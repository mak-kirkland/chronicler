/**
 * @file Echo suppression for watcher-driven live refresh. A store that
 * writes a file will see its own change come back through the watcher;
 * reloading on that echo would clobber optimistic state. The guard
 * swallows exactly one watcher event per completed write, within a
 * freshness window (a missed watcher event must not suppress a real
 * external change forever).
 */

export interface EchoGuard {
    /** Call after a successful disk write. */
    expectEcho(path: string, now?: number): void;
    /** True = this change is an echo of our own write; swallow it. */
    isEcho(path: string, now?: number): boolean;
}

export function createEchoGuard(windowMs = 5000): EchoGuard {
    const pending = new Map<string, number[]>();
    return {
        expectEcho(path, now = Date.now()) {
            const queue = pending.get(path) ?? [];
            queue.push(now);
            pending.set(path, queue);
        },
        isEcho(path, now = Date.now()) {
            const queue = pending.get(path);
            if (!queue) return false;
            while (queue.length > 0 && now - queue[0] > windowMs) {
                queue.shift();
            }
            if (queue.length === 0) {
                pending.delete(path);
                return false;
            }
            queue.shift();
            if (queue.length === 0) pending.delete(path);
            return true;
        },
    };
}
