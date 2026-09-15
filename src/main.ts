import { createAutoSaver } from "./auto-save";
import { createDraftStateLoader } from "./draft-state-storage";
import { DraftsResponse, PoiItem } from "./drafts-model";
import { classNames, injectStyles, removeStyles } from "./global-styles";
import { getDraftIdForCard } from "./ng-context";

export {};

const TARGET_PATH = "/new/submit";
const EDIT_PATH = "/new/submit/new";
const DRAFT_SUCCESS_PATH = "/new/submit/draft-success";
const autoSaveStorageKey = "wayfarer-draft-auto-save";
const draftStateStorageKey = "wayfarer-draft-list-state";
const draftStateVersion = "3";

// -------------------------------------------------------------------------
// 2. 型定義・状態管理
// -------------------------------------------------------------------------

const draftMap: Map<string, PoiItem> = new Map();

const state = createDraftStateLoader(draftStateStorageKey, draftStateVersion, {
  version: draftStateVersion,
  filter: "all",
  locationAttestedFilter: "all",
  sortMode: "unsorted",
});

let draftStateApplyTimer: number | null = null;
let locationCheckInProgress = false;
let observer: MutationObserver | null = null;

const autoSaver = createAutoSaver({ autoSaveStorageKey, draftMap });

let isActive = false;

function formatDistance(distance: number) {
  return distance < 1
    ? `${Math.round(distance * 1000)} m`
    : `${distance.toFixed(2)} km`;
}

function checkCurrentLocation(sortButton: HTMLButtonElement) {
  if (
    state.value.sortMode !== "distance" ||
    state.value.latitude === undefined ||
    state.value.longitude === undefined ||
    locationCheckInProgress
  ) {
    return;
  }

  locationCheckInProgress = true;
  sortButton.innerText = "近い順（現在地を確認中...）";

  const sortLatitude = state.value.latitude;
  const sortLongitude = state.value.longitude;

  navigator.geolocation.getCurrentPosition(
    (position) => {
      locationCheckInProgress = false;

      const distance = getDistance(
        sortLatitude,
        sortLongitude,
        position.coords.latitude,
        position.coords.longitude,
      );

      sortButton.innerText = `近い順（基準地点から約 ${formatDistance(
        distance,
      )}）`;
    },
    (error) => {
      locationCheckInProgress = false;
      sortButton.innerText = "近い順（現在地を取得できません）";

      console.warn(
        "[Wayfarer Draft Sorter] Could not check current location:",
        error,
      );
    },
  );
}

function scheduleDraftStateApply() {
  if (!isActive) return;

  if (draftStateApplyTimer !== null) {
    window.clearTimeout(draftStateApplyTimer);
  }

  draftStateApplyTimer = window.setTimeout(() => {
    draftStateApplyTimer = null;

    if (!isActive) return;

    applyDraftFilter();

    if (state.value.sortMode === "distance") {
      if (
        state.value.latitude === undefined ||
        state.value.longitude === undefined
      ) {
        return;
      }

      sortDraftCards(state.value.latitude, state.value.longitude, "distance");
    } else if (state.value.sortMode === "last-modified") {
      sortDraftCards(0, 0, "last-modified");
    } else {
      updateDraftCardBadges(0, 0, "unsorted");
    }

    autoSaver.addButtons();
  }, 100);
}

// -------------------------------------------------------------------------
// 3. 距離計算
// -------------------------------------------------------------------------

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// -------------------------------------------------------------------------
// 4. カードのバッジ
// -------------------------------------------------------------------------

function updateDraftCardBadges(
  userLat: number,
  userLon: number,
  sortMode: "distance" | "last-modified" | "unsorted",
) {
  const draftCards = Array.from(
    document.querySelectorAll("app-submission-card"),
  );

  draftCards.forEach((draftCard) => {
    const draftId = getDraftIdForCard(draftCard, draftMap);
    const draft = draftId ? draftMap.get(draftId) : undefined;
    if (!draft) return;

    const title = draftCard.querySelector(".submission-title");
    if (!title) return;

    let locationBadge = draftCard.querySelector(`.${classNames.locationBadge}`);

    if (!locationBadge) {
      locationBadge = document.createElement("span");
      locationBadge.className = classNames.locationBadge;
      title.prepend(locationBadge);
    }

    const isAttested = Boolean(draft.locationAttested);

    locationBadge.classList.toggle(classNames.locationAttested, isAttested);

    if (sortMode === "distance") {
      let distBadge = draftCard.querySelector(
        `.${classNames.distanceBadge}`,
      ) as HTMLElement | null;

      if (!distBadge) {
        distBadge = document.createElement("span");
        distBadge.className = classNames.distanceBadge;
        title.appendChild(distBadge);
      }

      const distance =
        draft.lat !== undefined && draft.lng !== undefined
          ? getDistance(userLat, userLon, draft.lat, draft.lng)
          : Infinity;

      const distanceLabel =
        distance !== Infinity ? `約 ${distance.toFixed(2)} km` : "位置不明";

      if (distBadge.innerText !== distanceLabel) {
        distBadge.innerText = distanceLabel;
      }
    }
  });
}

// -------------------------------------------------------------------------
// 5. ソート
// -------------------------------------------------------------------------

function sortDraftCards(
  userLat: number,
  userLon: number,
  sortMode: "distance" | "last-modified",
): boolean {
  const draftCards = Array.from(
    document.querySelectorAll("app-submission-card"),
  ) as HTMLElement[];

  const cardItems: {
    element: HTMLElement;
    title: string;
    distance: number;
    lastModified: number;
  }[] = [];

  draftCards.forEach((draftCard) => {
    const draftId = getDraftIdForCard(draftCard, draftMap);
    const draft = draftId ? draftMap.get(draftId) : undefined;
    if (!draft) return;

    cardItems.push({
      element: draftCard,
      title: draft.title,
      distance:
        sortMode === "distance" &&
        draft.lat !== undefined &&
        draft.lng !== undefined
          ? getDistance(userLat, userLon, draft.lat, draft.lng)
          : Infinity,
      lastModified:
        typeof draft.lastModified === "number" ? draft.lastModified : Infinity,
    });
  });

  if (cardItems.length === 0) return false;

  cardItems.sort((a, b) =>
    sortMode === "distance"
      ? a.distance - b.distance
      : b.lastModified - a.lastModified,
  );

  const parent = cardItems[0]?.element.parentElement;
  if (!parent) return false;

  const needsReorder = cardItems.some(
    (item, index) => parent.children[index] !== item.element,
  );

  cardItems.forEach((item) => {
    if (needsReorder) {
      parent.appendChild(item.element);
    }
  });

  updateDraftCardBadges(userLat, userLon, sortMode);

  return true;
}

// -------------------------------------------------------------------------
// 6. APIから下書きを取得
// -------------------------------------------------------------------------

function loadDraftCoordinates(data: DraftsResponse) {
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

// fetchフック
const originalFetch = window.fetch;

window.fetch = async function (...args) {
  const response = await originalFetch.apply(this, args);

  if (!isActive) return response;

  const url =
    typeof args[0] === "string"
      ? args[0]
      : args[0] instanceof URL
        ? String(args[0])
        : args[0].url;

  if (url && url.includes("/api/v1/vault/submit/get/drafts")) {
    try {
      const clone = response.clone();

      const data: DraftsResponse = await clone.json();

      loadDraftCoordinates(data);
    } catch (e) {
      console.error("[Wayfarer Draft Sorter] Error parsing API response:", e);
    }
  }

  return response;
};

// XHRフック
const xhrUrls: WeakMap<XMLHttpRequest, string> = new WeakMap();

const originalXhrOpen = XMLHttpRequest.prototype.open;

XMLHttpRequest.prototype.open = function (...args: never) {
  xhrUrls.set(this, String(args[1]));
  return originalXhrOpen.apply(this, args);
};

const originalXhrSend = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.send = function (...args: never) {
  this.addEventListener("load", () => {
    if (!isActive) return;

    const url = xhrUrls.get(this);

    if (!url || !url.includes("/api/v1/vault/submit/get/drafts")) {
      return;
    }

    try {
      const data =
        this.responseType === "json"
          ? this.response
          : JSON.parse(this.responseText);

      loadDraftCoordinates(data);
    } catch (e) {
      console.error("[Wayfarer Draft Sorter] Error parsing XHR response:", e);
    }
  });

  return originalXhrSend.apply(this, args);
};

// -------------------------------------------------------------------------
// 8. フィルター
// -------------------------------------------------------------------------

function applyDraftFilter() {
  (
    document.querySelectorAll("app-submission-card") as NodeListOf<HTMLElement>
  ).forEach((card) => {
    const draftId = getDraftIdForCard(card, draftMap);
    const draft = draftId ? draftMap.get(draftId) : undefined;

    if (!draft) return;

    const readiness = Boolean(
      (draft.mainImageGcsPath || draft.mainImageServingUrl) &&
      ((draft.supportingImageGcsPaths &&
        draft.supportingImageGcsPaths.length > 0) ||
        (draft.supportingImageServingUrls &&
          draft.supportingImageServingUrls.length > 0)) &&
      typeof draft.title === "string" &&
      draft.title.trim().length > 0 &&
      typeof draft.description === "string" &&
      draft.description.trim().length > 0,
    );

    const readinessHide =
      state.value.filter !== "all" &&
      (state.value.filter === "ready") !== readiness;

    const isAttested = Boolean(draft.locationAttested);

    const locationAttestedHide =
      state.value.locationAttestedFilter !== "all" &&
      (state.value.locationAttestedFilter === "attested") !== isAttested;

    const shouldHide = readinessHide || locationAttestedHide;

    if (card.hidden !== shouldHide) {
      card.hidden = shouldHide;
    }
  });
}

function getDraftFilterLabel() {
  if (state.value.filter === "ready") return "準備完了";
  if (state.value.filter === "not-ready") return "不可";
  return "すべて";
}

function getLocationAttestedFilterLabel() {
  if (state.value.locationAttestedFilter === "attested") return "確認済";
  if (state.value.locationAttestedFilter === "not-attested") return "未確認";
  return "すべて";
}

function getSortModeLabel() {
  if (state.value.sortMode === "distance") return "近い順";
  if (state.value.sortMode === "last-modified") return "最近変更した順";
  return "並び替えない";
}

// -------------------------------------------------------------------------
// 10. ソート・フィルターボタン
// -------------------------------------------------------------------------

function addSortButton() {
  if (document.getElementById("sort-drafts-btn")) return;

  const headers = Array.from(document.querySelectorAll("h2, h3"));

  const draftHeader = headers.find((el) => el.textContent.includes("下書き"));

  if (!draftHeader) return;

  const btn = document.createElement("button");
  btn.id = "sort-drafts-btn";
  btn.classList.add(classNames.btn, classNames.btnSort);
  btn.innerText = getSortModeLabel();
  draftHeader.appendChild(btn);

  const filterBtn = document.createElement("button");
  filterBtn.id = "filter-drafts-btn";
  filterBtn.classList.add(classNames.btn, classNames.btnFilter);
  filterBtn.innerText = `提出: ${getDraftFilterLabel()}`;
  draftHeader.appendChild(filterBtn);

  const locFilterBtn = document.createElement("button");

  locFilterBtn.id = "filter-location-attested-btn";

  locFilterBtn.classList.add(classNames.btn, classNames.btnLocation);

  locFilterBtn.innerText = `位置: ${getLocationAttestedFilterLabel()}`;

  draftHeader.appendChild(locFilterBtn);

  if (state.value.sortMode === "distance") {
    checkCurrentLocation(btn);
  }

  filterBtn.addEventListener("click", () => {
    state.mapSave((s) => {
      return {
        ...s,
        filter:
          s.filter === "all"
            ? "ready"
            : s.filter === "ready"
              ? "not-ready"
              : "all",
      };
    });

    filterBtn.innerText = `提出: ${getDraftFilterLabel()}`;
    applyDraftFilter();
  });

  locFilterBtn.addEventListener("click", () => {
    state.mapSave((s) => {
      return {
        ...s,
        locationAttestedFilter:
          s.locationAttestedFilter === "all"
            ? "attested"
            : s.locationAttestedFilter === "attested"
              ? "not-attested"
              : "all",
      };
    });
    locFilterBtn.innerText = `位置: ${getLocationAttestedFilterLabel()}`;
    applyDraftFilter();
  });

  btn.addEventListener("click", () => {
    if (state.value.sortMode === "distance") {
      sortDraftCards(0, 0, "last-modified");

      state.mapSave((s) => {
        return {
          ...s,
          sortMode: "last-modified",
        };
      });
      btn.innerText = getSortModeLabel();
      return;
    }

    if (state.value.sortMode === "last-modified") {
      state.mapSave((s) => {
        return {
          ...s,
          sortMode: "unsorted",
        };
      });
      btn.innerText = getSortModeLabel();
      return;
    }

    btn.innerText = "位置情報を取得中...";

    btn.disabled = true;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const userLat = pos.coords.latitude;

        const userLon = pos.coords.longitude;

        if (!sortDraftCards(userLat, userLon, "distance")) {
          alert(
            "ソート対象の下書きが見つかりませんでした。ページを更新して再試行してください。",
          );

          btn.innerText = getSortModeLabel();

          btn.disabled = false;

          return;
        }

        state.mapSave((s) => {
          return {
            ...s,
            sortMode: "distance",
            latitude: userLat,
            longitude: userLon,
          };
        });

        btn.innerText = `近い順（基準地点から約 ${formatDistance(0)}）`;

        btn.disabled = false;
      },
      (err) => {
        alert("位置情報の取得に失敗しました: " + err.message);

        btn.innerText = getSortModeLabel();

        btn.disabled = false;
      },
    );
  });
}

// -------------------------------------------------------------------------
// 11. UI削除
// -------------------------------------------------------------------------

function removeAddedUI() {
  [
    "sort-drafts-btn",
    "filter-drafts-btn",
    "filter-location-attested-btn",
  ].forEach((id) => {
    const el = document.getElementById(id);

    if (el) el.remove();
  });

  document
    .querySelectorAll(
      `.${classNames.locationBadge}, .${classNames.distanceBadge}, .${classNames.btnAutoSave}`,
    )
    .forEach((el) => el.remove());
}

// -------------------------------------------------------------------------
// 12. ライフサイクル
// -------------------------------------------------------------------------

function start() {
  if (isActive) return;

  isActive = true;

  injectStyles();
  addSortButton();
  autoSaver.addButtons();

  if (!observer) {
    observer = new MutationObserver(() => {
      if (!isActive) return;

      injectStyles();
      addSortButton();
      scheduleDraftStateApply();
      autoSaver.addButtons();
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

  if (observer) {
    observer.disconnect();
  }

  if (draftStateApplyTimer !== null) {
    clearTimeout(draftStateApplyTimer);
    draftStateApplyTimer = null;
  }

  autoSaver.stopWaitingForSaveButton();

  draftMap.clear();

  removeAddedUI();
  removeStyles();
}

// -------------------------------------------------------------------------
// 13. SPAルーティング変化
// -------------------------------------------------------------------------

function handleLocationChange() {
  const path = window.location.pathname;

  if (path === TARGET_PATH) {
    start();
    return;
  }

  if (path === EDIT_PATH) {
    stop();
    autoSaver.startWaitingForSaveButton();
    return;
  }

  if (path === DRAFT_SUCCESS_PATH) {
    stop();
    autoSaver.handleDraftSuccessPage();
    return;
  }

  stop();
}

const originalPushState = history.pushState;

history.pushState = function (...args) {
  originalPushState.apply(this, args);
  handleLocationChange();
};

const originalReplaceState = history.replaceState;

history.replaceState = function (...args) {
  originalReplaceState.apply(this, args);
  handleLocationChange();
};

window.addEventListener("popstate", handleLocationChange);

// 初回実行
handleLocationChange();
