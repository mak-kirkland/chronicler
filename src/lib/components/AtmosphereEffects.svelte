<script lang="ts">
    import { onMount } from "svelte";
    import { atmosphere } from "$lib/settingsStore";

    // Particle interface
    interface Particle {
        id: number;
        x: number;
        y: number;
        vx: number;
        vy: number;
        life: number; // 0 to 1
        size: number;
        color: string;
        type: "ink" | "spark" | "dust";
    }

    let particles = $state<Particle[]>([]);
    let nextId = 0;
    let frameId: number;

    const COLORS = {
        fantasy: ["#2F4F4F", "#8B4513", "#000000"], // Ink colors
        scifi: ["#00ffcc", "#ff00ff", "#ffffff"], // Neon colors
    };

    function spawnParticles(
        x: number,
        y: number,
        count: number,
        style: string,
    ) {
        const newParticles: Particle[] = [];

        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 2 + 1;

            if (style === "fantasy-pack") {
                // Ink splatters
                newParticles.push({
                    id: nextId++,
                    x,
                    y,
                    vx: Math.cos(angle) * speed * 0.5,
                    vy: Math.sin(angle) * speed * 0.5,
                    life: 1.0,
                    size: Math.random() * 8 + 4,
                    color: COLORS.fantasy[
                        Math.floor(Math.random() * COLORS.fantasy.length)
                    ],
                    type: "ink",
                });
            } else if (style === "scifi-pack") {
                // Digital sparks (faster, rectilinear)
                newParticles.push({
                    id: nextId++,
                    x,
                    y,
                    vx: (Math.random() - 0.5) * 5,
                    vy: (Math.random() - 0.5) * 5,
                    life: 1.0,
                    size: Math.random() * 4 + 2,
                    color: COLORS.scifi[
                        Math.floor(Math.random() * COLORS.scifi.length)
                    ],
                    type: "spark",
                });
            }
        }

        particles = [...particles, ...newParticles];
    }

    function updateParticles() {
        if (particles.length === 0) {
            frameId = requestAnimationFrame(updateParticles);
            return;
        }

        particles = particles
            .map((p) => {
                p.x += p.vx;
                p.y += p.vy;
                p.life -= 0.02; // Fade out

                // Gravity/Physics tweaks
                if (p.type === "ink") {
                    p.size *= 0.95; // Shrink
                }

                return p;
            })
            .filter((p) => p.life > 0);

        frameId = requestAnimationFrame(updateParticles);
    }

    function handleClick(e: MouseEvent) {
        const style = $atmosphere.clickEffects;
        if (style === "core") return;
        spawnParticles(e.clientX, e.clientY, 5, style);
    }

    function handleKeydown(e: KeyboardEvent) {
        const style = $atmosphere.clickEffects;
        if (style === "core") return;

        // Try to find the cursor position roughly based on the active element
        const active = document.activeElement;
        if (active) {
            const rect = active.getBoundingClientRect();
            // Spawn random particles near the element being typed in
            // Ideally we'd use a caret coordinator, but random near the box is a good enough effect for "atmosphere"
            const x = rect.left + Math.random() * Math.min(rect.width, 200);
            const y = rect.top + rect.height / 2;
            spawnParticles(x, y, 2, style);
        }
    }

    onMount(() => {
        window.addEventListener("click", handleClick);
        window.addEventListener("keydown", handleKeydown);
        frameId = requestAnimationFrame(updateParticles);

        return () => {
            window.removeEventListener("click", handleClick);
            window.removeEventListener("keydown", handleKeydown);
            cancelAnimationFrame(frameId);
        };
    });
</script>

<div class="effects-layer">
    {#each particles as p (p.id)}
        <div
            class="particle {p.type}"
            style="
                left: {p.x}px;
                top: {p.y}px;
                width: {p.size}px;
                height: {p.size}px;
                background-color: {p.color};
                opacity: {p.type === 'ink' ? p.life : p.life * 0.8};
                transform: translate(-50%, -50%) rotate({p.vx * 10}deg);
            "
        ></div>
    {/each}
</div>

<style>
    .effects-layer {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 9999;
        overflow: hidden;
    }
    .particle {
        position: absolute;
        border-radius: 50%;
        will-change: transform, opacity;
    }
    .particle.spark {
        border-radius: 0; /* Squares for sci-fi */
        box-shadow: 0 0 4px currentColor;
    }
</style>
