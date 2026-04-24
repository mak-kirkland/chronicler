/**
 * @file Canvas-based pin layer for high-density maps.
 *
 * The naive approach — one `L.Marker` per pin — puts a
 * `<div><svg>...</svg></div>` per pin in the DOM, and on maps with
 * thousands of pins WebKit's per-marker SVG repaint cost dominates
 * pan/zoom frames. This layer draws every visible pin to a single shared
 * `<canvas>`, so cost scales with viewport pin count instead of total
 * pin count, and there's no per-pin DOM churn during pan.
 *
 * Includes simple grid-based clustering at low zoom so dense pin sets
 * don't render as a wall of overlapping teardrops.
 *
 * The layer doesn't wire its own DOM event listeners: it just exposes
 * `hitTestAt` so the existing MapView mousemove/click pipeline can ask
 * "is there a pin under this pixel?" alongside its shape spatial query.
 *
 * # Coordinate handling
 *
 * The canvas lives in `overlayPane` (the same pane Leaflet's own
 * vector renderers use) and pins are drawn in **layer-pixel** coords —
 * not container coords. That way, when Leaflet pans the map by
 * translating overlayPane, the canvas (and the pins on it) translate
 * with it for free; we don't redraw on every `move` tick. Zoom is
 * handled via Leaflet's `_animateZoom` hook so the CSS transform
 * matches the animation, then we redraw fresh on `zoomend`.
 */

import L from "leaflet";

const DEFAULT_STROKE = "#000000";
const HIGHLIGHT_STROKE = "#facc15";
const CLUSTER_FILL_OUTER = "rgba(110, 204, 57, 0.6)";
const CLUSTER_FILL_INNER = "rgba(110, 204, 57, 0.85)";

/** Pin data this layer needs to render and hit-test. */
export interface CanvasPin {
    id: string;
    /** Image-pixel X (matches `MapPin.x`). */
    x: number;
    /** Image-pixel Y (matches `MapPin.y`). */
    y: number;
    color: string;
    icon: string;
    invisible: boolean;
}

export type PinHit =
    | { type: "pin"; pinId: string; cx: number; cy: number; radius: number }
    | {
          type: "cluster";
          pinIds: string[];
          cx: number;
          cy: number;
          radius: number;
      };

export interface CanvasPinLayerOptions {
    /**
     * Grid cell size in screen pixels. Pins inside the same cell collapse
     * into a cluster bubble. Higher = more aggressive clustering.
     */
    clusterRadius?: number;
    /**
     * Leaflet zoom at which clustering is disabled and every pin is drawn
     * individually. Below this, pins inside the same `clusterRadius` cell
     * become a single cluster bubble.
     */
    disableClusteringAtZoom?: number;
    /**
     * Padding (in viewport multiples) for the off-screen draw buffer. The
     * canvas is sized to `viewport * (1 + 2*padding)`, so panning within
     * that buffer needs no redraw — it's just the parent pane's CSS
     * translate. 0.2 = 20% extra in each direction.
     */
    padding?: number;
}

/**
 * Custom Leaflet layer that renders pins (and cluster bubbles) to a single
 * shared canvas. See file-level docstring for rationale.
 */
export class CanvasPinLayer extends L.Layer {
    declare _map: L.Map;
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;
    private dpr = 1;
    /** Layer-pixel top-left of the canvas (origin we draw relative to). */
    private originLayerPoint: L.Point = L.point(0, 0);

    private pins: CanvasPin[] = [];
    private highlightedId: string | null = null;
    private hoveredId: string | null = null;
    /** Hit-test entries — coordinates are in **container** pixels. */
    private renderHits: PinHit[] = [];

    private clusterRadius: number;
    private disableClusteringAtZoom: number;
    private padding: number;

    constructor(opts: CanvasPinLayerOptions = {}) {
        super();
        this.clusterRadius = opts.clusterRadius ?? 100;
        this.disableClusteringAtZoom = opts.disableClusteringAtZoom ?? 5;
        this.padding = opts.padding ?? 0.2;
    }

    /** Standard L.Layer override — return the events we want hooked up. */
    getEvents(): { [key: string]: L.LeafletEventHandlerFn } {
        const events: { [key: string]: L.LeafletEventHandlerFn } = {
            viewreset: () => this.reset(),
            // moveend redraws after pan completes — during pan, the canvas
            // is just translated by Leaflet's overlayPane transform.
            moveend: () => this.reset(),
            zoomend: () => this.reset(),
            resize: () => this.reset(),
        };
        // Plain `_zoomAnimated` is set true on a layer to opt into
        // Leaflet's zoom-anim CSS transform pipeline.
        if ((this as unknown as { _zoomAnimated: boolean })._zoomAnimated) {
            events.zoomanim = (e) =>
                this.handleZoomAnim(e as L.ZoomAnimEvent);
        }
        return events;
    }

    onAdd(map: L.Map): this {
        this._map = map;
        this.dpr = window.devicePixelRatio || 1;

        const canvas = L.DomUtil.create(
            "canvas",
            "leaflet-canvas-pin-layer leaflet-zoom-animated",
        ) as HTMLCanvasElement;
        canvas.style.position = "absolute";
        canvas.style.pointerEvents = "none";
        canvas.style.willChange = "transform";

        // overlayPane: same pane Leaflet's vector renderers use. Gets
        // translated during pan and CSS-transformed during zoom anim.
        map.getPanes().overlayPane.appendChild(canvas);
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");

        // L.Layer._layerAdd has already set `_zoomAnimated` from
        // `map._zoomAnimated` before getEvents was called, so the
        // zoomanim hook in getEvents is wired up automatically when the
        // map has animations enabled (the default).

        this.reset();
        return this;
    }

    onRemove(_map: L.Map): this {
        if (this.canvas) {
            L.DomUtil.remove(this.canvas);
            this.canvas = null;
            this.ctx = null;
        }
        this.renderHits = [];
        return this;
    }

    /** Replace the pin set and redraw. */
    setPins(pins: CanvasPin[]): void {
        this.pins = pins;
        this.reset();
    }

    /** Set the "highlighted" pin (typically driven by console hover). */
    setHighlight(id: string | null): void {
        if (this.highlightedId === id) return;
        this.highlightedId = id;
        this.render();
    }

    /** Set the currently-hovered pin (caller controls; we just style it). */
    setHover(id: string | null): void {
        if (this.hoveredId === id) return;
        this.hoveredId = id;
        this.render();
    }

    /**
     * Returns the pin or cluster (if any) under the given map-container
     * pixel coords. Used by MapView's mousemove/click pipeline.
     */
    hitTestAt(containerX: number, containerY: number): PinHit | null {
        let best: PinHit | null = null;
        let bestD = Infinity;
        for (const hit of this.renderHits) {
            const dx = containerX - hit.cx;
            const dy = containerY - hit.cy;
            const d = dx * dx + dy * dy;
            const r = hit.radius;
            if (d <= r * r && d < bestD) {
                best = hit;
                bestD = d;
            }
        }
        return best;
    }

    /**
     * Returns container-pixel coords of a pin, or null if it isn't
     * currently in the pin set / map isn't mounted. Useful for positioning
     * hover preview popups against a virtual marker.
     */
    getPinContainerCoords(id: string): { x: number; y: number } | null {
        if (!this._map) return null;
        const pin = this.pins.find((p) => p.id === id);
        if (!pin) return null;
        const point = this._map.latLngToContainerPoint([pin.y, pin.x]);
        return { x: point.x, y: point.y };
    }

    /**
     * Resize and reposition the canvas to cover the padded viewport at
     * the current zoom, then redraw pin geometry into it.
     */
    private reset(): void {
        if (!this.canvas || !this.ctx || !this._map) return;
        const map = this._map;
        const size = map.getSize();
        const padX = size.x * this.padding;
        const padY = size.y * this.padding;

        // Top-left of the canvas in **container** coords (pre-pad), then
        // converted to layer coords for placement on overlayPane.
        const containerTL = L.point(-padX, -padY);
        const layerTL = map.containerPointToLayerPoint(containerTL).round();
        L.DomUtil.setPosition(this.canvas, layerTL);
        this.originLayerPoint = layerTL;

        const w = Math.ceil(size.x + 2 * padX);
        const h = Math.ceil(size.y + 2 * padY);
        const dprW = w * this.dpr;
        const dprH = h * this.dpr;
        if (this.canvas.width !== dprW || this.canvas.height !== dprH) {
            this.canvas.width = dprW;
            this.canvas.height = dprH;
        }
        this.canvas.style.width = `${w}px`;
        this.canvas.style.height = `${h}px`;
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

        this.render();
    }

    private render(): void {
        if (!this.canvas || !this.ctx || !this._map) return;
        const ctx = this.ctx;
        const cssW = this.canvas.width / this.dpr;
        const cssH = this.canvas.height / this.dpr;
        ctx.clearRect(0, 0, cssW, cssH);

        const map = this._map;
        const zoom = map.getZoom();
        const useCluster =
            this.clusterRadius > 0 && zoom < this.disableClusteringAtZoom;
        const hits: PinHit[] = [];

        // Precompute layer-pixel positions for every pin. Using layer
        // pixels (which are world-anchored per zoom level) — not
        // canvas-local pixels — is what makes cluster cells stable
        // across pans: the same pin always falls into the same cell,
        // and the centroid we compute from cell members doesn't shift
        // when we pan the viewport.
        const pinLP: { pin: CanvasPin; lpx: number; lpy: number }[] = [];
        for (const pin of this.pins) {
            const lp = map.latLngToLayerPoint([pin.y, pin.x]);
            pinLP.push({ pin, lpx: lp.x, lpy: lp.y });
        }

        // Layer-pixel bounds of the canvas's draw region, padded by the
        // pin's max draw extent past its anchor point so a pin whose tip
        // sits just inside the canvas still gets fully drawn (body extends
        // ~3r above the tip with r=16 → 48px headroom is enough).
        const padX = 32;
        const padY = 48;
        const minLPX = this.originLayerPoint.x - padX;
        const maxLPX = this.originLayerPoint.x + cssW + padX;
        const minLPY = this.originLayerPoint.y - padY;
        const maxLPY = this.originLayerPoint.y + cssH + padY;

        // mapPanePos converts layer pixels → container pixels for hit-test.
        const mapPanePos = map.containerPointToLayerPoint([0, 0]);

        if (useCluster) {
            // Bucket ALL pins (not just visible ones) into world-anchored
            // grid cells, and compute each cluster's centroid from the
            // full bucket. That way the centroid is a pure function of
            // (zoom, pin set) — pan can't change it.
            const cellSize = this.clusterRadius;
            const cells = new Map<
                string,
                { pins: { pin: CanvasPin; lpx: number; lpy: number }[] }
            >();
            for (const sp of pinLP) {
                const ck = `${Math.floor(sp.lpx / cellSize)}|${Math.floor(sp.lpy / cellSize)}`;
                let bucket = cells.get(ck);
                if (!bucket) {
                    bucket = { pins: [] };
                    cells.set(ck, bucket);
                }
                bucket.pins.push(sp);
            }
            for (const bucket of cells.values()) {
                if (bucket.pins.length === 1) {
                    const sp = bucket.pins[0];
                    if (
                        sp.lpx < minLPX ||
                        sp.lpx > maxLPX ||
                        sp.lpy < minLPY ||
                        sp.lpy > maxLPY
                    )
                        continue;
                    const cx = sp.lpx - this.originLayerPoint.x;
                    const cy = sp.lpy - this.originLayerPoint.y;
                    this.drawPin(sp.pin, cx, cy);
                    hits.push({
                        type: "pin",
                        pinId: sp.pin.id,
                        // Hit-test center is the pin's vertical midpoint, not
                        // its tip — drawPin anchors at the tip but the body
                        // extends ~48px upward, so a tip-centered circle
                        // would only catch hovers near the bottom.
                        cx: sp.lpx - mapPanePos.x,
                        cy: sp.lpy - mapPanePos.y - 24,
                        radius: 28,
                    });
                } else {
                    let lpx = 0;
                    let lpy = 0;
                    for (const b of bucket.pins) {
                        lpx += b.lpx;
                        lpy += b.lpy;
                    }
                    lpx /= bucket.pins.length;
                    lpy /= bucket.pins.length;
                    if (
                        lpx < minLPX ||
                        lpx > maxLPX ||
                        lpy < minLPY ||
                        lpy > maxLPY
                    )
                        continue;
                    const cx = lpx - this.originLayerPoint.x;
                    const cy = lpy - this.originLayerPoint.y;
                    this.drawCluster(cx, cy, bucket.pins.length);
                    hits.push({
                        type: "cluster",
                        pinIds: bucket.pins.map((b) => b.pin.id),
                        cx: lpx - mapPanePos.x,
                        cy: lpy - mapPanePos.y,
                        radius: this.clusterIconRadius(bucket.pins.length),
                    });
                }
            }
        } else {
            for (const sp of pinLP) {
                if (
                    sp.lpx < minLPX ||
                    sp.lpx > maxLPX ||
                    sp.lpy < minLPY ||
                    sp.lpy > maxLPY
                )
                    continue;
                const cx = sp.lpx - this.originLayerPoint.x;
                const cy = sp.lpy - this.originLayerPoint.y;
                this.drawPin(sp.pin, cx, cy);
                hits.push({
                    type: "pin",
                    pinId: sp.pin.id,
                    // See cluster-branch comment above re: tip vs midpoint.
                    cx: sp.lpx - mapPanePos.x,
                    cy: sp.lpy - mapPanePos.y - 24,
                    radius: 28,
                });
            }
        }

        this.renderHits = hits;
    }

    /**
     * Mirror Leaflet's vector renderer behavior during a zoom animation:
     * apply a CSS transform that scales the canvas content to the target
     * zoom and offsets it so it stays visually anchored. We then redraw
     * fresh on `zoomend`.
     */
    private handleZoomAnim(e: L.ZoomAnimEvent): void {
        if (!this.canvas || !this._map) return;
        const map = this._map as L.Map & {
            _latLngToNewLayerPoint: (
                latlng: L.LatLng,
                zoom: number,
                center: L.LatLng,
            ) => L.Point;
        };
        const scale = map.getZoomScale(e.zoom, map.getZoom());
        // The new layer-pixel position of where our canvas's top-left
        // (originLayerPoint at the current zoom) will land at `e.zoom`.
        const newOrigin = map._latLngToNewLayerPoint(
            map.layerPointToLatLng(this.originLayerPoint),
            e.zoom,
            e.center,
        );
        L.DomUtil.setTransform(this.canvas, newOrigin, scale);
    }

    private drawPin(pin: CanvasPin, cx: number, cy: number): void {
        const ctx = this.ctx!;
        const isHighlighted =
            pin.id === this.highlightedId || pin.id === this.hoveredId;

        // Match the old SVG marker: 32px wide × 48px tall body, scaled
        // 1.3× when highlighted. Anchor (cx, cy) is the pin tip — same
        // anchor point Leaflet's L.marker icons used (`iconAnchor: [16, 48]`).
        const scale = isHighlighted ? 1.3 : 1;
        const r = 16 * scale; // body radius
        const bodyCY = cy - r * 2; // body center; total height ≈ 3r

        ctx.save();
        if (pin.invisible) ctx.globalAlpha = 0.45;

        // Build the teardrop as one continuous path: top arc rounds back
        // to where the body meets the tip on each side, then straight
        // lines down to the tip. Single path → single anti-aliased
        // outline, no seam between body and tip.
        //
        // `tangentAngle` is where the body circle meets the tip lines.
        // π/3 (60° from horizontal) gives a profile close to the
        // original SVG's curve.
        const tangentAngle = Math.PI / 3;
        const sin = Math.sin(tangentAngle);
        const cos = Math.cos(tangentAngle);
        const rightMeetX = cx + r * cos;
        const meetY = bodyCY + r * sin;
        const leftMeetX = cx - r * cos;

        ctx.beginPath();
        ctx.moveTo(rightMeetX, meetY);
        ctx.lineTo(cx, cy);
        ctx.lineTo(leftMeetX, meetY);
        // Arc from left meet over the top back to right meet. The path
        // so far winds clockwise on screen, so the closing arc must too:
        // from angle π - tangentAngle (left meet) → over the top → to
        // tangentAngle (right meet). With anticlockwise=false, canvas
        // wraps the ending angle by 2π, sweeping the long way round.
        ctx.arc(
            cx,
            bodyCY,
            r,
            Math.PI - tangentAngle,
            tangentAngle,
            false,
        );
        ctx.closePath();

        ctx.fillStyle = pin.color;
        ctx.fill();
        ctx.lineWidth = isHighlighted ? 2 : 1.5;
        ctx.strokeStyle = isHighlighted ? HIGHLIGHT_STROKE : DEFAULT_STROKE;
        ctx.stroke();

        // Emoji centered in the body. Old SVG used 14px font in a
        // 24-unit viewBox rendered at 32px → ~18px font in actual
        // pixels; scale matches the old highlighted size too.
        ctx.fillStyle = "#000";
        ctx.font = `${Math.round(18 * scale)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(pin.icon, cx, bodyCY + 1);

        ctx.restore();
    }

    private clusterIconRadius(count: number): number {
        if (count >= 100) return 24;
        if (count >= 10) return 20;
        return 16;
    }

    private drawCluster(cx: number, cy: number, count: number): void {
        const ctx = this.ctx!;
        const r = this.clusterIconRadius(count);
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, 2 * Math.PI);
        ctx.fillStyle = CLUSTER_FILL_OUTER;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.7, 0, 2 * Math.PI);
        ctx.fillStyle = CLUSTER_FILL_INNER;
        ctx.fill();
        ctx.fillStyle = "#000";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(count), cx, cy + 1);
        ctx.restore();
    }
}
