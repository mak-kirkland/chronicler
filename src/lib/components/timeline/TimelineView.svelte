<script lang="ts">
    import type { PageHeader } from "$lib/bindings";
    import type {
        TimelineData,
        TimelineViewportState,
    } from "$lib/timelineModels";
    import {
        loadTimelineData,
        loadedTimelines,
        updateTimeline,
    } from "$lib/timelineStore";
    import { loadVaultCalendars, resolveCalendar } from "$lib/calendarStore";
    import { compileCalendar, type CompiledCalendar } from "$lib/calendar";
    import { GREGORIAN } from "$lib/calendarPresets";
    import { zoomAbout, panByPixels, fitToEvents } from "$lib/timelineViewport";
    import { hasTimelinesEntitlement } from "$lib/licenseStore";
    import { createHistory } from "$lib/canvasHistory";
    import { LANE_GUTTER_PX } from "$lib/timelineLayout";
    import { normalizePath } from "$lib/utils";
    import { log } from "$lib/logger";
    import { t, translate } from "$lib/i18n";
    import { openModal, closeModal } from "$lib/modalStore";
    import * as M from "$lib/timelineMutations";
    import type { TimelineEvent } from "$lib/timelineModels";
    import { navigateToPageByTitle } from "$lib/actions";
    import { pagePathLookup } from "$lib/worldStore";
    import { areLinkPreviewsEnabled } from "$lib/settingsStore";
    import TimelineAxis from "./TimelineAxis.svelte";
    import TimelineLanes from "./TimelineLanes.svelte";
    import EventModal from "./EventModal.svelte";
    import CalendarEditorModal from "./CalendarEditorModal.svelte";
    import ViewHeader from "$lib/components/views/ViewHeader.svelte";
    import TextInputModal from "$lib/components/modals/TextInputModal.svelte";
    import ColorSwatchRow from "./ColorSwatchRow.svelte";
    import ErrorBox from "$lib/components/ui/ErrorBox.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import ContextMenu from "$lib/components/ui/ContextMenu.svelte";
    import LinkPreview from "$lib/components/ui/LinkPreview.svelte";

    let { data, isActive = true } = $props<{
        data: PageHeader | null;
        isActive?: boolean;
    }>();

    const path = $derived(data ? normalizePath(data.path) : "");

    let containerEl = $state<HTMLDivElement | null>(null);
    let widthPx = $state(800);
    let viewport = $state<TimelineViewportState>({
        centerSerial: 0,
        daysPerPixel: 1,
    });
    let cursorX = $state<number | null>(null);
    let calendarsLoaded = $state(false);
    let loadError = $state<string | null>(null);
    let selectedId = $state<string | null>(null);

    /** Serial<->pixel math uses the track width (view minus label gutter). */
    const trackWidth = $derived(Math.max(widthPx - LANE_GUTTER_PX, 100));

    // Undo/redo is keyboard-driven (Ctrl+Z / Ctrl+Shift+Z) — no buttons.
    const history = createHistory<TimelineData>(100);

    const timeline = $derived<TimelineData | null>(
        $loadedTimelines.get(path)?.data ?? null,
    );

    /** Compiled calendar + whether we had to fall back to Gregorian. */
    const compiled = $derived.by<{
        cal: CompiledCalendar;
        fallback: boolean;
    } | null>(() => {
        if (!timeline || !calendarsLoaded) return null;
        const def = resolveCalendar(timeline.calendarId);
        try {
            if (def) return { cal: compileCalendar(def), fallback: false };
        } catch (e) {
            log.error(
                `Calendar ${timeline.calendarId} failed to compile`,
                e,
                "TimelineView",
            );
        }
        return { cal: compileCalendar(GREGORIAN), fallback: true };
    });

    // Load calendars once per view instance.
    $effect(() => {
        loadVaultCalendars().finally(() => (calendarsLoaded = true));
    });

    // Load the timeline whenever visible and not cached (LRU-eviction aware).
    $effect(() => {
        const p = path;
        if (!p || !isActive) return;
        if (!$loadedTimelines.has(p)) {
            loadTimelineData(p).then((d) => {
                if (d === null) loadError = translate("timeline.loadFailed");
            });
        }
    });

    // Reset per-file state when this instance is reused for another file.
    let prevPath = "";
    $effect(() => {
        const p = path;
        if (p === prevPath) return;
        prevPath = p;
        history.clear();
        loadError = null;
        initializedPath = "";
    });

    // Initialize the viewport once per file: saved viewport, else fit.
    let initializedPath = $state("");
    $effect(() => {
        if (!timeline || !compiled || initializedPath === path) return;
        initializedPath = path;
        viewport = timeline.viewport ??
            fitToEvents(compiled.cal, timeline.events, trackWidth) ?? {
                centerSerial: compiled.cal.yearStartSerial(1),
                daysPerPixel: 365 / Math.max(trackWidth, 1),
            };
    });

    /** Applies a mutation: history snapshot + optimistic write-through. */
    function mutate(fn: (d: TimelineData) => TimelineData) {
        if (!timeline) return;
        history.push(timeline);
        updateTimeline(path, fn).catch((e) =>
            log.error("Timeline update failed", e, "TimelineView"),
        );
    }

    function undo() {
        if (!timeline || !history.canUndo()) return;
        const snapshot = history.undo(timeline);
        if (snapshot) updateTimeline(path, () => snapshot);
    }
    function redo() {
        if (!timeline || !history.canRedo()) return;
        const snapshot = history.redo(timeline);
        if (snapshot) updateTimeline(path, () => snapshot);
    }

    // Persist the viewport (debounced) so reopening restores the view.
    let viewportSaveTimer: ReturnType<typeof setTimeout> | null = null;
    function persistViewport() {
        if (viewportSaveTimer) clearTimeout(viewportSaveTimer);
        viewportSaveTimer = setTimeout(() => {
            const vp = viewport;
            updateTimeline(path, (d) => ({ ...d, viewport: vp })).catch(
                () => {},
            );
        }, 1000);
    }

    function onWheel(e: WheelEvent) {
        e.preventDefault();
        const rect = containerEl!.getBoundingClientRect();
        const factor = e.deltaY > 0 ? 1.2 : 1 / 1.2;
        viewport = zoomAbout(
            viewport,
            trackWidth,
            e.clientX - rect.left - LANE_GUTTER_PX,
            factor,
        );
        persistViewport();
    }

    function openCreateModal(laneId: string, serial: number) {
        if (!timeline || !compiled) return;
        const d = compiled.cal.fromSerial(serial);
        openModal({
            component: EventModal,
            props: {
                cal: compiled.cal,
                timeline,
                initial: {
                    laneId,
                    start: { year: d.year, month: d.month, day: d.day },
                },
                onSave: (event: TimelineEvent) =>
                    mutate((t) => M.addEvent(t, event)),
                onClose: closeModal,
            },
        });
    }

    /** Header button: create an event at the center of the current view. */
    function addEventAtCenter() {
        if (!timeline) return;
        openCreateModal(timeline.lanes[0].id, viewport.centerSerial);
    }

    function openCalendarEditor() {
        if (!timeline) return;
        openModal({
            component: CalendarEditorModal,
            props: {
                initial: resolveCalendar(timeline.calendarId),
                onSaved: () => loadVaultCalendars(),
                onClose: closeModal,
            },
        });
    }

    function openEditModal(id: string) {
        if (!timeline || !compiled) return;
        const event = timeline.events.find((e) => e.id === id);
        if (!event) return;
        openModal({
            component: EventModal,
            props: {
                cal: compiled.cal,
                timeline,
                event,
                onSave: (updated: TimelineEvent) =>
                    mutate((t) => M.updateEvent(t, id, updated)),
                onDelete: (deletedId: string) =>
                    mutate((t) => M.deleteEvent(t, deletedId)),
                onClose: closeModal,
            },
        });
    }

    // --- Lane management (add / rename / reorder / color / delete) ---
    let laneMenu = $state<{ x: number; y: number; laneId: string } | null>(
        null,
    );
    /** Floating swatch palette opened from the lane menu's "Set color…". */
    let lanePalette = $state<{
        x: number;
        y: number;
        laneId: string;
    } | null>(null);

    function onLaneContextMenu(e: MouseEvent, laneId: string) {
        e.preventDefault();
        e.stopPropagation();
        laneMenu = { x: e.clientX, y: e.clientY, laneId };
    }

    function promptAddLane() {
        openModal({
            component: TextInputModal,
            props: {
                title: translate("timeline.addLane"),
                label: translate("timeline.laneNameLabel"),
                initialValue: "",
                buttonText: translate("timeline.addLane"),
                onClose: closeModal,
                onSubmit: (name: string) => {
                    mutate((t) => M.addLane(t, name));
                    closeModal();
                },
            },
        });
    }

    function promptRenameLane(laneId: string) {
        const lane = timeline?.lanes.find((l) => l.id === laneId);
        if (!lane) return;
        openModal({
            component: TextInputModal,
            props: {
                title: translate("timeline.renameLane"),
                label: translate("timeline.laneNameLabel"),
                initialValue: lane.name,
                buttonText: translate("timeline.renameLane"),
                onClose: closeModal,
                onSubmit: (name: string) => {
                    mutate((t) => M.renameLane(t, laneId, name));
                    closeModal();
                },
            },
        });
    }

    function confirmDeleteLane(laneId: string) {
        const lane = timeline?.lanes.find((l) => l.id === laneId);
        if (!lane) return;
        if (
            confirm(
                translate("timeline.deleteLaneConfirm", {
                    name: lane.name || translate("timeline.unnamedLane"),
                }),
            )
        ) {
            mutate((t) => M.deleteLane(t, laneId));
        }
    }

    // --- Event context menu ---
    let contextMenu = $state<{ x: number; y: number; id: string } | null>(null);

    function onChipContextMenu(e: MouseEvent, id: string) {
        e.preventDefault();
        e.stopPropagation();
        contextMenu = { x: e.clientX, y: e.clientY, id };
    }

    // --- Hover preview for events linked to a page ---
    let hoveredPageLink = $state<string | null>(null);
    let hoverAnchor = $state<HTMLElement | null>(null);
    const hoveredPagePath = $derived(
        hoveredPageLink
            ? ($pagePathLookup.get(hoveredPageLink.toLowerCase()) ?? null)
            : null,
    );

    function onChipHover(id: string, anchorEl: HTMLElement) {
        const event = timeline?.events.find((ev) => ev.id === id);
        hoveredPageLink = event?.pageLink ?? null;
        hoverAnchor = anchorEl;
    }
    function onChipHoverEnd() {
        hoveredPageLink = null;
        hoverAnchor = null;
    }

    /** Single click on a linked chip opens its page (map-pin convention). */
    function onChipOpenPage(id: string) {
        const event = timeline?.events.find((ev) => ev.id === id);
        if (event?.pageLink) navigateToPageByTitle(event.pageLink);
    }

    let panning = $state(false);
    let lastPanX = 0;
    function onPointerDown(e: PointerEvent) {
        contextMenu = null;
        laneMenu = null;
        lanePalette = null;
        // Only start a pan on the background; event chips stop propagation.
        panning = true;
        lastPanX = e.clientX;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    function onPointerMove(e: PointerEvent) {
        const rect = containerEl?.getBoundingClientRect();
        const trackX = rect ? e.clientX - rect.left - LANE_GUTTER_PX : null;
        cursorX = trackX != null && trackX >= 0 ? trackX : null;
        if (!panning) return;
        viewport = panByPixels(viewport, e.clientX - lastPanX);
        lastPanX = e.clientX;
        persistViewport();
    }
    function onPointerUp() {
        panning = false;
    }

    function onKeyDown(e: KeyboardEvent) {
        if (!isActive) return;
        if (e.key === "Escape") {
            contextMenu = null;
            laneMenu = null;
            lanePalette = null;
            return;
        }
        const el = e.target as HTMLElement | null;
        if (
            el &&
            (el.isContentEditable ||
                el.closest(".cm-editor") ||
                el.tagName === "INPUT" ||
                el.tagName === "TEXTAREA")
        ) {
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
            e.preventDefault();
            if (e.shiftKey) redo();
            else undo();
        }
        if (e.key === "Delete" && selectedId && timeline) {
            mutate((t) => M.deleteEvent(t, selectedId!));
            selectedId = null;
        }
    }
</script>

<svelte:window onkeydown={onKeyDown} />

<div class="timeline-view">
    <ViewHeader>
        <div slot="left">
            <h2 class="view-title">
                {data?.title.replace(/\.timeline$/i, "")}
            </h2>
        </div>
        <div slot="right">
            {#if $hasTimelinesEntitlement && timeline && compiled}
                <Button size="small" onclick={addEventAtCenter}>
                    {$t("timeline.addEvent")}
                </Button>
                {#if !compiled.fallback}
                    <Button size="small" onclick={openCalendarEditor}>
                        {$t("timeline.editCalendar")}
                    </Button>
                {/if}
            {/if}
        </div>
    </ViewHeader>

    {#if !$hasTimelinesEntitlement}
        <div class="status-container">
            <p>{$t("timeline.notUnlocked")}</p>
        </div>
    {:else if loadError}
        <div class="status-container">
            <ErrorBox title={$t("timeline.errorTitle")}>{loadError}</ErrorBox>
        </div>
    {:else if timeline && compiled}
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div
            class="timeline-body"
            bind:this={containerEl}
            bind:clientWidth={widthPx}
            onwheel={onWheel}
            onmousedown={(e) => {
                // user-select:none isn't enough in WebKit: the drag still
                // starts a selection that highlights text outside this view.
                e.preventDefault();
            }}
            onpointerdown={onPointerDown}
            onpointermove={onPointerMove}
            onpointerup={onPointerUp}
            onpointerleave={() => (cursorX = null)}
            role="application"
        >
            {#if compiled.fallback}
                <div class="warning-banner">
                    {translate("timeline.missingCalendar", {
                        id: timeline.calendarId,
                    })}
                </div>
            {/if}
            <div class="axis-row" style:margin-left="{LANE_GUTTER_PX}px">
                <TimelineAxis
                    cal={compiled.cal}
                    {viewport}
                    widthPx={trackWidth}
                    {cursorX}
                />
            </div>
            <TimelineLanes
                {timeline}
                cal={compiled.cal}
                {viewport}
                widthPx={trackWidth}
                {selectedId}
                onSelect={(id) => (selectedId = id)}
                onEditEvent={openEditModal}
                onOpenEventPage={onChipOpenPage}
                onCreateAt={openCreateModal}
                onEventContextMenu={onChipContextMenu}
                onEventHover={onChipHover}
                onEventHoverEnd={onChipHoverEnd}
                {onLaneContextMenu}
                onAddLane={promptAddLane}
            />
            {#if timeline.events.length === 0}
                <div class="empty-hint">{$t("timeline.emptyHint")}</div>
            {/if}
        </div>
        {#if contextMenu}
            {@const ctxEvent = timeline.events.find(
                (ev) => ev.id === contextMenu!.id,
            )}
            <ContextMenu
                x={contextMenu.x}
                y={contextMenu.y}
                onClose={() => (contextMenu = null)}
                actions={[
                    {
                        label: $t("timeline.editEvent"),
                        handler: () => openEditModal(contextMenu!.id),
                    },
                    ...(ctxEvent?.pageLink
                        ? [
                              {
                                  label: $t("timeline.openPage"),
                                  handler: () =>
                                      navigateToPageByTitle(ctxEvent.pageLink!),
                              },
                          ]
                        : []),
                    {
                        label: $t("timeline.deleteEvent"),
                        handler: () => {
                            const id = contextMenu!.id;
                            mutate((t) => M.deleteEvent(t, id));
                        },
                    },
                ]}
            />
        {/if}
        {#if laneMenu}
            <ContextMenu
                x={laneMenu.x}
                y={laneMenu.y}
                onClose={() => (laneMenu = null)}
                actions={[
                    {
                        label: $t("timeline.renameLane"),
                        handler: () => promptRenameLane(laneMenu!.laneId),
                    },
                    {
                        label: $t("timeline.setColor"),
                        handler: () => {
                            lanePalette = {
                                x: laneMenu!.x,
                                y: laneMenu!.y,
                                laneId: laneMenu!.laneId,
                            };
                        },
                    },
                    {
                        label: $t("timeline.moveLaneUp"),
                        handler: () => {
                            const id = laneMenu!.laneId;
                            mutate((t) => M.moveLane(t, id, -1));
                        },
                    },
                    {
                        label: $t("timeline.moveLaneDown"),
                        handler: () => {
                            const id = laneMenu!.laneId;
                            mutate((t) => M.moveLane(t, id, 1));
                        },
                    },
                    ...(timeline.lanes.length > 1
                        ? [
                              { isSeparator: true } as const,
                              {
                                  label: $t("timeline.deleteLane"),
                                  handler: () =>
                                      confirmDeleteLane(laneMenu!.laneId),
                              },
                          ]
                        : []),
                ]}
            />
        {/if}
        {#if lanePalette}
            <div
                class="lane-palette"
                style:left="{lanePalette.x}px"
                style:top="{lanePalette.y}px"
                onpointerdown={(e) => e.stopPropagation()}
                role="menu"
                tabindex="-1"
            >
                <ColorSwatchRow
                    value={timeline.lanes.find(
                        (l) => l.id === lanePalette!.laneId,
                    )?.color ?? null}
                    onChange={(c) => {
                        const id = lanePalette!.laneId;
                        mutate((t) => M.setLaneColor(t, id, c));
                        lanePalette = null;
                    }}
                />
            </div>
        {/if}
        {#if $areLinkPreviewsEnabled}
            <LinkPreview anchorEl={hoverAnchor} targetPath={hoveredPagePath} />
        {/if}
    {:else}
        <div class="status-container"><p>{$t("common.loading")}</p></div>
    {/if}
</div>

<style>
    .timeline-view {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
        position: relative;
        background: var(--color-background-primary);
    }
    .view-title {
        font-family: var(--font-family-heading);
        color: var(--color-text-heading);
        margin: 0;
        font-size: 1.5rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .timeline-body {
        position: relative;
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        overflow: hidden;
        cursor: grab;
        /* The whole surface is drag-to-pan; native text selection would
           anchor on tick/lane/chip labels mid-drag. */
        user-select: none;
    }
    .empty-hint {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        color: var(--color-text-secondary);
        font-size: 0.95rem;
        pointer-events: none;
        user-select: none;
    }
    .lane-palette {
        position: fixed;
        z-index: 30;
        padding: 6px;
        background: var(--color-background-tertiary);
        border: 1px solid var(--color-border-primary);
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
    }
    .timeline-body:active {
        cursor: grabbing;
    }
    .warning-banner {
        padding: 0.4rem 0.75rem;
        font-size: 0.85rem;
        background: color-mix(
            in srgb,
            var(--color-error, #b00) 15%,
            transparent
        );
        color: var(--color-text-primary);
        flex-shrink: 0;
    }
    .status-container {
        display: flex;
        align-items: center;
        justify-content: center;
        flex: 1;
        color: var(--color-text-secondary);
    }
</style>
