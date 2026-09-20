import { DraftState } from "./state";
import { PoiItem } from "./drafts-model";
import { getDistance, parseCoordinate } from "./geometry";
import { classNames } from "./global-styles";
import { getDraftIdForCard } from "./ng-context";

function formatDistance(distance: number) {
  return distance < 1
    ? `${Math.round(distance * 1000)} m`
    : `${distance.toFixed(2)} km`;
}

interface CreateDraftsModOptions {
  readonly state: DraftState;
  readonly draftMap: ReadonlyMap<string, PoiItem>;
}

const searchRadiusKm = 0.08;

export function createDraftsMod({ state, draftMap }: CreateDraftsModOptions) {
  let locationCheckInProgress = false;
  let searchApplyTimer: number | null = null;
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

      let locationBadge = draftCard.querySelector(
        `.${classNames.locationBadge}`,
      );

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
          typeof draft.lastModified === "number"
            ? draft.lastModified
            : Infinity,
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

  function addSortButton() {
    if (document.getElementById("sort-drafts-btn")) return;

    const draftHeader = document.querySelector(".drafts-title");
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
  function addSearchInput() {
    if (document.getElementById("search-drafts-input")) return;

    const draftHeader = document.querySelector(".drafts-title");
    if (!draftHeader) return;

    const searchContainer = document.createElement("span");
    searchContainer.className = classNames.searchContainer;

    const searchInput = document.createElement("input");
    searchInput.id = "search-drafts-input";
    searchInput.className = classNames.searchInput;
    searchInput.type = "search";
    searchInput.placeholder = "座標で検索 (例: 35.65861, 139.74556)";
    searchInput.setAttribute("aria-label", "座標で下書きを検索");
    searchInput.value = state.value.query ?? "";

    const clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.className = classNames.searchClear;
    clearButton.innerText = "×";
    clearButton.setAttribute("aria-label", "検索条件をクリア");

    const updateClearButton = () => {
      clearButton.style.display = searchInput.value ? "block" : "none";
    };

    searchInput.addEventListener("input", () => {
      updateClearButton();
      if (searchApplyTimer !== null) {
        window.clearTimeout(searchApplyTimer);
      }
      searchApplyTimer = window.setTimeout(() => {
        searchApplyTimer = null;
        state.mapSave((currentState) => ({
          ...currentState,
          query: searchInput.value,
        }));
        applyDraftFilter();
      }, 300);
    });
    clearButton.addEventListener("click", () => {
      searchInput.value = "";
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
      searchInput.focus();
    });

    updateClearButton();
    searchContainer.append(searchInput, clearButton);
    draftHeader.appendChild(searchContainer);
  }
  function isQueryHidden(draft: PoiItem) {
    const query = state.value.query?.trim() ?? "";
    if (!query) return false;

    const coordinates = parseCoordinate(query);
    if (!coordinates) return true;

    return (
      getDistance(
        coordinates.latitude,
        coordinates.longitude,
        draft.lat,
        draft.lng,
      ) >= searchRadiusKm
    );
  }

  function applyDraftFilter() {
    (
      document.querySelectorAll(
        "app-submission-card",
      ) as NodeListOf<HTMLElement>
    ).forEach((card) => {
      const draftId = getDraftIdForCard(card, draftMap);
      const draft = draftId ? draftMap.get(draftId) : undefined;
      if (!draft) return;

      const shouldHide =
        isLocationAttestedHidden(draft) ||
        isReadinessHidden(draft) ||
        isQueryHidden(draft);

      if (card.hidden !== shouldHide) {
        card.hidden = shouldHide;
      }
    });
  }

  function isReadinessHidden(draft: PoiItem) {
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
    return readinessHide;
  }

  function isLocationAttestedHidden(draft: PoiItem) {
    const isAttested = Boolean(draft.locationAttested);
    const locationAttestedHide =
      state.value.locationAttestedFilter !== "all" &&
      (state.value.locationAttestedFilter === "attested") !== isAttested;
    return locationAttestedHide;
  }

  function removeAddedUI() {
    [
      "sort-drafts-btn",
      "filter-drafts-btn",
      "filter-location-attested-btn",
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });

    document.querySelector(`.${classNames.searchContainer}`)?.remove();
    if (searchApplyTimer !== null) {
      window.clearTimeout(searchApplyTimer);
      searchApplyTimer = null;
    }

    document
      .querySelectorAll(
        `.${classNames.locationBadge}, .${classNames.distanceBadge}, .${classNames.btnAutoSave}`,
      )
      .forEach((el) => el.remove());
  }

  return {
    checkCurrentLocation,
    sortDraftCards,
    updateDraftCardBadges,
    addSortButton,
    addSearchInput,
    applyDraftFilter,
    removeAddedUI,
  };
}
