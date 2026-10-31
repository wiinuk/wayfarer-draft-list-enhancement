const classNamePrefix = "wf";
export const classNames = Object.freeze({
    styleId: `${classNamePrefix}-enhancement-styles`,
    externalUpdateFilteredDraft: `${classNamePrefix}-external-update-filtered-draft`,
    externalUpdateNotice: `${classNamePrefix}-external-update-notice`,
});

const globalStyles = `
        .${classNames.externalUpdateFilteredDraft} {
            display: none !important;
        }

        .${classNames.externalUpdateNotice} {
            box-sizing: border-box;
            flex: 0 0 100%;
            grid-column: 1 / -1;
            padding: 12px 16px;
            color: #664d03;
            background: #fff3cd;
            border: 1px solid #ffecb5;
            border-radius: 4px;
            font-size: 14px;
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
