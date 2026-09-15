const classNamePrefix = "wf";
export const classNames = Object.freeze({
  styleId: `${classNamePrefix}-enhancement-styles`,
  btn: `${classNamePrefix}-btn`,
  btnSort: `${classNamePrefix}-btn-sort`,
  btnFilter: `${classNamePrefix}-btn-filter`,
  btnLocation: `${classNamePrefix}-btn-location`,
  btnAutoSave: `${classNamePrefix}-btn-auto-save`,
  btnAutoSaveProcessing: `${classNamePrefix}-btn-auto-save-processing`,
  locationBadge: `${classNamePrefix}-location-attested-badge`,
  locationAttested: `${classNamePrefix}-location-attested`,
  distanceBadge: `${classNamePrefix}-distance-badge`,
});

const globalStyles = `
        /* ソート・フィルターボタンの基本スタイル */
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

        /* 位置認証ボタン */
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

        /* カード内バッジのスタイル */
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
            content: "✓";
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

export function injectStyles() {
  if (document.getElementById(classNames.styleId)) return;
  const styleElement = document.createElement("style");
  styleElement.id = classNames.styleId;
  styleElement.textContent = globalStyles;
  (document.head || document.documentElement).appendChild(styleElement);
}

export function removeStyles() {
  const styleElement = document.getElementById(classNames.styleId);
  if (styleElement) styleElement.remove();
}
