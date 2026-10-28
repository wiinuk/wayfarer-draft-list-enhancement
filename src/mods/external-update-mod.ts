//spell-checker: words wayspot
import { DraftState } from "../state";
import { PoiItem } from "../drafts-model";
import { getDistance } from "../geometry";
import { getDraftIdForCard, getReactProp } from "../react-props";
import { findField, setFieldValue, isRecord } from "../dom-extensions";

type ExternalDraftUpdate = {
    lat?: number;
    lng?: number;
    title?: string;
    description?: string;
    statement?: string;
};

interface CreateExternalDraftUpdateOptions {
    readonly storageKey: string;
    readonly state: DraftState;
    readonly draftMap: ReadonlyMap<string, PoiItem>;
}

interface DraftCard {
    readonly id: string;
    readonly card: HTMLElement;
}

type LocationSelectedHandler = (location: { lat: number; lng: number }) => void;

const searchRadiusKm = 0.08;

function isValidUpdate(value: unknown): value is ExternalDraftUpdate {
    if (!isRecord(value)) return false;

    for (const key of ["lat", "lng"] as const) {
        const coordinate = value[key];
        if (
            coordinate !== undefined &&
            (typeof coordinate !== "number" ||
                !Number.isFinite(coordinate) ||
                (key === "lat"
                    ? coordinate < -90 || coordinate > 90
                    : coordinate < -180 || coordinate > 180))
        ) {
            return false;
        }
    }

    for (const key of ["title", "description", "statement"] as const) {
        if (value[key] !== undefined && typeof value[key] !== "string") {
            return false;
        }
    }

    return true;
}

function parseUpdateHash(): ExternalDraftUpdate | null {
    const match = window.location.hash.match(/^#update=(.+)$/);
    if (!match) return null;

    try {
        const value: unknown = JSON.parse(decodeURIComponent(match[1]));
        if (!isValidUpdate(value)) return null;
        return value;
    } catch (error) {
        console.warn(
            "[Wayfarer Draft Sorter] Could not parse update hash:",
            error,
        );
        return null;
    }
}

function removeSymbols(text: string) {
    return text.replace(
        // eslint-disable-next-line no-misleading-character-class
        /[\u{3200}-\u{32FF}\u{1F000}-\u{1FFFF}\u{2100}-\u{2BFF}\u{FE00}-\u{FE0F}\u200D]/gu,
        "",
    );
}

function getDraftCard(element: Element): DraftCard | undefined {
    const id = getDraftIdForCard(element);
    if (id == null) return;

    return {
        id,
        card: element as HTMLElement,
    };
}

function setCoordinate(lat: number, lng: number): boolean {
    const map = document.querySelector('[data-testid="submit-wayspot-map"]');
    if (!map) return false;

    const handler = getReactProp(map, "onLocationSelected");
    if (typeof handler !== "function") return false;

    (handler as LocationSelectedHandler)({ lat, lng });
    return true;
}

export function createExternalDraftUpdateMod({
    storageKey,
    state,
    draftMap,
}: CreateExternalDraftUpdateOptions) {
    let draftClickStarted = false;
    let draftListObserver: MutationObserver | null = null;
    let draftListPollTimer: number | null = null;
    let editObserver: MutationObserver | null = null;
    let editPollTimer: number | null = null;

    function saveUpdate(update: ExternalDraftUpdate) {
        try {
            sessionStorage.setItem(storageKey, JSON.stringify(update));
        } catch (error) {
            console.warn(
                "[Wayfarer Draft Sorter] Could not save external draft update:",
                error,
            );
        }
    }

    function loadUpdate(): ExternalDraftUpdate | null {
        try {
            const value: unknown = JSON.parse(
                sessionStorage.getItem(storageKey) ?? "null",
            );
            return isValidUpdate(value) ? value : null;
        } catch (error) {
            console.warn(
                "[Wayfarer Draft Sorter] Could not load external draft update:",
                error,
            );
            return null;
        }
    }

    function clearUpdate() {
        try {
            sessionStorage.removeItem(storageKey);
        } catch (error) {
            console.warn(
                "[Wayfarer Draft Sorter] Could not clear external draft update:",
                error,
            );
        }
    }

    function stopWaitingForDraftList() {
        draftListObserver?.disconnect();
        draftListObserver = null;
        if (draftListPollTimer !== null) {
            window.clearInterval(draftListPollTimer);
        }
        draftListPollTimer = null;
    }

    function stopWaitingForFields() {
        editObserver?.disconnect();
        editObserver = null;
        if (editPollTimer !== null) window.clearInterval(editPollTimer);
        editPollTimer = null;
    }

    function stop() {
        stopWaitingForDraftList();
        stopWaitingForFields();
    }

    function waitForDraftList() {
        if (draftListObserver || draftListPollTimer !== null) return;

        if (document.body) {
            draftListObserver = new MutationObserver(processDrafts);
            draftListObserver.observe(document.body, {
                childList: true,
                subtree: true,
            });
        }
        draftListPollTimer = window.setInterval(processDrafts, 250);
    }

    function startOnDraftList() {
        const update = parseUpdateHash();
        if (!update) return;

        stopWaitingForDraftList();
        draftClickStarted = false;
        saveUpdate(update);
        history.replaceState(
            history.state,
            "",
            `${window.location.pathname}${window.location.search}`,
        );

        if (update.lat === undefined || update.lng === undefined) {
            alert("更新対象を特定するため、lat と lng が必要です。");
            return;
        }

        state.mapSave((currentState) => ({
            ...currentState,
            query: `${update.lat}, ${update.lng}`,
            sortMode: "distance",
            latitude: update.lat,
            longitude: update.lng,
        }));
        processDrafts();
    }

    function processDrafts() {
        const update = loadUpdate();
        if (!update) return;
        const latitude = update.lat;
        const longitude = update.lng;
        const title = update.title;
        if (
            latitude === undefined ||
            longitude === undefined ||
            title === undefined
        )
            return;

        const candidates = Array.from(
            document.querySelectorAll('[data-testid="draft-card"]'),
        ).flatMap((cardElement) => {
            const card = getDraftCard(cardElement);
            const draft = card ? draftMap.get(card.id) : undefined;
            if (
                !card ||
                !draft ||
                getDistance(latitude, longitude, draft.lat, draft.lng) >
                    searchRadiusKm
            ) {
                return [];
            }
            return [{ ...card, draft }];
        });

        const exactMatches = candidates.filter(
            ({ draft }) => draft.title === removeSymbols(title),
        );

        if (exactMatches.length !== 1) {
            waitForDraftList();
            return;
        }

        if (draftClickStarted) return;
        draftClickStarted = true;
        stopWaitingForDraftList();

        window.setTimeout(() => {
            const button = exactMatches[0].card.querySelector("button");
            if (button?.isConnected) {
                button.click();
                return;
            }

            draftClickStarted = false;
            waitForDraftList();
        }, 50);
    }

    function startOnEditPage() {
        stopWaitingForFields();
        stopWaitingForDraftList();
        const update = loadUpdate();
        if (!update) return;

        let completed = false;
        let coordinateApplied = false;
        const tryFillFields = () => {
            if (completed) return;
            const latitude = update.lat;
            const longitude = update.lng;
            const hasCoordinates =
                latitude !== undefined && longitude !== undefined;
            if (hasCoordinates && !coordinateApplied) {
                if (!setCoordinate(latitude, longitude)) return;
                coordinateApplied = true;
            }

            const fields: Array<[keyof ExternalDraftUpdate, string[]]> = [
                ["title", ["textarea#title"]],
                ["description", ["textarea#description"]],
                ["statement", ["textarea#supportingStatement"]],
            ];
            const found = fields
                .filter(([key]) => update[key] !== undefined)
                .map(
                    ([key, selectors]) => [key, findField(selectors)] as const,
                );
            if (found.some(([, field]) => !field || field.disabled)) return;

            found.forEach(([key, field]) =>
                setFieldValue(field!, String(update[key])),
            );
            completed = true;
            clearUpdate();
            stopWaitingForFields();
        };

        tryFillFields();
        if (completed) return;
        editObserver = new MutationObserver(tryFillFields);
        editObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["disabled"],
        });
        editPollTimer = window.setInterval(tryFillFields, 250);
    }

    return {
        startOnDraftList,
        processDrafts,
        startOnEditPage,
        stopWaitingForFields,
        stop,
    };
}
