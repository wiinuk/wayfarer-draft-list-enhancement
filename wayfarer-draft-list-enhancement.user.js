// ==UserScript==
// @name         Wayfarer Draft List Enhancement
// @namespace    http://tampermonkey.net/
// @version      1.10.0
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
          console.error(
            "[Wayfarer Draft Sorter] Error parsing API response:",
            e
          );
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
          console.error(
            "[Wayfarer Draft Sorter] Error parsing XHR response:",
            e
          );
        }
      });
      return originalXhrSend.apply(this, args);
    };
    return {
      setIsActive
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

  // src/geometry.ts
  function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
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
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(
      field,
      value
    );
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  // src/react-props.ts
  function getReactProp(element, propertyName) {
    const fiberKey = Object.keys(element).find(
      (key) => key.startsWith("__reactFiber$")
    );
    if (!fiberKey) return void 0;
    let fiber = Reflect.get(element, fiberKey);
    while (fiber && typeof fiber === "object") {
      const node = fiber;
      if (isRecord(node.memoizedProps) && propertyName in node.memoizedProps) {
        return node.memoizedProps[propertyName];
      }
      fiber = node.return;
    }
    return void 0;
  }
  function getDraftIdForCard(element) {
    const draftValue = getReactProp(element, "draft");
    if (!isRecord(draftValue) || typeof draftValue.id !== "string") {
      return;
    }
    return draftValue.id;
  }

  // src/mods/external-update-mod.ts
  var searchRadiusKm = 0.08;
  function isValidUpdate(value) {
    if (!isRecord(value)) return false;
    for (const key of ["lat", "lng"]) {
      const coordinate = value[key];
      if (coordinate !== void 0 && (typeof coordinate !== "number" || !Number.isFinite(coordinate) || (key === "lat" ? coordinate < -90 || coordinate > 90 : coordinate < -180 || coordinate > 180))) {
        return false;
      }
    }
    for (const key of ["title", "description", "statement"]) {
      if (value[key] !== void 0 && typeof value[key] !== "string") {
        return false;
      }
    }
    return true;
  }
  function parseUpdateHash() {
    const match = window.location.hash.match(/^#update=(.+)$/);
    if (!match) return null;
    try {
      const value = JSON.parse(decodeURIComponent(match[1]));
      if (!isValidUpdate(value)) return null;
      return value;
    } catch (error) {
      console.warn(
        "[Wayfarer Draft Sorter] Could not parse update hash:",
        error
      );
      return null;
    }
  }
  function removeSymbols(text) {
    return text.replace(
      // eslint-disable-next-line no-misleading-character-class
      /[\u{3200}-\u{32FF}\u{1F000}-\u{1FFFF}\u{2100}-\u{2BFF}\u{FE00}-\u{FE0F}\u200D]/gu,
      ""
    );
  }
  function getDraftCard(element) {
    const id = getDraftIdForCard(element);
    if (id == null) return;
    return {
      id,
      card: element
    };
  }
  function setCoordinate(lat, lng) {
    const map = document.querySelector('[data-testid="submit-wayspot-map"]');
    if (!map) return false;
    const handler = getReactProp(map, "onLocationSelected");
    if (typeof handler !== "function") return false;
    handler({ lat, lng });
    return true;
  }
  function createExternalDraftUpdateMod({
    storageKey,
    state: state2,
    draftMap: draftMap2
  }) {
    let draftClickStarted = false;
    let draftListObserver = null;
    let draftListPollTimer = null;
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
        return isValidUpdate(value) ? value : null;
      } catch (error) {
        console.warn(
          "[Wayfarer Draft Sorter] Could not load external draft update:",
          error
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
          error
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
    function showDraftList() {
      const draftTabs = Array.from(document.querySelectorAll("nav")).find(
        (navigation) => navigation.querySelectorAll(
          ":scope > button[aria-pressed]"
        ).length === 2
      );
      const buttons = draftTabs?.querySelectorAll(
        ":scope > button[aria-pressed]"
      );
      const draftTab = buttons?.[1];
      if (!draftTab) return false;
      if (draftTab.getAttribute("aria-pressed") !== "true") {
        draftTab.click();
      }
      return true;
    }
    function stop2() {
      stopWaitingForDraftList();
      stopWaitingForFields();
    }
    function waitForDraftList() {
      if (draftListObserver || draftListPollTimer !== null) return;
      if (document.body) {
        draftListObserver = new MutationObserver(processDrafts);
        draftListObserver.observe(document.body, {
          childList: true,
          subtree: true
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
        `${window.location.pathname}${window.location.search}`
      );
      if (update.lat === void 0 || update.lng === void 0) {
        alert("\u66F4\u65B0\u5BFE\u8C61\u3092\u7279\u5B9A\u3059\u308B\u305F\u3081\u3001lat \u3068 lng \u304C\u5FC5\u8981\u3067\u3059\u3002");
        return;
      }
      state2.mapSave((currentState) => ({
        ...currentState,
        query: `${update.lat}, ${update.lng}`,
        sortMode: "distance",
        latitude: update.lat,
        longitude: update.lng
      }));
      processDrafts();
    }
    function processDrafts() {
      const update = loadUpdate();
      if (!update) return;
      if (!showDraftList()) {
        waitForDraftList();
        return;
      }
      const latitude = update.lat;
      const longitude = update.lng;
      const title = update.title;
      if (latitude === void 0 || longitude === void 0 || title === void 0)
        return;
      const candidates = Array.from(
        document.querySelectorAll('[data-testid="draft-card"]')
      ).flatMap((cardElement) => {
        const card = getDraftCard(cardElement);
        const draft = card ? draftMap2.get(card.id) : void 0;
        if (!card || !draft || getDistance(latitude, longitude, draft.lat, draft.lng) > searchRadiusKm) {
          return [];
        }
        return [{ ...card, draft }];
      });
      const exactMatches = candidates.filter(
        ({ draft }) => draft.title === removeSymbols(title)
      );
      if (exactMatches.length !== 1) {
        waitForDraftList();
        return;
      }
      if (draftClickStarted) return;
      draftClickStarted = true;
      stopWaitingForDraftList();
      window.setTimeout(() => {
        const button = exactMatches[0].card.querySelector(
          'button:not([role="checkbox"]):not([aria-haspopup="menu"])'
        );
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
        const hasCoordinates = latitude !== void 0 && longitude !== void 0;
        if (hasCoordinates && !coordinateApplied) {
          if (!setCoordinate(latitude, longitude)) return;
          coordinateApplied = true;
        }
        const fields = [
          ["title", ["textarea#title"]],
          ["description", ["textarea#description"]],
          ["statement", ["textarea#supportingStatement"]]
        ];
        const found = fields.filter(([key]) => update[key] !== void 0).map(
          ([key, selectors]) => [key, findField(selectors)]
        );
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
    return {
      startOnDraftList,
      processDrafts,
      startOnEditPage,
      stopWaitingForFields,
      stop: stop2
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
  var TARGET_PATH = "/submit";
  var EDIT_PATH = "/submit/new";
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
  var externalDraftUpdateMod = createExternalDraftUpdateMod({
    storageKey: externalDraftUpdateStorageKey,
    state,
    draftMap
  });
  var isActive = false;
  function onDraftsReceived(data) {
    if (data && data.result && Array.isArray(data.result.result)) {
      data.result.result.forEach((item) => {
        if (item.id) {
          draftMap.set(item.id, item);
        }
      });
      externalDraftUpdateMod.processDrafts();
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
    if (!observer) {
      observer = new MutationObserver(() => {
        if (!isActive) return;
        injectStyles();
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
    externalDraftUpdateMod.stop();
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
      stop() {
        externalDraftUpdateMod.stop();
      }
    }
  });
})();
