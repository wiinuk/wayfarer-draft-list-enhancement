import { hookApi } from "./api-hook";
import { createAutoSaveMod } from "./auto-save-mod";
import { createDraftsMod } from "./draft-card-mod";
import { createDraftStateLoader } from "./state";
import { DraftsResponse, PoiItem } from "./drafts-model";
import { injectStyles, removeStyles } from "./global-styles";
import { startRouting } from "./routing";

const TARGET_PATH = "/new/submit";
const EDIT_PATH = "/new/submit/new";
const DRAFT_SUCCESS_PATH = "/new/submit/draft-success";
const autoSaveStorageKey = "wayfarer-draft-auto-save";
const draftStateStorageKey = "wayfarer-draft-list-state";
const draftStateVersion = "3";

const draftMap: Map<string, PoiItem> = new Map();
const state = createDraftStateLoader(draftStateStorageKey, draftStateVersion, {
  version: draftStateVersion,
  filter: "all",
  locationAttestedFilter: "all",
  sortMode: "unsorted",
});

const draftsMod = createDraftsMod({ state, draftMap });
const autoSaveMod = createAutoSaveMod({ autoSaveStorageKey, draftMap });

let isActive = false;
let draftStateApplyTimer: number | null = null;
function scheduleDraftStateApply() {
  if (!isActive) return;

  if (draftStateApplyTimer !== null) {
    window.clearTimeout(draftStateApplyTimer);
  }

  draftStateApplyTimer = window.setTimeout(() => {
    draftStateApplyTimer = null;

    if (!isActive) return;

    draftsMod.applyDraftFilter();
    if (state.value.sortMode === "distance") {
      if (
        state.value.latitude === undefined ||
        state.value.longitude === undefined
      ) {
        return;
      }
      draftsMod.sortDraftCards(
        state.value.latitude,
        state.value.longitude,
        "distance",
      );
    } else if (state.value.sortMode === "last-modified") {
      draftsMod.sortDraftCards(0, 0, "last-modified");
    } else {
      draftsMod.updateDraftCardBadges(0, 0, "unsorted");
    }

    autoSaveMod.addButtons();
  }, 100);
}

function onDraftsReceived(data: DraftsResponse) {
  if (data && data.result && Array.isArray(data.result.result)) {
    data.result.result.forEach((item) => {
      if (item.id) {
        draftMap.set(item.id, item);
      }
    });
    scheduleDraftStateApply();
    console.log("[Wayfarer Draft Sorter] Drafts loaded:", draftMap);
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
  draftsMod.addSortButton();
  draftsMod.addSearchInput();
  autoSaveMod.addButtons();

  if (!observer) {
    observer = new MutationObserver(() => {
      if (!isActive) return;

      injectStyles();
      draftsMod.addSortButton();
      draftsMod.addSearchInput();
      autoSaveMod.addButtons();
      scheduleDraftStateApply();
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

  if (draftStateApplyTimer !== null) {
    clearTimeout(draftStateApplyTimer);
    draftStateApplyTimer = null;
  }

  autoSaveMod.stopWaitingForSaveButton();

  draftMap.clear();
  draftsMod.removeAddedUI();
  removeStyles();
}

startRouting({
  [TARGET_PATH]: { start, stop },
  [EDIT_PATH]: {
    start() {
      autoSaveMod.startWaitingForSaveButton();
    },
  },
  [DRAFT_SUCCESS_PATH]: {
    start() {
      autoSaveMod.handleDraftSuccessPage();
    },
  },
});
