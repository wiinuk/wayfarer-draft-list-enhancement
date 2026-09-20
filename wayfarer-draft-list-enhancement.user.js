// ==UserScript==
// @name         Wayfarer Draft List Enhancement
// @namespace    http://tampermonkey.net/
// @version      1.9
// @description  Sort Niantic Wayfarer drafts using precise coordinates from API response
// @match        https://wayfarer.scopely.com/*
// @grant        none
// ==/UserScript==

"use strict";
(() => {
  // src/api-hook.ts
  var draftsPath = "/api/v1/vault/submit/get/drafts";
  function hookApi({
    onDraftsReceived: onDraftsReceived2,
    isActive: initialIsActive
  }) {
    let isActive2 = initialIsActive;
    function setIsActive(value) {
      isActive2 = value;
    }
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
      const response = await originalFetch.apply(this, args);
      if (!isActive2) return response;
      const url = typeof args[0] === "string" ? args[0] : args[0] instanceof URL ? String(args[0]) : args[0].url;
      if (url && url.includes(draftsPath)) {
        try {
          const clone = response.clone();
          const data = await clone.json();
          onDraftsReceived2(data);
        } catch (e) {
          console.error("[Wayfarer Draft Sorter] Error parsing API response:", e);
        }
      }
      return response;
    };
    const xhrUrls = /* @__PURE__ */ new WeakMap();
    const originalXhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(...args) {
      xhrUrls.set(this, String(args[1]));
      return originalXhrOpen.apply(this, args);
    };
    const originalXhrSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(...args) {
      this.addEventListener("load", () => {
        if (!isActive2) return;
        const url = xhrUrls.get(this);
        if (!url || !url.includes(draftsPath)) return;
        try {
          const data = this.responseType === "json" ? this.response : JSON.parse(this.responseText);
          onDraftsReceived2(data);
        } catch (e) {
          console.error("[Wayfarer Draft Sorter] Error parsing XHR response:", e);
        }
      });
      return originalXhrSend.apply(this, args);
    };
    return {
      setIsActive
    };
  }

  // src/global-styles.ts
  var classNamePrefix = "wf";
  var classNames = Object.freeze({
    styleId: `${classNamePrefix}-enhancement-styles`,
    btn: `${classNamePrefix}-btn`,
    btnSort: `${classNamePrefix}-btn-sort`,
    btnFilter: `${classNamePrefix}-btn-filter`,
    btnLocation: `${classNamePrefix}-btn-location`,
    btnAutoSave: `${classNamePrefix}-btn-auto-save`,
    btnAutoSaveProcessing: `${classNamePrefix}-btn-auto-save-processing`,
    searchContainer: `${classNamePrefix}-search-container`,
    searchInput: `${classNamePrefix}-search-input`,
    searchClear: `${classNamePrefix}-search-clear`,
    locationBadge: `${classNamePrefix}-location-attested-badge`,
    locationAttested: `${classNamePrefix}-location-attested`,
    distanceBadge: `${classNamePrefix}-distance-badge`
  });
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

        .${classNames.searchContainer} {
            position: relative;
            display: inline-block;
            margin-left: 8px;
            width: stretch;
            vertical-align: middle;
        }

        .${classNames.searchInput} {
            box-sizing: border-box;
            padding: 5px 32px 5px 8px;
            width: 100%;
            border: 1px solid #c7c7c7;
            border-radius: 4px;
            font-size: 14px;
            font-weight: normal;
        }

        .${classNames.searchClear} {
            position: absolute;
            top: 50%;
            right: 6px;
            display: none;
            padding: 0;
            width: 20px;
            height: 20px;
            transform: translateY(-50%);
            cursor: pointer;
            color: #666;
            background: transparent;
            border: 0;
            font-size: 18px;
            line-height: 20px;
        }

        .${classNames.searchClear}:hover {
            color: #111;
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

  // src/ng-context.ts
  function inspectValue(value, path, id, matches, visited, state2, depth) {
    if (state2.nodes >= 5e4 || depth > 8 || value == null) {
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
    state2.nodes++;
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        inspectValue(
          item,
          `${path}[${index}]`,
          id,
          matches,
          visited,
          state2,
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
        state2,
        depth + 1
      );
    });
  }
  function getDraftIdForCard(element, draftMap2) {
    const card = element.closest("app-submission-card");
    if (!card) return void 0;
    const context = card.__ngContext__;
    if (!context) return void 0;
    if (typeof context === "object" && "23" in context && typeof context[23] === "object" && context[23] != null && "id" in context[23] && typeof context[23].id === "string") {
      return context[23].id;
    }
    for (const id of draftMap2.keys()) {
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
  function findSubmitMapComponent() {
    const root = document.querySelector("app-submit-wayspot-map");
    if (!root) return null;
    const seen = /* @__PURE__ */ new WeakSet();
    const visit = (value, depth) => {
      if (!value || typeof value !== "object" && typeof value !== "function" || depth > 8) {
        return null;
      }
      const object = value;
      if (seen.has(object)) return null;
      seen.add(object);
      const locationSelected = object.locationSelected;
      const hasLocationObservable = locationSelected && typeof locationSelected === "object" && typeof locationSelected.subscribe === "function";
      if (hasLocationObservable && (typeof object.onMapClick === "function" || typeof object._updateMapSelection === "function" && typeof object._applySelectedMarker === "function")) {
        return object;
      }
      for (const child of Object.values(object)) {
        const result = visit(child, depth + 1);
        if (result) return result;
      }
      return null;
    };
    const elements = [root, ...root.querySelectorAll("*")];
    for (const element of elements) {
      const context = element.__ngContext__;
      const component = visit(context, 0);
      if (component) return component;
    }
    return null;
  }
  function setCoordinate(lat, lng) {
    const component = findSubmitMapComponent();
    if (!component) return false;
    const coordinate = { lat, lng };
    if (typeof component.onMapClick === "function") {
      component.onMapClick(coordinate);
      return true;
    }
    if (typeof component._updateMapSelection === "function" && typeof component._applySelectedMarker === "function") {
      component._updateMapSelection(
        coordinate
      );
      component._applySelectedMarker();
      return true;
    }
    return false;
  }

  // src/mods/auto-save-mod.ts
  function createAutoSaveMod({
    autoSaveStorageKey: autoSaveStorageKey2,
    draftMap: draftMap2
  }) {
    let saveButtonObserver = null;
    let saveButtonPollTimer = null;
    function getAutoSaveState() {
      try {
        const value = sessionStorage.getItem(autoSaveStorageKey2);
        if (!value) return null;
        const state2 = JSON.parse(value);
        if (!state2 || typeof state2.draftId !== "string" || typeof state2.startedAt !== "number") {
          return null;
        }
        if (Date.now() - state2.startedAt > 10 * 60 * 1e3) {
          sessionStorage.removeItem(autoSaveStorageKey2);
          return null;
        }
        return state2;
      } catch (e) {
        console.warn(
          "[Wayfarer Draft Sorter] Could not read auto-save state:",
          e
        );
        return null;
      }
    }
    function setAutoSaveState(draftId) {
      const state2 = {
        draftId,
        startedAt: Date.now()
      };
      try {
        sessionStorage.setItem(autoSaveStorageKey2, JSON.stringify(state2));
      } catch (e) {
        console.warn(
          "[Wayfarer Draft Sorter] Could not save auto-save state:",
          e
        );
      }
    }
    function clearAutoSaveState() {
      try {
        sessionStorage.removeItem(autoSaveStorageKey2);
      } catch (e) {
        console.warn(
          "[Wayfarer Draft Sorter] Could not clear auto-save state:",
          e
        );
      }
    }
    function addAutoSaveButtons() {
      const draftCards = document.querySelectorAll(
        ".submission-card"
      );
      draftCards.forEach((card) => {
        if (card.querySelector(`.${classNames.btnAutoSave}`)) {
          return;
        }
        const draftId = getDraftIdForCard(card, draftMap2);
        if (!draftId) return;
        const draft = draftMap2.get(draftId);
        if (!draft) return;
        if (draft.locationAttested) return;
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
        title: draftMap2.get(draftId)?.title || "(unknown)"
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
      const state2 = getAutoSaveState();
      if (!state2) {
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
        if (button.disabled) return;
        const style = window.getComputedStyle(button);
        if (style.display === "none" || style.visibility === "hidden") {
          return;
        }
        clicked = true;
        console.log(
          "[Wayfarer Draft Sorter] Save button is enabled. Clicking it."
        );
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
      const state2 = getAutoSaveState();
      if (!state2) return;
      console.log(
        "[Wayfarer Draft Sorter] Draft saved successfully. Returning to draft list."
      );
      window.setTimeout(() => {
        clearAutoSaveState();
        window.location.href = "https://wayfarer.scopely.com/new/submit";
      }, 300);
    }
    return {
      addButtons: addAutoSaveButtons,
      startWaitingForSaveButton,
      stopWaitingForSaveButton,
      handleDraftSuccessPage
    };
  }

  // src/geometry.ts
  function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
  function parseCoordinate(value) {
    const decimalMatch = value.trim().match(/^([-+]?\d+(?:\.\d+)?)\s*,\s*([-+]?\d+(?:\.\d+)?)$/);
    if (decimalMatch) {
      return validateCoordinates(
        Number(decimalMatch[1]),
        Number(decimalMatch[2])
      );
    }
    const dmsMatch = value.trim().match(
      /^(\d{1,3})°\s*(\d{1,2})['′]\s*(\d+(?:\.\d+)?)\s*["″]\s*([NS])\s+(\d{1,3})°\s*(\d{1,2})['′]\s*(\d+(?:\.\d+)?)\s*["″]\s*([EW])$/i
    );
    if (!dmsMatch) return void 0;
    const latitude = degreesMinutesSecondsToDecimal(
      Number(dmsMatch[1]),
      Number(dmsMatch[2]),
      Number(dmsMatch[3]),
      dmsMatch[4]
    );
    const longitude = degreesMinutesSecondsToDecimal(
      Number(dmsMatch[5]),
      Number(dmsMatch[6]),
      Number(dmsMatch[7]),
      dmsMatch[8]
    );
    return validateCoordinates(latitude, longitude);
  }
  function degreesMinutesSecondsToDecimal(degrees, minutes, seconds, direction) {
    const value = degrees + minutes / 60 + seconds / 3600;
    return /[SW]/i.test(direction) ? -value : value;
  }
  function validateCoordinates(latitude, longitude) {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return void 0;
    }
    return { latitude, longitude };
  }

  // src/mods/draft-card-mod.ts
  function formatDistance(distance) {
    return distance < 1 ? `${Math.round(distance * 1e3)} m` : `${distance.toFixed(2)} km`;
  }
  var searchRadiusKm = 0.08;
  function createDraftsMod({ state: state2, draftMap: draftMap2 }) {
    let locationCheckInProgress = false;
    let searchApplyTimer = null;
    function checkCurrentLocation(sortButton) {
      if (state2.value.sortMode !== "distance" || state2.value.latitude === void 0 || state2.value.longitude === void 0 || locationCheckInProgress) {
        return;
      }
      locationCheckInProgress = true;
      sortButton.innerText = "\u8FD1\u3044\u9806\uFF08\u73FE\u5728\u5730\u3092\u78BA\u8A8D\u4E2D...\uFF09";
      const sortLatitude = state2.value.latitude;
      const sortLongitude = state2.value.longitude;
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
    function updateDraftCardBadges(userLat, userLon, sortMode) {
      const draftCards = Array.from(
        document.querySelectorAll("app-submission-card")
      );
      draftCards.forEach((draftCard) => {
        const draftId = getDraftIdForCard(draftCard, draftMap2);
        const draft = draftId ? draftMap2.get(draftId) : void 0;
        if (!draft) return;
        const title = draftCard.querySelector(".submission-title");
        if (!title) return;
        let locationBadge = draftCard.querySelector(
          `.${classNames.locationBadge}`
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
        const draftId = getDraftIdForCard(draftCard, draftMap2);
        const draft = draftId ? draftMap2.get(draftId) : void 0;
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
    function getDraftFilterLabel() {
      if (state2.value.filter === "ready") return "\u6E96\u5099\u5B8C\u4E86";
      if (state2.value.filter === "not-ready") return "\u4E0D\u53EF";
      return "\u3059\u3079\u3066";
    }
    function getLocationAttestedFilterLabel() {
      if (state2.value.locationAttestedFilter === "attested") return "\u78BA\u8A8D\u6E08";
      if (state2.value.locationAttestedFilter === "not-attested") return "\u672A\u78BA\u8A8D";
      return "\u3059\u3079\u3066";
    }
    function getSortModeLabel() {
      if (state2.value.sortMode === "distance") return "\u8FD1\u3044\u9806";
      if (state2.value.sortMode === "last-modified") return "\u6700\u8FD1\u5909\u66F4\u3057\u305F\u9806";
      return "\u4E26\u3073\u66FF\u3048\u306A\u3044";
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
      filterBtn.innerText = `\u63D0\u51FA: ${getDraftFilterLabel()}`;
      draftHeader.appendChild(filterBtn);
      const locFilterBtn = document.createElement("button");
      locFilterBtn.id = "filter-location-attested-btn";
      locFilterBtn.classList.add(classNames.btn, classNames.btnLocation);
      locFilterBtn.innerText = `\u4F4D\u7F6E: ${getLocationAttestedFilterLabel()}`;
      draftHeader.appendChild(locFilterBtn);
      if (state2.value.sortMode === "distance") {
        checkCurrentLocation(btn);
      }
      filterBtn.addEventListener("click", () => {
        state2.mapSave((s) => {
          return {
            ...s,
            filter: s.filter === "all" ? "ready" : s.filter === "ready" ? "not-ready" : "all"
          };
        });
        filterBtn.innerText = `\u63D0\u51FA: ${getDraftFilterLabel()}`;
        applyDraftFilter();
      });
      locFilterBtn.addEventListener("click", () => {
        state2.mapSave((s) => {
          return {
            ...s,
            locationAttestedFilter: s.locationAttestedFilter === "all" ? "attested" : s.locationAttestedFilter === "attested" ? "not-attested" : "all"
          };
        });
        locFilterBtn.innerText = `\u4F4D\u7F6E: ${getLocationAttestedFilterLabel()}`;
        applyDraftFilter();
      });
      btn.addEventListener("click", () => {
        if (state2.value.sortMode === "distance") {
          sortDraftCards(0, 0, "last-modified");
          state2.mapSave((s) => {
            return {
              ...s,
              sortMode: "last-modified"
            };
          });
          btn.innerText = getSortModeLabel();
          return;
        }
        if (state2.value.sortMode === "last-modified") {
          state2.mapSave((s) => {
            return {
              ...s,
              sortMode: "unsorted"
            };
          });
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
            state2.mapSave((s) => {
              return {
                ...s,
                sortMode: "distance",
                latitude: userLat,
                longitude: userLon
              };
            });
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
      searchInput.placeholder = "\u5EA7\u6A19\u3067\u691C\u7D22 (\u4F8B: 35.65861, 139.74556)";
      searchInput.setAttribute("aria-label", "\u5EA7\u6A19\u3067\u4E0B\u66F8\u304D\u3092\u691C\u7D22");
      searchInput.value = state2.value.query ?? "";
      const clearButton = document.createElement("button");
      clearButton.type = "button";
      clearButton.className = classNames.searchClear;
      clearButton.innerText = "\xD7";
      clearButton.setAttribute("aria-label", "\u691C\u7D22\u6761\u4EF6\u3092\u30AF\u30EA\u30A2");
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
          state2.mapSave((currentState) => ({
            ...currentState,
            query: searchInput.value
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
    function isQueryHidden(draft) {
      const query = state2.value.query?.trim() ?? "";
      if (!query) return false;
      const coordinates = parseCoordinate(query);
      if (!coordinates) return true;
      return getDistance(
        coordinates.latitude,
        coordinates.longitude,
        draft.lat,
        draft.lng
      ) >= searchRadiusKm;
    }
    function applyDraftFilter() {
      document.querySelectorAll(
        "app-submission-card"
      ).forEach((card) => {
        const draftId = getDraftIdForCard(card, draftMap2);
        const draft = draftId ? draftMap2.get(draftId) : void 0;
        if (!draft) return;
        const shouldHide = isLocationAttestedHidden(draft) || isReadinessHidden(draft) || isQueryHidden(draft);
        if (card.hidden !== shouldHide) {
          card.hidden = shouldHide;
        }
      });
    }
    function isReadinessHidden(draft) {
      const readiness = Boolean(
        (draft.mainImageGcsPath || draft.mainImageServingUrl) && (draft.supportingImageGcsPaths && draft.supportingImageGcsPaths.length > 0 || draft.supportingImageServingUrls && draft.supportingImageServingUrls.length > 0) && typeof draft.title === "string" && draft.title.trim().length > 0 && typeof draft.description === "string" && draft.description.trim().length > 0
      );
      const readinessHide = state2.value.filter !== "all" && state2.value.filter === "ready" !== readiness;
      return readinessHide;
    }
    function isLocationAttestedHidden(draft) {
      const isAttested = Boolean(draft.locationAttested);
      const locationAttestedHide = state2.value.locationAttestedFilter !== "all" && state2.value.locationAttestedFilter === "attested" !== isAttested;
      return locationAttestedHide;
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
      document.querySelector(`.${classNames.searchContainer}`)?.remove();
      if (searchApplyTimer !== null) {
        window.clearTimeout(searchApplyTimer);
        searchApplyTimer = null;
      }
      document.querySelectorAll(
        `.${classNames.locationBadge}, .${classNames.distanceBadge}, .${classNames.btnAutoSave}`
      ).forEach((el) => el.remove());
    }
    return {
      checkCurrentLocation,
      sortDraftCards,
      updateDraftCardBadges,
      addSortButton,
      addSearchInput,
      applyDraftFilter,
      removeAddedUI
    };
  }

  // src/state.ts
  function createDraftStateLoader(key, version, defaultValue) {
    let state2;
    function load() {
      try {
        const savedState = JSON.parse(
          localStorage.getItem(key) || "null"
        );
        if (savedState && savedState.version === version) {
          return state2 = savedState ?? defaultValue;
        }
      } catch (e) {
        console.warn("[Wayfarer Draft Sorter] Could not restore state:", e);
      }
      return defaultValue;
    }
    function save() {
      try {
        localStorage.setItem(key, JSON.stringify(state2));
      } catch (e) {
        console.warn("[Wayfarer Draft Sorter] Could not save state:", e);
      }
    }
    function mapSave(mapping) {
      state2 = mapping(state2 ??= load());
      save();
    }
    return {
      load,
      save,
      get value() {
        return state2 ??= load();
      },
      mapSave
    };
  }

  // src/dom-extensions.ts
  function findField(selectors) {
    for (const selector of selectors) {
      const field = document.querySelector(selector);
      if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
        return field;
      }
    }
    return null;
  }
  function setFieldValue(field, value) {
    const prototype = Object.getPrototypeOf(field);
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // src/mods/external-update-mod.ts
  var searchRadiusKm2 = 0.08;
  function parseUpdateHash() {
    const match = window.location.hash.match(/^#update=(.+)$/);
    if (!match) return null;
    try {
      const value = JSON.parse(decodeURIComponent(match[1]));
      if (!value || typeof value !== "object") return null;
      const record = value;
      const update = {};
      for (const key of ["lat", "lng"]) {
        const candidate = record[key];
        if (typeof candidate === "number" && Number.isFinite(candidate)) {
          update[key] = candidate;
        }
      }
      for (const key of ["title", "description", "statement"]) {
        if (typeof record[key] === "string") update[key] = record[key];
      }
      return update;
    } catch (error) {
      console.warn("[Wayfarer Draft Sorter] Could not parse update hash:", error);
      return null;
    }
  }
  function createExternalDraftUpdateMod({
    storageKey,
    state: state2,
    draftMap: draftMap2,
    applyDraftFilter,
    sortDraftCards
  }) {
    let listProcessing = false;
    let draftClickStarted = false;
    let editObserver = null;
    let editPollTimer = null;
    function saveUpdate(update) {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(update));
      } catch (error) {
        console.warn(
          "[Wayfarer Draft Sorter] Could not save external draft update:",
          error
        );
      }
    }
    function loadUpdate() {
      try {
        const value = JSON.parse(
          sessionStorage.getItem(storageKey) ?? "null"
        );
        return value && typeof value === "object" ? value : null;
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
        `${window.location.pathname}${window.location.search}`
      );
      if (update.lat === void 0 || update.lng === void 0) {
        alert("\u66F4\u65B0\u5BFE\u8C61\u3092\u7279\u5B9A\u3059\u308B\u305F\u3081\u3001lat \u3068 lng \u304C\u5FC5\u8981\u3067\u3059\u3002");
      }
    }
    function processDrafts() {
      const update = loadUpdate();
      if (!update || update.lat === void 0 || update.lng === void 0) {
        return;
      }
      state2.mapSave((currentState) => ({
        ...currentState,
        query: `${update.lat}, ${update.lng}`,
        sortMode: "distance",
        latitude: update.lat,
        longitude: update.lng
      }));
      applyDraftFilter();
      sortDraftCards(update.lat, update.lng, "distance");
      const candidates = Array.from(
        document.querySelectorAll(".submission-card")
      ).flatMap((card) => {
        const draftId = getDraftIdForCard(card, draftMap2);
        const draft = draftId ? draftMap2.get(draftId) : void 0;
        if (!draft || getDistance(update.lat, update.lng, draft.lat, draft.lng) > searchRadiusKm2) {
          return [];
        }
        return [{ card, draft }];
      });
      const exactMatches = update.title === void 0 ? [] : candidates.filter(({ draft }) => draft.title === update.title);
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
        const hasCoordinates = latitude !== void 0 && longitude !== void 0;
        if (hasCoordinates && !coordinateApplied) {
          if (!setCoordinate(latitude, longitude)) return;
          coordinateApplied = true;
        }
        const fields = [
          [
            "title",
            [
              "textarea#title",
              "input[formcontrolname=title]",
              "input[name=title]",
              "input[id=title]"
            ]
          ],
          [
            "description",
            [
              "textarea#description",
              "textarea[formcontrolname=description]",
              "textarea[name=description]"
            ]
          ],
          [
            "statement",
            [
              "textarea#supportingStatement",
              "textarea[formcontrolname=supportingStatement]",
              "textarea[formcontrolname=statement]",
              "textarea[name=statement]"
            ]
          ]
        ];
        const found = fields.filter(([key]) => update[key] !== void 0).map(([key, selectors]) => [key, findField(selectors)]);
        if (found.some(([, field]) => !field || field.disabled)) return;
        found.forEach(
          ([key, field]) => setFieldValue(field, String(update[key]))
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
        attributeFilter: ["disabled"]
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
      stopWaitingForFields
    };
  }

  // src/routing.ts
  function startRouting(definition) {
    let previousLifecycle;
    let previousPath;
    function handleLocationChange() {
      const path = window.location.pathname;
      if (previousPath === path) return;
      previousPath = path;
      previousLifecycle?.stop?.();
      previousLifecycle = definition[path];
      previousLifecycle?.start?.();
    }
    const originalPushState = history.pushState;
    history.pushState = function(...args) {
      originalPushState.apply(this, args);
      handleLocationChange();
    };
    const originalReplaceState = history.replaceState;
    history.replaceState = function(...args) {
      originalReplaceState.apply(this, args);
      handleLocationChange();
    };
    window.addEventListener("popstate", handleLocationChange);
    handleLocationChange();
  }

  // src/main.ts
  var TARGET_PATH = "/new/submit";
  var EDIT_PATH = "/new/submit/new";
  var DRAFT_SUCCESS_PATH = "/new/submit/draft-success";
  var autoSaveStorageKey = "wayfarer-draft-auto-save";
  var externalDraftUpdateStorageKey = "wayfarer-external-draft-update";
  var draftStateStorageKey = "wayfarer-draft-list-state";
  var draftStateVersion = "3";
  var draftMap = /* @__PURE__ */ new Map();
  var state = createDraftStateLoader(draftStateStorageKey, draftStateVersion, {
    version: draftStateVersion,
    filter: "all",
    locationAttestedFilter: "all",
    sortMode: "unsorted"
  });
  var draftsMod = createDraftsMod({ state, draftMap });
  var autoSaveMod = createAutoSaveMod({ autoSaveStorageKey, draftMap });
  var externalDraftUpdateMod = createExternalDraftUpdateMod({
    storageKey: externalDraftUpdateStorageKey,
    state,
    draftMap,
    applyDraftFilter: () => draftsMod.applyDraftFilter(),
    sortDraftCards: (latitude, longitude, sortMode) => draftsMod.sortDraftCards(latitude, longitude, sortMode)
  });
  var isActive = false;
  var draftStateApplyTimer = null;
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
        if (state.value.latitude === void 0 || state.value.longitude === void 0) {
          return;
        }
        draftsMod.sortDraftCards(
          state.value.latitude,
          state.value.longitude,
          "distance"
        );
      } else if (state.value.sortMode === "last-modified") {
        draftsMod.sortDraftCards(0, 0, "last-modified");
      } else {
        draftsMod.updateDraftCardBadges(0, 0, "unsorted");
      }
      autoSaveMod.addButtons();
    }, 100);
  }
  function onDraftsReceived(data) {
    if (data && data.result && Array.isArray(data.result.result)) {
      data.result.result.forEach((item) => {
        if (item.id) {
          draftMap.set(item.id, item);
        }
      });
      externalDraftUpdateMod.processDrafts();
      scheduleDraftStateApply();
      console.log("[Wayfarer Draft Sorter] Drafts loaded:", draftMap);
    }
  }
  var apiHook = hookApi({
    onDraftsReceived,
    isActive
  });
  var observer = null;
  function start() {
    if (isActive) return;
    isActive = true;
    apiHook.setIsActive(isActive);
    injectStyles();
    externalDraftUpdateMod.startOnDraftList();
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
      subtree: true
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
        externalDraftUpdateMod.startOnEditPage();
        autoSaveMod.startWaitingForSaveButton();
      }
    },
    [DRAFT_SUCCESS_PATH]: {
      start() {
        autoSaveMod.handleDraftSuccessPage();
      }
    }
  });
})();
