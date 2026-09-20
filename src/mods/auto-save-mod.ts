import { PoiItem } from "../drafts-model";
import { classNames } from "../global-styles";
import { getDraftIdForCard } from "../ng-context";

type AutoSaveState = {
  draftId: string;
  startedAt: number;
};

interface CreateAutoSaveOptions {
  readonly autoSaveStorageKey: string;
  readonly draftMap: ReadonlyMap<string, PoiItem>;
}

export function createAutoSaveMod({
  autoSaveStorageKey,
  draftMap,
}: CreateAutoSaveOptions) {
  let saveButtonObserver: MutationObserver | null = null;
  let saveButtonPollTimer: number | null = null;

  function getAutoSaveState(): AutoSaveState | null {
    try {
      const value = sessionStorage.getItem(autoSaveStorageKey);
      if (!value) return null;

      const state = JSON.parse(value);
      if (
        !state ||
        typeof state.draftId !== "string" ||
        typeof state.startedAt !== "number"
      ) {
        return null;
      }

      // 10分以上経過した状態は古いものとして破棄
      if (Date.now() - state.startedAt > 10 * 60 * 1000) {
        sessionStorage.removeItem(autoSaveStorageKey);
        return null;
      }

      return state;
    } catch (e) {
      console.warn(
        "[Wayfarer Draft Sorter] Could not read auto-save state:",
        e,
      );
      return null;
    }
  }

  function setAutoSaveState(draftId: string) {
    const state: AutoSaveState = {
      draftId,
      startedAt: Date.now(),
    };

    try {
      sessionStorage.setItem(autoSaveStorageKey, JSON.stringify(state));
    } catch (e) {
      console.warn(
        "[Wayfarer Draft Sorter] Could not save auto-save state:",
        e,
      );
    }
  }

  function clearAutoSaveState() {
    try {
      sessionStorage.removeItem(autoSaveStorageKey);
    } catch (e) {
      console.warn(
        "[Wayfarer Draft Sorter] Could not clear auto-save state:",
        e,
      );
    }
  }

  /**
   * 下書きカードに「位置認証」ボタンを追加する。
   */
  function addAutoSaveButtons() {
    const draftCards = document.querySelectorAll(
      ".submission-card",
    ) as NodeListOf<HTMLElement>;

    draftCards.forEach((card) => {
      // すでに追加済みなら何もしない
      if (card.querySelector(`.${classNames.btnAutoSave}`)) {
        return;
      }

      const draftId = getDraftIdForCard(card, draftMap);
      if (!draftId) return;

      const draft = draftMap.get(draftId);
      if (!draft) return;

      // 既に位置認証（位置確認）済みの場合はボタンを表示しない
      if (draft.locationAttested) return;

      const title = card.querySelector(".submission-title");
      if (!title) return;

      const button = document.createElement("button");
      button.type = "button";
      button.className = classNames.btnAutoSave;
      button.textContent = "位置認証";
      button.title = "この下書きを変更せずに保存して位置認証します";
      button.addEventListener("click", (event) => {
        // カード自体のクリックイベントを発火させない
        event.preventDefault();
        event.stopPropagation();

        startDraftAutoSave(card, draftId, button);
      });

      title.prepend(button);
    });
  }

  function startDraftAutoSave(
    card: HTMLElement,
    draftId: string,
    button: HTMLButtonElement,
  ) {
    const existingState = getAutoSaveState();

    if (existingState) {
      alert("すでに別の下書きの自動保存処理が進行中です。");
      return;
    }

    setAutoSaveState(draftId);

    button.disabled = true;
    button.textContent = "編集画面へ移動中...";
    button.classList.add(classNames.btnAutoSaveProcessing);

    console.log("[Wayfarer Draft Sorter] Starting draft auto-save:", {
      draftId,
      title: draftMap.get(draftId)?.title || "(unknown)",
    });

    // 元々の app-submission-card のクリック処理を利用する。
    // setTimeout を入れることで、このボタン自身の click イベント
    // が Angular 側のカード処理に干渉する可能性を下げる。
    window.setTimeout(() => {
      if (!document.contains(card)) {
        clearAutoSaveState();
        alert("下書きカードが見つからなくなりました。");
        return;
      }

      card.click();
    }, 50);
  }

  /**
   * 編集画面で「変更を保存」ボタンが有効になるのを待つ。
   */
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
        "button.save-draft-button",
      ) as HTMLButtonElement | null;
      if (!button) return;

      // Angular側が disabled 属性を解除するまで待つ。
      // :disabled だけでなく button.disabled も確認する。
      if (button.disabled) return;

      // 念のため表示状態も確認
      const style = window.getComputedStyle(button);
      if (style.display === "none" || style.visibility === "hidden") {
        return;
      }

      clicked = true;
      console.log(
        "[Wayfarer Draft Sorter] Save button is enabled. Clicking it.",
      );

      button.click();
      stopWaitingForSaveButton();
    };

    // 現在すでにボタンが存在していて有効な場合
    tryClickSaveButton();

    if (clicked) return;

    // 編集画面では現在地取得などによって Angular が
    // disabled 属性を動的に変更するため MutationObserver を使用。
    saveButtonObserver = new MutationObserver(() => {
      tryClickSaveButton();
    });

    saveButtonObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled", "class", "style"],
    });

    // MutationObserverだけでは拾いにくいケースに備えて
    // 軽いポーリングも併用する。
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

  /**
   * 自動保存成功画面に到達したら下書き一覧へ戻す。
   */
  function handleDraftSuccessPage() {
    const state = getAutoSaveState();
    if (!state) return;

    console.log(
      "[Wayfarer Draft Sorter] Draft saved successfully. Returning to draft list.",
    );

    // 少し待ってから一覧へ戻す。
    // 成功画面の描画を完了させてから遷移するため。
    window.setTimeout(() => {
      clearAutoSaveState();

      // Angular Router を使わず URL を直接指定。
      window.location.href = "https://wayfarer.scopely.com/new/submit";
    }, 300);
  }
  return {
    addButtons: addAutoSaveButtons,
    startWaitingForSaveButton,
    stopWaitingForSaveButton,
    handleDraftSuccessPage,
  };
}
