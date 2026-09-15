// ==UserScript==
// @name         Wayfarer Draft List Enhancement
// @namespace    http://tampermonkey.net/
// @version      1.6
// @description  Sort Niantic Wayfarer drafts using precise coordinates from API response
// @match        https://wayfarer.scopely.com/*
// @grant        none
// ==/UserScript==

"use strict";
(() => {
  // src/main.ts
  var TARGET_PATH = "/new/submit";
  var EDIT_PATH = "/new/submit/new";
  var DRAFT_SUCCESS_PATH = "/new/submit/draft-success";
  var autoSaveStorageKey = "wayfarer-draft-auto-save";
  function getAutoSaveState() {
    try {
      const value = sessionStorage.getItem(autoSaveStorageKey);
      if (!value) return null;
      const state = JSON.parse(value);
      if (!state || typeof state.draftId !== "string" || typeof state.startedAt !== "number") {
        return null;
      }
      if (Date.now() - state.startedAt > 10 * 60 * 1e3) {
        sessionStorage.removeItem(autoSaveStorageKey);
        return null;
      }
      return state;
    } catch (e) {
      console.warn("[Wayfarer Draft Sorter] Could not read auto-save state:", e);
      return null;
    }
  }
  function setAutoSaveState(draftId) {
    const state = {
      draftId,
      startedAt: Date.now()
    };
    try {
      sessionStorage.setItem(autoSaveStorageKey, JSON.stringify(state));
    } catch (e) {
      console.warn("[Wayfarer Draft Sorter] Could not save auto-save state:", e);
    }
  }
  function clearAutoSaveState() {
    try {
      sessionStorage.removeItem(autoSaveStorageKey);
    } catch (e) {
      console.warn("[Wayfarer Draft Sorter] Could not clear auto-save state:", e);
    }
  }
  var classNamePrefix = "wf";
  var classNames = {
    styleId: `${classNamePrefix}-enhancement-styles`,
    btn: `${classNamePrefix}-btn`,
    btnSort: `${classNamePrefix}-btn-sort`,
    btnFilter: `${classNamePrefix}-btn-filter`,
    btnLocation: `${classNamePrefix}-btn-location`,
    btnAutoSave: `${classNamePrefix}-btn-auto-save`,
    btnAutoSaveProcessing: `${classNamePrefix}-btn-auto-save-processing`,
    locationBadge: `${classNamePrefix}-location-attested-badge`,
    locationAttested: `${classNamePrefix}-location-attested`,
    distanceBadge: `${classNamePrefix}-distance-badge`
  };
  var globalStyles = `
        /* \u30BD\u30FC\u30C8\u30FB\u30D5\u30A3\u30EB\u30BF\u30FC\u30DC\u30BF\u30F3\u306E\u57FA\u672C\u30B9\u30BF\u30A4\u30EB */
        .${classNames.btn} {
            margin-left: 8px;
            padding: 6px 12px;
            cursor: pointer;
            color: white;
            border: none;
            border-radius: 4px;
            font-size: 14px;
            font-weight: bold;
        }

        .${classNames.btnSort} {
            margin-left: 15px;
            background-color: #f53d00;
        }

        .${classNames.btnFilter} {
            background-color: #1976d2;
        }

        .${classNames.btnLocation} {
            background-color: #388e3c;
        }

        /* \u4F4D\u7F6E\u8A8D\u8A3C\u30DC\u30BF\u30F3 */
        .${classNames.btnAutoSave} {
            margin-left: 10px;
            padding: 5px 10px;
            cursor: pointer;
            color: white;
            background-color: #7b1fa2;
            border: none;
            border-radius: 4px;
            font-size: 12px;
            font-weight: bold;
        }

        .${classNames.btnAutoSave}:hover {
            background-color: #6a1b9a;
        }

        .${classNames.btnAutoSaveProcessing} {
            opacity: 0.7;
            cursor: wait;
        }

        /* \u30AB\u30FC\u30C9\u5185\u30D0\u30C3\u30B8\u306E\u30B9\u30BF\u30A4\u30EB */
        .${classNames.locationBadge} {
            display: none;
            align-items: center;
            justify-content: center;
            margin-left: 8px;
            width: 18px;
            height: 18px;
            border-radius: 50%;
            background: #2e7d32;
            color: white;
            font-size: 12px;
            font-weight: bold;
            vertical-align: middle;
        }

        .${classNames.locationBadge}.${classNames.locationAttested} {
            display: inline-flex;
        }

        .${classNames.locationBadge}.${classNames.locationAttested}::before {
            content: "\u2713";
        }

        .${classNames.distanceBadge} {
            margin-left: 8px;
            font-size: 12px;
            color: #f53d00;
            font-weight: bold;
            background: #ffebeb;
            padding: 2px 6px;
            border-radius: 4px;
        }
    `;
  function injectStyles() {
    if (document.getElementById(classNames.styleId)) return;
    const styleElement = document.createElement("style");
    styleElement.id = classNames.styleId;
    styleElement.textContent = globalStyles;
    (document.head || document.documentElement).appendChild(styleElement);
  }
  function removeStyles() {
    const styleElement = document.getElementById(classNames.styleId);
    if (styleElement) styleElement.remove();
  }
  var draftMap = /* @__PURE__ */ new Map();
  var draftFilterState = "all";
  var locationAttestedFilterState = "all";
  var draftStateStorageKey = "wayfarer-draft-list-state";
  var draftStateVersion = "3";
  var draftSortState = {
    version: draftStateVersion,
    filter: "all",
    locationAttestedFilter: "all",
    sortMode: "unsorted"
  };
  var draftStateApplyTimer = null;
  var locationCheckInProgress = false;
  var observer = null;
  var saveButtonObserver = null;
  var saveButtonPollTimer = null;
  var isActive = false;
  try {
    const savedState = JSON.parse(
      localStorage.getItem(draftStateStorageKey) || "null"
    );
    if (savedState && savedState.version === draftStateVersion) {
      draftFilterState = savedState.filter;
      locationAttestedFilterState = savedState.locationAttestedFilter || "all";
      draftSortState = savedState;
    }
  } catch (e) {
    console.warn("[Wayfarer Draft Sorter] Could not restore state:", e);
  }
  function saveDraftState() {
    try {
      localStorage.setItem(draftStateStorageKey, JSON.stringify(draftSortState));
    } catch (e) {
      console.warn("[Wayfarer Draft Sorter] Could not save state:", e);
    }
  }
  function formatDistance(distance) {
    return distance < 1 ? `${Math.round(distance * 1e3)} m` : `${distance.toFixed(2)} km`;
  }
  function checkCurrentLocation(sortButton) {
    if (draftSortState.sortMode !== "distance" || draftSortState.latitude === void 0 || draftSortState.longitude === void 0 || locationCheckInProgress) {
      return;
    }
    locationCheckInProgress = true;
    sortButton.innerText = "\u8FD1\u3044\u9806\uFF08\u73FE\u5728\u5730\u3092\u78BA\u8A8D\u4E2D...\uFF09";
    const sortLatitude = draftSortState.latitude;
    const sortLongitude = draftSortState.longitude;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        locationCheckInProgress = false;
        const distance = getDistance(
          sortLatitude,
          sortLongitude,
          position.coords.latitude,
          position.coords.longitude
        );
        sortButton.innerText = `\u8FD1\u3044\u9806\uFF08\u57FA\u6E96\u5730\u70B9\u304B\u3089\u7D04 ${formatDistance(
          distance
        )}\uFF09`;
      },
      (error) => {
        locationCheckInProgress = false;
        sortButton.innerText = "\u8FD1\u3044\u9806\uFF08\u73FE\u5728\u5730\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\uFF09";
        console.warn(
          "[Wayfarer Draft Sorter] Could not check current location:",
          error
        );
      }
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
      if (draftSortState.sortMode === "distance") {
        if (draftSortState.latitude === void 0 || draftSortState.longitude === void 0) {
          return;
        }
        sortDraftCards(
          draftSortState.latitude,
          draftSortState.longitude,
          "distance"
        );
      } else if (draftSortState.sortMode === "last-modified") {
        sortDraftCards(0, 0, "last-modified");
      } else {
        updateDraftCardBadges(0, 0, "unsorted");
      }
      addAutoSaveButtons();
    }, 100);
  }
  function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
  function updateDraftCardBadges(userLat, userLon, sortMode) {
    const draftCards = Array.from(
      document.querySelectorAll("app-submission-card")
    );
    draftCards.forEach((draftCard) => {
      const draftId = getDraftIdForCard(draftCard);
      const draft = draftId ? draftMap.get(draftId) : void 0;
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
          `.${classNames.distanceBadge}`
        );
        if (!distBadge) {
          distBadge = document.createElement("span");
          distBadge.className = classNames.distanceBadge;
          title.appendChild(distBadge);
        }
        const distance = draft.lat !== void 0 && draft.lng !== void 0 ? getDistance(userLat, userLon, draft.lat, draft.lng) : Infinity;
        const distanceLabel = distance !== Infinity ? `\u7D04 ${distance.toFixed(2)} km` : "\u4F4D\u7F6E\u4E0D\u660E";
        if (distBadge.innerText !== distanceLabel) {
          distBadge.innerText = distanceLabel;
        }
      }
    });
  }
  function sortDraftCards(userLat, userLon, sortMode) {
    const draftCards = Array.from(
      document.querySelectorAll("app-submission-card")
    );
    const cardItems = [];
    draftCards.forEach((draftCard) => {
      const draftId = getDraftIdForCard(draftCard);
      const draft = draftId ? draftMap.get(draftId) : void 0;
      if (!draft) return;
      cardItems.push({
        element: draftCard,
        title: draft.title,
        distance: sortMode === "distance" && draft.lat !== void 0 && draft.lng !== void 0 ? getDistance(userLat, userLon, draft.lat, draft.lng) : Infinity,
        lastModified: typeof draft.lastModified === "number" ? draft.lastModified : Infinity
      });
    });
    if (cardItems.length === 0) return false;
    cardItems.sort(
      (a, b) => sortMode === "distance" ? a.distance - b.distance : b.lastModified - a.lastModified
    );
    const parent = cardItems[0]?.element.parentElement;
    if (!parent) return false;
    const needsReorder = cardItems.some(
      (item, index) => parent.children[index] !== item.element
    );
    cardItems.forEach((item) => {
      if (needsReorder) {
        parent.appendChild(item.element);
      }
    });
    updateDraftCardBadges(userLat, userLon, sortMode);
    return true;
  }
  function loadDraftCoordinates(data) {
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
  var originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const response = await originalFetch.apply(this, args);
    if (!isActive) return response;
    const url = typeof args[0] === "string" ? args[0] : args[0] instanceof URL ? String(args[0]) : args[0].url;
    if (url && url.includes("/api/v1/vault/submit/get/drafts")) {
      try {
        const clone = response.clone();
        const data = await clone.json();
        loadDraftCoordinates(data);
      } catch (e) {
        console.error("[Wayfarer Draft Sorter] Error parsing API response:", e);
      }
    }
    return response;
  };
  var xhrUrls = /* @__PURE__ */ new WeakMap();
  var originalXhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(...args) {
    xhrUrls.set(this, String(args[1]));
    return originalXhrOpen.apply(this, args);
  };
  var originalXhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function(...args) {
    this.addEventListener("load", () => {
      if (!isActive) return;
      const url = xhrUrls.get(this);
      if (!url || !url.includes("/api/v1/vault/submit/get/drafts")) {
        return;
      }
      try {
        const data = this.responseType === "json" ? this.response : JSON.parse(this.responseText);
        loadDraftCoordinates(data);
      } catch (e) {
        console.error("[Wayfarer Draft Sorter] Error parsing XHR response:", e);
      }
    });
    return originalXhrSend.apply(this, args);
  };
  function inspectValue(value, path, id, matches, visited, state, depth) {
    if (state.nodes >= 5e4 || depth > 8 || value == null) {
      return;
    }
    if (typeof value === "string") {
      if (value === id) {
        matches.push({
          path,
          value: value.slice(0, 500)
        });
      }
      return;
    }
    if (typeof value !== "object" && typeof value !== "function") {
      return;
    }
    if (visited.has(value)) return;
    visited.add(value);
    state.nodes++;
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        inspectValue(
          item,
          `${path}[${index}]`,
          id,
          matches,
          visited,
          state,
          depth + 1
        );
      });
      return;
    }
    Object.keys(value).forEach((key) => {
      let child;
      try {
        child = value[key];
      } catch {
        return;
      }
      inspectValue(
        child,
        `${path}.${key}`,
        id,
        matches,
        visited,
        state,
        depth + 1
      );
    });
  }
  function getDraftIdForCard(element) {
    const card = element.closest("app-submission-card");
    if (!card) return void 0;
    const context = card.__ngContext__;
    if (!context) return void 0;
    if (typeof context === "object" && "23" in context && typeof context[23] === "object" && context[23] != null && "id" in context[23] && typeof context[23].id === "string") {
      return context[23].id;
    }
    for (const id of draftMap.keys()) {
      const matches = [];
      const visited = /* @__PURE__ */ new WeakSet();
      inspectValue(
        context,
        "__ngContext__",
        id,
        matches,
        visited,
        { nodes: 0 },
        0
      );
      if (matches.length > 0) {
        return id;
      }
    }
    return void 0;
  }
  function applyDraftFilter() {
    document.querySelectorAll("app-submission-card").forEach((card) => {
      const draftId = getDraftIdForCard(card);
      const draft = draftId ? draftMap.get(draftId) : void 0;
      if (!draft) return;
      const readiness = Boolean(
        (draft.mainImageGcsPath || draft.mainImageServingUrl) && (draft.supportingImageGcsPaths && draft.supportingImageGcsPaths.length > 0 || draft.supportingImageServingUrls && draft.supportingImageServingUrls.length > 0) && typeof draft.title === "string" && draft.title.trim().length > 0 && typeof draft.description === "string" && draft.description.trim().length > 0
      );
      const readinessHide = draftFilterState !== "all" && draftFilterState === "ready" !== readiness;
      const isAttested = Boolean(draft.locationAttested);
      const locationAttestedHide = locationAttestedFilterState !== "all" && locationAttestedFilterState === "attested" !== isAttested;
      const shouldHide = readinessHide || locationAttestedHide;
      if (card.hidden !== shouldHide) {
        card.hidden = shouldHide;
      }
    });
  }
  function getDraftFilterLabel() {
    if (draftFilterState === "ready") return "\u6E96\u5099\u5B8C\u4E86";
    if (draftFilterState === "not-ready") return "\u4E0D\u53EF";
    return "\u3059\u3079\u3066";
  }
  function getLocationAttestedFilterLabel() {
    if (locationAttestedFilterState === "attested") return "\u78BA\u8A8D\u6E08";
    if (locationAttestedFilterState === "not-attested") return "\u672A\u78BA\u8A8D";
    return "\u3059\u3079\u3066";
  }
  function getSortModeLabel() {
    if (draftSortState.sortMode === "distance") return "\u8FD1\u3044\u9806";
    if (draftSortState.sortMode === "last-modified") return "\u6700\u8FD1\u5909\u66F4\u3057\u305F\u9806";
    return "\u4E26\u3073\u66FF\u3048\u306A\u3044";
  }
  function addAutoSaveButtons() {
    const draftCards = document.querySelectorAll(
      ".submission-card"
    );
    draftCards.forEach((card) => {
      if (card.querySelector(`.${classNames.btnAutoSave}`)) {
        return;
      }
      const draftId = getDraftIdForCard(card);
      if (!draftId) return;
      const draft = draftMap.get(draftId);
      if (!draft) return;
      if (draft.locationAttested) {
        return;
      }
      const title = card.querySelector(".submission-title");
      if (!title) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = classNames.btnAutoSave;
      button.textContent = "\u4F4D\u7F6E\u8A8D\u8A3C";
      button.title = "\u3053\u306E\u4E0B\u66F8\u304D\u3092\u5909\u66F4\u305B\u305A\u306B\u4FDD\u5B58\u3057\u3066\u4F4D\u7F6E\u8A8D\u8A3C\u3057\u307E\u3059";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        startDraftAutoSave(card, draftId, button);
      });
      title.prepend(button);
    });
  }
  function startDraftAutoSave(card, draftId, button) {
    const existingState = getAutoSaveState();
    if (existingState) {
      alert("\u3059\u3067\u306B\u5225\u306E\u4E0B\u66F8\u304D\u306E\u81EA\u52D5\u4FDD\u5B58\u51E6\u7406\u304C\u9032\u884C\u4E2D\u3067\u3059\u3002");
      return;
    }
    setAutoSaveState(draftId);
    button.disabled = true;
    button.textContent = "\u7DE8\u96C6\u753B\u9762\u3078\u79FB\u52D5\u4E2D...";
    button.classList.add(classNames.btnAutoSaveProcessing);
    console.log("[Wayfarer Draft Sorter] Starting draft auto-save:", {
      draftId,
      title: draftMap.get(draftId)?.title || "(unknown)"
    });
    window.setTimeout(() => {
      if (!document.contains(card)) {
        clearAutoSaveState();
        alert("\u4E0B\u66F8\u304D\u30AB\u30FC\u30C9\u304C\u898B\u3064\u304B\u3089\u306A\u304F\u306A\u308A\u307E\u3057\u305F\u3002");
        return;
      }
      card.click();
    }, 50);
  }
  function startWaitingForSaveButton() {
    stopWaitingForSaveButton();
    const state = getAutoSaveState();
    if (!state) {
      console.log("[Wayfarer Draft Sorter] No auto-save operation pending.");
      return;
    }
    console.log("[Wayfarer Draft Sorter] Waiting for save button...");
    let clicked = false;
    const tryClickSaveButton = () => {
      if (clicked) return;
      const button = document.querySelector(
        "button.save-draft-button"
      );
      if (!button) return;
      if (button.disabled) {
        return;
      }
      const style = window.getComputedStyle(button);
      if (style.display === "none" || style.visibility === "hidden") {
        return;
      }
      clicked = true;
      console.log("[Wayfarer Draft Sorter] Save button is enabled. Clicking it.");
      button.click();
      stopWaitingForSaveButton();
    };
    tryClickSaveButton();
    if (clicked) return;
    saveButtonObserver = new MutationObserver(() => {
      tryClickSaveButton();
    });
    saveButtonObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled", "class", "style"]
    });
    saveButtonPollTimer = window.setInterval(() => {
      tryClickSaveButton();
    }, 250);
  }
  function stopWaitingForSaveButton() {
    if (saveButtonObserver) {
      saveButtonObserver.disconnect();
      saveButtonObserver = null;
    }
    if (saveButtonPollTimer !== null) {
      window.clearInterval(saveButtonPollTimer);
      saveButtonPollTimer = null;
    }
  }
  function handleDraftSuccessPage() {
    const state = getAutoSaveState();
    if (!state) {
      return;
    }
    console.log(
      "[Wayfarer Draft Sorter] Draft saved successfully. Returning to draft list."
    );
    window.setTimeout(() => {
      clearAutoSaveState();
      window.location.href = "https://wayfarer.scopely.com/new/submit";
    }, 300);
  }
  function addSortButton() {
    if (document.getElementById("sort-drafts-btn")) return;
    const headers = Array.from(document.querySelectorAll("h2, h3"));
    const draftHeader = headers.find((el) => el.textContent.includes("\u4E0B\u66F8\u304D"));
    if (!draftHeader) return;
    const btn = document.createElement("button");
    btn.id = "sort-drafts-btn";
    btn.classList.add(classNames.btn, classNames.btnSort);
    btn.innerText = getSortModeLabel();
    draftHeader.appendChild(btn);
    const filterBtn = document.createElement("button");
    filterBtn.id = "filter-drafts-btn";
    filterBtn.classList.add(classNames.btn, classNames.btnFilter);
    filterBtn.innerText = `\u63D0\u51FA: ${getDraftFilterLabel()}`;
    draftHeader.appendChild(filterBtn);
    const locFilterBtn = document.createElement("button");
    locFilterBtn.id = "filter-location-attested-btn";
    locFilterBtn.classList.add(classNames.btn, classNames.btnLocation);
    locFilterBtn.innerText = `\u4F4D\u7F6E: ${getLocationAttestedFilterLabel()}`;
    draftHeader.appendChild(locFilterBtn);
    if (draftSortState.sortMode === "distance") {
      checkCurrentLocation(btn);
    }
    filterBtn.addEventListener("click", () => {
      draftFilterState = draftFilterState === "all" ? "ready" : draftFilterState === "ready" ? "not-ready" : "all";
      draftSortState.filter = draftFilterState;
      saveDraftState();
      filterBtn.innerText = `\u63D0\u51FA: ${getDraftFilterLabel()}`;
      applyDraftFilter();
    });
    locFilterBtn.addEventListener("click", () => {
      locationAttestedFilterState = locationAttestedFilterState === "all" ? "attested" : locationAttestedFilterState === "attested" ? "not-attested" : "all";
      draftSortState.locationAttestedFilter = locationAttestedFilterState;
      saveDraftState();
      locFilterBtn.innerText = `\u4F4D\u7F6E: ${getLocationAttestedFilterLabel()}`;
      applyDraftFilter();
    });
    btn.addEventListener("click", () => {
      if (draftSortState.sortMode === "distance") {
        sortDraftCards(0, 0, "last-modified");
        draftSortState = {
          ...draftSortState,
          sortMode: "last-modified"
        };
        saveDraftState();
        btn.innerText = getSortModeLabel();
        return;
      }
      if (draftSortState.sortMode === "last-modified") {
        draftSortState = {
          ...draftSortState,
          sortMode: "unsorted"
        };
        saveDraftState();
        btn.innerText = getSortModeLabel();
        return;
      }
      btn.innerText = "\u4F4D\u7F6E\u60C5\u5831\u3092\u53D6\u5F97\u4E2D...";
      btn.disabled = true;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const userLat = pos.coords.latitude;
          const userLon = pos.coords.longitude;
          if (!sortDraftCards(userLat, userLon, "distance")) {
            alert(
              "\u30BD\u30FC\u30C8\u5BFE\u8C61\u306E\u4E0B\u66F8\u304D\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u30DA\u30FC\u30B8\u3092\u66F4\u65B0\u3057\u3066\u518D\u8A66\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002"
            );
            btn.innerText = getSortModeLabel();
            btn.disabled = false;
            return;
          }
          draftSortState = {
            ...draftSortState,
            sortMode: "distance",
            latitude: userLat,
            longitude: userLon
          };
          saveDraftState();
          btn.innerText = `\u8FD1\u3044\u9806\uFF08\u57FA\u6E96\u5730\u70B9\u304B\u3089\u7D04 ${formatDistance(0)}\uFF09`;
          btn.disabled = false;
        },
        (err) => {
          alert("\u4F4D\u7F6E\u60C5\u5831\u306E\u53D6\u5F97\u306B\u5931\u6557\u3057\u307E\u3057\u305F: " + err.message);
          btn.innerText = getSortModeLabel();
          btn.disabled = false;
        }
      );
    });
  }
  function removeAddedUI() {
    [
      "sort-drafts-btn",
      "filter-drafts-btn",
      "filter-location-attested-btn"
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
    document.querySelectorAll(
      `.${classNames.locationBadge}, .${classNames.distanceBadge}, .${classNames.btnAutoSave}`
    ).forEach((el) => el.remove());
  }
  function start() {
    if (isActive) return;
    isActive = true;
    injectStyles();
    addSortButton();
    addAutoSaveButtons();
    if (!observer) {
      observer = new MutationObserver(() => {
        if (!isActive) return;
        injectStyles();
        addSortButton();
        scheduleDraftStateApply();
        addAutoSaveButtons();
      });
    }
    observer.observe(document.body, {
      childList: true,
      subtree: true
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
    stopWaitingForSaveButton();
    draftMap.clear();
    removeAddedUI();
    removeStyles();
  }
  function handleLocationChange() {
    const path = window.location.pathname;
    if (path === TARGET_PATH) {
      start();
      return;
    }
    if (path === EDIT_PATH) {
      stop();
      startWaitingForSaveButton();
      return;
    }
    if (path === DRAFT_SUCCESS_PATH) {
      stop();
      handleDraftSuccessPage();
      return;
    }
    stop();
  }
  var originalPushState = history.pushState;
  history.pushState = function(...args) {
    originalPushState.apply(this, args);
    handleLocationChange();
  };
  var originalReplaceState = history.replaceState;
  history.replaceState = function(...args) {
    originalReplaceState.apply(this, args);
    handleLocationChange();
  };
  window.addEventListener("popstate", handleLocationChange);
  handleLocationChange();
})();
