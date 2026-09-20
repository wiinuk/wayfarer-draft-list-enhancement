//spell-checker: words formcontrolname
import { DraftState } from "../state";
import { PoiItem } from "../drafts-model";
import { getDistance } from "../geometry";
import { getDraftIdForCard, setCoordinate } from "../ng-context";
import { findField, setFieldValue } from "../dom-extensions";

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
  readonly applyDraftFilter: () => void;
  readonly sortDraftCards: (
    latitude: number,
    longitude: number,
    sortMode: "distance" | "last-modified",
  ) => boolean;
}

const searchRadiusKm = 0.08;

function parseUpdateHash(): ExternalDraftUpdate | null {
  const match = window.location.hash.match(/^#update=(.+)$/);
  if (!match) return null;

  try {
    const value: unknown = JSON.parse(decodeURIComponent(match[1]));
    if (!value || typeof value !== "object") return null;

    const record = value as Record<string, unknown>;
    const update: ExternalDraftUpdate = {};
    for (const key of ["lat", "lng"] as const) {
      const candidate = record[key];
      if (typeof candidate === "number" && Number.isFinite(candidate)) {
        update[key] = candidate;
      }
    }
    for (const key of ["title", "description", "statement"] as const) {
      if (typeof record[key] === "string") update[key] = record[key];
    }
    return update;
  } catch (error) {
    console.warn("[Wayfarer Draft Sorter] Could not parse update hash:", error);
    return null;
  }
}

export function createExternalDraftUpdateMod({
  storageKey,
  state,
  draftMap,
  applyDraftFilter,
  sortDraftCards,
}: CreateExternalDraftUpdateOptions) {
  let listProcessing = false;
  let draftClickStarted = false;
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
      return value && typeof value === "object"
        ? (value as ExternalDraftUpdate)
        : null;
    } catch {
      return null;
    }
  }

  function clearUpdate() {
    sessionStorage.removeItem(storageKey);
  }

  function startOnDraftList() {
    if (listProcessing) return;
    const update = parseUpdateHash();
    if (!update) return;
    listProcessing = true;
    saveUpdate(update);
    history.replaceState(
      history.state,
      "",
      `${window.location.pathname}${window.location.search}`,
    );

    if (update.lat === undefined || update.lng === undefined) {
      alert("更新対象を特定するため、lat と lng が必要です。");
    }
  }

  function processDrafts() {
    const update = loadUpdate();
    if (!update || update.lat === undefined || update.lng === undefined) {
      return;
    }

    state.mapSave((currentState) => ({
      ...currentState,
      query: `${update.lat}, ${update.lng}`,
      sortMode: "distance",
      latitude: update.lat,
      longitude: update.lng,
    }));
    applyDraftFilter();
    sortDraftCards(update.lat, update.lng, "distance");

    const candidates = Array.from(
      document.querySelectorAll(".submission-card"),
    ).flatMap((card) => {
      const draftId = getDraftIdForCard(card, draftMap);
      const draft = draftId ? draftMap.get(draftId) : undefined;
      if (
        !draft ||
        getDistance(update.lat!, update.lng!, draft.lat, draft.lng) >
          searchRadiusKm
      ) {
        return [];
      }
      return [{ card: card as HTMLElement, draft }];
    });

    const exactMatches =
      update.title === undefined
        ? []
        : candidates.filter(({ draft }) => draft.title === update.title);

    if (exactMatches.length === 1 && !draftClickStarted) {
      draftClickStarted = true;
      window.setTimeout(() => exactMatches[0].card.click(), 50);
    }
  }

  function startOnEditPage() {
    stopWaitingForFields();
    const update = loadUpdate();
    if (!update) return;

    let completed = false;
    let coordinateApplied = false;
    const tryFillFields = () => {
      if (completed) return;
      const latitude = update.lat;
      const longitude = update.lng;
      const hasCoordinates = latitude !== undefined && longitude !== undefined;
      if (hasCoordinates && !coordinateApplied) {
        if (!setCoordinate(latitude, longitude)) return;
        coordinateApplied = true;
      }
      const fields: Array<[keyof ExternalDraftUpdate, string[]]> = [
        [
          "title",
          [
            "textarea#title",
            "input[formcontrolname=title]",
            "input[name=title]",
            "input[id=title]",
          ],
        ],
        [
          "description",
          [
            "textarea#description",
            "textarea[formcontrolname=description]",
            "textarea[name=description]",
          ],
        ],
        [
          "statement",
          [
            "textarea#supportingStatement",
            "textarea[formcontrolname=supportingStatement]",
            "textarea[formcontrolname=statement]",
            "textarea[name=statement]",
          ],
        ],
      ];
      const found = fields
        .filter(([key]) => update[key] !== undefined)
        .map(([key, selectors]) => [key, findField(selectors)] as const);
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

  function stopWaitingForFields() {
    editObserver?.disconnect();
    editObserver = null;
    if (editPollTimer !== null) window.clearInterval(editPollTimer);
    editPollTimer = null;
  }

  return {
    startOnDraftList,
    processDrafts,
    startOnEditPage,
    stopWaitingForFields,
  };
}
