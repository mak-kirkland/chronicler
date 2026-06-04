<script lang="ts">
    import type { CanvasData, CanvasEdge, CanvasNodeData } from "$lib/canvasModels";
    import { edgeGeometry } from "$lib/canvasViewport";
    import { colorToCss } from "$lib/canvasColors";
    import { t } from "$lib/i18n";

    let { canvas, selectedEdgeId = null, onEdgeSelect, onEdgeLabel } = $props<{
        canvas: CanvasData;
        selectedEdgeId?: string | null;
        onEdgeSelect?: (id: string) => void;
        onEdgeLabel?: (id: string) => void;
    }>();

    const byId = $derived(
        new Map<string, CanvasNodeData>(canvas.nodes.map((n: CanvasNodeData) => [n.id, n])),
    );

    // Distinct edge colors in use — each needs its own arrowhead marker
    // (marker fill can't inherit the path's stroke portably).
    const edgeColors = $derived<string[]>(
        Array.from(
            new Set<string>(
                canvas.edges
                    .map((e: CanvasEdge) => colorToCss(e.color))
                    .filter((c: string | null): c is string => !!c),
            ),
        ),
    );

    function markerId(color: string): string {
        return `canvas-arrow-${color.replace(/[^a-zA-Z0-9]/g, "")}`;
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
        {#each edgeColors as c (c)}
            <marker
                id={markerId(c)}
                markerWidth="9"
                markerHeight="9"
                refX="7"
                refY="3"
                orient="auto"
                markerUnits="strokeWidth"
            >
                <path d="M0,0 L6,3 L0,6 z" fill={c} />
            </marker>
        {/each}
    </defs>
    {#each canvas.edges as edge (edge.id)}
        {@const a = byId.get(edge.fromNode)}
        {@const b = byId.get(edge.toNode)}
        {#if a && b}
            {@const g = edgeGeometry(a, b, edge.fromSide, edge.toSide)}
            {@const stroke = colorToCss(edge.color)}
            <path
                d={g.d}
                class="edge-hit"
                fill="none"
                role="button"
                tabindex="-1"
                aria-label={$t("canvas.connection")}
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
                style={stroke ? `stroke:${stroke}` : ""}
                fill="none"
                marker-end={stroke ? `url(#${markerId(stroke)})` : "url(#canvas-arrow)"}
            />
            {#if edge.label}
                <text class="edge-label" x={g.labelX} y={g.labelY}>{edge.label}</text>
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
