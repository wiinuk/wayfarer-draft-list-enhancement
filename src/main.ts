import { hookApi } from "./api-hook";
import { createDraftStateLoader } from "./state";
import { DraftsResponse, PoiItem } from "./drafts-model";
import { createExternalDraftUpdateMod } from "./mods/external-update-mod";
import { injectStyles, removeStyles } from "./global-styles";
import { startRouting } from "./routing";

const TARGET_PATH = "/submit";
const EDIT_PATH = "/submit/new";
const externalDraftUpdateStorageKey = "wayfarer-external-draft-update";
const draftStateStorageKey = "wayfarer-draft-list-state";
const draftStateVersion = "3";

const draftMap: Map<string, PoiItem> = new Map();
const state = createDraftStateLoader(draftStateStorageKey, draftStateVersion, {
    version: draftStateVersion,
    filter: "all",
    locationAttestedFilter: "all",
    sortMode: "unsorted",
});

const externalDraftUpdateMod = createExternalDraftUpdateMod({
    storageKey: externalDraftUpdateStorageKey,
    state,
    draftMap,
});

let isActive = false;

function onDraftsReceived(data: DraftsResponse) {
    if (data && data.result && Array.isArray(data.result.result)) {
        data.result.result.forEach((item) => {
            if (item.id) {
                draftMap.set(item.id, item);
            }
        });
        externalDraftUpdateMod.processDrafts();
    }
}
const apiHook = hookApi({
    onDraftsReceived,
    isActive: isActive,
});

let observer: MutationObserver | null = null;
function start() {
    if (isActive) return;

    isActive = true;
    apiHook.setIsActive(isActive);

    injectStyles();
    externalDraftUpdateMod.startOnDraftList();

    if (!observer) {
        observer = new MutationObserver(() => {
            if (!isActive) return;

            injectStyles();
        });
    }

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });
}

function stop() {
    if (!isActive) return;

    isActive = false;
    apiHook.setIsActive(isActive);

    if (observer) {
        observer.disconnect();
    }

    draftMap.clear();
    removeStyles();
}

startRouting({
    [TARGET_PATH]: { start, stop },
    [EDIT_PATH]: {
        start() {
            externalDraftUpdateMod.startOnEditPage();
        },
    },
});
