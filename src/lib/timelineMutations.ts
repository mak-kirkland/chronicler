/**
 * @file Pure TimelineData -> TimelineData mutations, mirroring
 * canvasMutations.ts. Every function returns a new object (structural
 * sharing where unchanged) so undo history can hold snapshots.
 */
import type { TimelineData, TimelineEvent } from "./timelineModels";
import { genId } from "./timelineModels";

export function addEvent(
    data: TimelineData,
    event: TimelineEvent,
): TimelineData {
    return { ...data, events: [...data.events, event] };
}

export function updateEvent(
    data: TimelineData,
    id: string,
    patch: Partial<TimelineEvent>,
): TimelineData {
    return {
        ...data,
        events: data.events.map((e) =>
            e.id === id ? { ...e, ...patch, id: e.id } : e,
        ),
    };
}

export function deleteEvent(data: TimelineData, id: string): TimelineData {
    return { ...data, events: data.events.filter((e) => e.id !== id) };
}

export function addLane(data: TimelineData, name: string): TimelineData {
    return {
        ...data,
        lanes: [
            ...data.lanes,
            { id: genId(), name, color: null, collapsed: false },
        ],
    };
}

export function renameLane(
    data: TimelineData,
    id: string,
    name: string,
): TimelineData {
    return {
        ...data,
        lanes: data.lanes.map((l) => (l.id === id ? { ...l, name } : l)),
    };
}

export function setLaneColor(
    data: TimelineData,
    id: string,
    color: string | null,
): TimelineData {
    return {
        ...data,
        lanes: data.lanes.map((l) => (l.id === id ? { ...l, color } : l)),
    };
}

export function deleteLane(data: TimelineData, id: string): TimelineData {
    if (data.lanes.length <= 1) return data;
    return {
        ...data,
        lanes: data.lanes.filter((l) => l.id !== id),
        events: data.events.filter((e) => e.laneId !== id),
    };
}

export function moveLane(
    data: TimelineData,
    id: string,
    delta: number,
): TimelineData {
    const index = data.lanes.findIndex((l) => l.id === id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= data.lanes.length) return data;
    const lanes = [...data.lanes];
    const [lane] = lanes.splice(index, 1);
    lanes.splice(target, 0, lane);
    return { ...data, lanes };
}
