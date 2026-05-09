/**
 * @file Frontend logging facade. Routes log lines through the
 * `log_from_frontend` Tauri command so they land in the same rolling
 * `chronicler.log` the backend writes to.
 */

import { invoke } from "@tauri-apps/api/core";

type Level = "error" | "warn" | "info" | "debug";

// Crude circuit breaker: if a render loop or event handler ever starts
// firing log calls in a tight loop, we don't want to (a) flood the IPC
// channel or (b) blow up the user's disk. 200/min is far above any
// reasonable steady-state and well below pathological.
const MAX_PER_MINUTE = 200;
let windowStart = Date.now();
let recentCount = 0;

function send(level: Level, message: string, context?: string): void {
    const now = Date.now();
    if (now - windowStart > 60_000) {
        windowStart = now;
        recentCount = 0;
    }
    if (++recentCount > MAX_PER_MINUTE) return;

    if (import.meta.env.DEV) {
        const consoleMethod = level === "debug" ? "log" : level;
        console[consoleMethod](context ? `[${context}] ${message}` : message);
    }

    // Logging failure is not actionable from inside the logger - swallow it
    // to avoid a feedback loop. Note we deliberately call the raw Tauri
    // invoke here rather than the wrapped one in commands.ts, since that
    // wrapper itself calls back into log.error on failure.
    invoke("log_from_frontend", { level, message, context }).catch(() => {});
}

function fmt(err: unknown): string {
    if (err instanceof Error) {
        return `${err.name}: ${err.message}${err.stack ? `\n${err.stack}` : ""}`;
    }
    if (typeof err === "string") return err;
    try {
        return JSON.stringify(err);
    } catch {
        return String(err);
    }
}

export const log = {
    error: (msg: string, err?: unknown, context?: string): void =>
        send("error", err !== undefined ? `${msg} | ${fmt(err)}` : msg, context),
    warn: (msg: string, context?: string): void => send("warn", msg, context),
    info: (msg: string, context?: string): void => send("info", msg, context),
    debug: (msg: string, context?: string): void => send("debug", msg, context),
};
