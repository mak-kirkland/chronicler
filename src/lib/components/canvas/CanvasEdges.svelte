<script lang="ts">
    import type { CanvasData, CanvasNodeData } from "$lib/canvasModels";

    let { canvas, selectedEdgeId = null, onEdgeSelect, onEdgeLabel } = $props<{
        canvas: CanvasData;
        selectedEdgeId?: string | null;
        onEdgeSelect?: (id: string) => void;
        onEdgeLabel?: (id: string) => void;
    }>();

    const byId = $derived(
        new Map<string, CanvasNodeData>(canvas.nodes.map((n: CanvasNodeData) => [n.id, n])),
    );

    function center(n: CanvasNodeData) {
        return { x: n.x + n.width / 2, y: n.y + n.height / 2 };
    }

    function geom(fromId: string, toId: string) {
        const a = byId.get(fromId);
        const b = byId.get(toId);
        if (!a || !b) return null;
        const p = center(a);
        const q = center(b);
        const mx = (p.x + q.x) / 2;
        return {
            d: `M ${p.x} ${p.y} C ${mx} ${p.y}, ${mx} ${q.y}, ${q.x} ${q.y}`,
            lx: (p.x + q.x) / 2,
            ly: (p.y + q.y) / 2,
        };
    }
</script>

<svg class="edge-layer">
    <defs>
        <marker
            id="canvas-arrow"
            markerWidth="9"
            markerHeight="9"
            refX="7"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
        >
            <path d="M0,0 L6,3 L0,6 z" fill="var(--color-accent-primary)" />
        </marker>
    </defs>
    {#each canvas.edges as edge (edge.id)}
        {@const g = geom(edge.fromNode, edge.toNode)}
        {#if g}
            <path
                d={g.d}
                class="edge-hit"
                fill="none"
                role="button"
                tabindex="-1"
                aria-label="connection"
                onclick={() => onEdgeSelect?.(edge.id)}
                ondblclick={() => onEdgeLabel?.(edge.id)}
                onkeydown={(e) => {
                    if (e.key === "Enter" || e.key === " ") onEdgeSelect?.(edge.id);
                    if (e.key === "F2") onEdgeLabel?.(edge.id);
                }}
            />
            <path
                d={g.d}
                class="edge"
                class:selected={edge.id === selectedEdgeId}
                fill="none"
                marker-end="url(#canvas-arrow)"
            />
            {#if edge.label}
                <text class="edge-label" x={g.lx} y={g.ly}>{edge.label}</text>
            {/if}
        {/if}
    {/each}
</svg>

<style>
    .edge-layer {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        overflow: visible;
        pointer-events: none;
    }
    .edge {
        stroke: var(--color-accent-primary);
        stroke-width: 2;
        vector-effect: non-scaling-stroke;
    }
    .edge.selected {
        stroke-width: 3.5;
    }
    .edge-hit {
        stroke: transparent;
        stroke-width: 14;
        pointer-events: stroke;
        cursor: pointer;
    }
    .edge-label {
        fill: var(--color-text-primary);
        font-size: 12px;
        text-anchor: middle;
        paint-order: stroke;
        stroke: var(--color-background-primary);
        stroke-width: 3px;
    }
</style>
