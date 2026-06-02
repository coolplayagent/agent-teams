/**
 * components/messageExport.js
 * Complete transcript export for the legacy chat timeline.
 */
import { fetchSessionRounds } from '../core/api.js';
import {
    setRunPrimaryRole,
    state,
} from '../core/state.js';
import {
    normalizePromptContentParts,
    summarizePromptContentParts,
} from './messageRenderer/helpers/prompt.js';
import { renderRoundSection } from './rounds/timeline.js';
import { showToast } from '../utils/feedback.js';
import { formatMessage, getCurrentLanguage, t } from '../utils/i18n.js';
import { errorToPayload, logError } from '../utils/logger.js';

const EXPORT_ROUND_PAGE_LIMIT = 50;
const EXPORT_CAPTURE_WIDTH = 960;
const MAX_CANVAS_EDGE = 16384;
const MAX_CANVAS_AREA = 268000000;
const DEFAULT_PNG_CHUNK_HEIGHT = 6000;
const SVG_DATA_URL_CHUNK_SIZE = 0x8000;
const STYLE_PATHS = [
    '/css/base.css',
    '/css/components/messages.css',
    '/css/components/rounds.css',
    '/css/components/highlight.css',
    '/css/components/tools.css',
];
const EXPORT_THEME_VARIABLES = [
    '--bg-base',
    '--bg-surface',
    '--bg-surface-glass',
    '--bg-surface-muted',
    '--bg-hover',
    '--bg-hover-strong',
    '--bg-tool-header',
    '--bg-tool-header-hover',
    '--bg-tool-body',
    '--bg-tool-block',
    '--border-color',
    '--text-primary',
    '--text-secondary',
    '--text-on-primary',
    '--text-msg-content',
    '--text-tool-name',
    '--text-tool-args',
    '--text-node-title',
    '--primary',
    '--primary-hover',
    '--button-secondary-bg',
    '--button-secondary-hover',
    '--button-secondary-border',
    '--button-secondary-text',
    '--success',
    '--danger',
    '--warning',
    '--code-bg',
    '--font-ui',
    '--font-mono',
    '--shadow-sm',
    '--shadow-md',
    '--radius-sm',
    '--radius-md',
    '--radius-lg',
];
const SVG_STYLE = `
html,
body {
    margin: 0;
    background: var(--bg-base);
}
body {
    min-height: 100%;
}
.message-export-image-frame {
    background: var(--bg-base);
    color: var(--text-primary);
    font-family: var(--font-ui);
    overflow: visible;
}
body.message-export-page {
    min-height: 100vh;
    height: auto;
    overflow: auto;
    background: var(--bg-base);
    color: var(--text-primary);
}
body.message-export-page .message-export-root {
    width: min(${EXPORT_CAPTURE_WIDTH}px, 100%);
}
`;

let exportBusy = false;
let controlEl = null;
let triggerEl = null;
let menuEl = null;
let htmlButtonEl = null;
let pngButtonEl = null;

export function initializeMessageExport() {
    controlEl = document.getElementById('message-export-control');
    triggerEl = document.getElementById('message-export-btn');
    menuEl = document.getElementById('message-export-menu');
    htmlButtonEl = document.getElementById('message-export-html');
    pngButtonEl = document.getElementById('message-export-png');

    if (!controlEl || !triggerEl || !menuEl) {
        return;
    }

    triggerEl.addEventListener('click', toggleExportMenu);
    htmlButtonEl?.addEventListener('click', () => {
        void downloadCurrentSessionMessagesHtml();
    });
    pngButtonEl?.addEventListener('click', () => {
        void downloadCurrentSessionMessagesPng();
    });
    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('keydown', handleDocumentKeydown);
    document.addEventListener('agent-teams-session-activated', syncExportControlState);
    document.addEventListener('agent-teams-session-selected', syncExportControlState);
    syncExportControlState();
}

export async function downloadCurrentSessionMessagesHtml(options = {}) {
    return runExportTask(async (sessionId) => {
        const exportDocument = await buildExportDocument(sessionId, {
            ...options,
            format: 'html',
        });
        if (!exportDocument) {
            return null;
        }
        const html = await buildStandaloneHtml(exportDocument);
        if (options.download !== false) {
            downloadBlob(
                `${exportDocument.filenameBase}.html`,
                new Blob([html], { type: 'text/html;charset=utf-8' }),
            );
        }
        showToast({
            title: t('message_export.success_title'),
            message: t('message_export.html_success'),
            tone: 'success',
            durationMs: 2200,
        });
        return html;
    });
}

export async function downloadCurrentSessionMessagesPng(options = {}) {
    return runExportTask(async (sessionId) => {
        const exportDocument = await buildExportDocument(sessionId, {
            ...options,
            format: 'png',
        });
        if (!exportDocument) {
            return null;
        }
        const host = attachCaptureHost(exportDocument.root);
        try {
            await waitForImages(exportDocument.root);
            const cssText = await collectExportCss();
            const renderPlan = measurePngRenderPlan(exportDocument.root, {
                maxChunkHeight: options.maxChunkHeight,
            });
            if (
                renderPlan.chunkCount > 1
                && options.allowSplitPng !== true
                && options.download !== false
            ) {
                const confirmed = await confirmLargePngExport(renderPlan);
                if (!confirmed) {
                    showToast({
                        title: t('message_export.png_too_large_title'),
                        message: t('message_export.png_too_large_cancelled'),
                        tone: 'warning',
                        durationMs: 2600,
                    });
                    return [];
                }
            }
            const chunks = await renderRootToPngBlobs(exportDocument.root, cssText, {
                renderPlan,
            });
            chunks.forEach((blob, index) => {
                const suffix = chunks.length > 1
                    ? `-${String(index + 1).padStart(2, '0')}`
                    : '';
                if (options.download !== false) {
                    downloadBlob(`${exportDocument.filenameBase}${suffix}.png`, blob);
                }
            });
            showToast({
                title: t('message_export.success_title'),
                message: chunks.length > 1
                    ? formatMessage('message_export.png_split_success', { count: chunks.length })
                    : t('message_export.png_success'),
                tone: 'success',
                durationMs: 2600,
            });
            return chunks;
        } finally {
            host.remove();
        }
    });
}

export async function collectCompleteSessionRounds(sessionId, options = {}) {
    const safeSessionId = String(sessionId || '').trim();
    if (!safeSessionId) {
        return [];
    }
    const allRounds = [];
    let cursorRunId = '';
    let hasMore = true;
    while (hasMore) {
        const page = await fetchSessionRounds(safeSessionId, {
            limit: EXPORT_ROUND_PAGE_LIMIT,
            cursorRunId: cursorRunId || null,
            priority: options.priority || '',
            forceRefresh: options.forceRefresh === true,
            signal: options.signal,
        });
        const items = Array.isArray(page?.items) ? page.items : [];
        items.forEach(round => {
            allRounds.push(round);
            setRunPrimaryRole(round?.run_id, round?.primary_role_id || null);
        });
        hasMore = page?.has_more === true && items.length > 0;
        cursorRunId = hasMore ? String(page?.next_cursor || '').trim() : '';
        if (hasMore && !cursorRunId) {
            break;
        }
    }
    return sortRoundsAscending(uniqueRoundsByRunId(allRounds));
}

async function runExportTask(task) {
    if (exportBusy) {
        return null;
    }
    const sessionId = currentExportSessionId();
    if (!sessionId) {
        showToast({
            title: t('message_export.no_session_title'),
            message: t('message_export.no_session_message'),
            tone: 'warning',
        });
        syncExportControlState();
        return null;
    }

    setExportBusy(true);
    closeExportMenu();
    try {
        return await task(sessionId);
    } catch (error) {
        logError(
            'frontend.message_export.failed',
            'Failed to export message transcript',
            errorToPayload(error, { session_id: sessionId }),
        );
        showToast({
            title: t('message_export.failed_title'),
            message: formatMessage('message_export.failed_message', {
                error: error?.message || String(error || ''),
            }),
            tone: 'danger',
        });
        return null;
    } finally {
        setExportBusy(false);
    }
}

async function buildExportDocument(sessionId, options = {}) {
    const rounds = await collectCompleteSessionRounds(sessionId, options);
    const selectedRounds = await resolveSelectedExportRounds(rounds, options);
    if (!selectedRounds) {
        return null;
    }
    const title = resolveSessionTitle(sessionId);
    const exportedAt = new Date();
    const root = renderExportRoot({
        sessionId,
        title,
        exportedAt,
        rounds: selectedRounds,
    });
    stripExportInteractions(root);
    return {
        root,
        title,
        sessionId,
        exportedAt,
        filenameBase: exportFilenameBase(sessionId, exportedAt),
    };
}

async function resolveSelectedExportRounds(rounds, options = {}) {
    const items = Array.isArray(rounds) ? rounds : [];
    if (Array.isArray(options.selectedRunIds)) {
        const selectedIds = new Set(options.selectedRunIds.map(value => String(value || '').trim()));
        return items.filter(round => selectedIds.has(String(round?.run_id || '').trim()));
    }
    if (Array.isArray(options.turnIndexes)) {
        const selectedIndexes = new Set(options.turnIndexes.map(value => Number(value)));
        return items.filter((_, index) => selectedIndexes.has(index));
    }
    if (
        items.length <= 1
        || options.promptForRoundSelection === false
        || options.download === false
    ) {
        return items;
    }
    return await showRoundSelectionDialog(items, {
        format: String(options.format || '').trim(),
    });
}

function showRoundSelectionDialog(rounds, options = {}) {
    return new Promise(resolve => {
        const safeRounds = Array.isArray(rounds) ? rounds : [];
        const backdrop = document.createElement('div');
        backdrop.className = 'message-export-dialog-backdrop';
        backdrop.setAttribute('role', 'presentation');

        const panel = document.createElement('section');
        panel.className = 'message-export-dialog';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-labelledby', 'message-export-selection-title');

        const header = document.createElement('header');
        header.className = 'message-export-dialog-header';
        const title = document.createElement('h2');
        title.id = 'message-export-selection-title';
        title.textContent = t('message_export.turn_dialog_title');
        const description = document.createElement('p');
        description.textContent = formatMessage('message_export.turn_dialog_description', {
            format: exportFormatLabel(options.format),
        });
        header.append(title, description);

        const tools = document.createElement('div');
        tools.className = 'message-export-dialog-tools';
        const countEl = document.createElement('span');
        countEl.className = 'message-export-dialog-count';
        const selectAllButton = dialogButton(t('message_export.turn_select_all'), 'secondary');
        const clearButton = dialogButton(t('message_export.turn_clear'), 'secondary');
        tools.append(countEl, selectAllButton, clearButton);

        const list = document.createElement('div');
        list.className = 'message-export-selection-list';
        const selected = new Set();
        const rows = safeRounds.map((round, index) => {
            const key = exportRoundKey(round, index);
            selected.add(key);
            const label = document.createElement('label');
            label.className = 'message-export-selection-row';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = true;
            checkbox.dataset.roundKey = key;

            const copy = document.createElement('span');
            copy.className = 'message-export-selection-copy';
            const name = document.createElement('strong');
            name.textContent = formatMessage('message_export.turn_label', {
                index: index + 1,
            });
            const preview = document.createElement('span');
            preview.textContent = roundExportPreview(round);
            copy.append(name, preview);
            label.append(checkbox, copy);
            list.appendChild(label);
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    selected.add(key);
                } else {
                    selected.delete(key);
                }
                updateState();
            });
            return { checkbox, key, round };
        });

        const footer = document.createElement('footer');
        footer.className = 'message-export-dialog-footer';
        const cancelButton = dialogButton(t('message_export.cancel'), 'secondary');
        const confirmButton = dialogButton(t('message_export.export_selected'), 'primary');
        footer.append(cancelButton, confirmButton);

        panel.append(header, tools, list, footer);
        backdrop.appendChild(panel);
        document.body.appendChild(backdrop);

        const close = value => {
            document.removeEventListener('keydown', onKeydown);
            backdrop.remove();
            resolve(value);
        };
        const updateState = () => {
            const count = selected.size;
            countEl.textContent = formatMessage('message_export.turn_selected_count', {
                count,
                total: rows.length,
            });
            confirmButton.disabled = count === 0;
        };
        const onKeydown = event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                close(null);
            }
        };
        selectAllButton.addEventListener('click', () => {
            rows.forEach(row => {
                row.checkbox.checked = true;
                selected.add(row.key);
            });
            updateState();
        });
        clearButton.addEventListener('click', () => {
            rows.forEach(row => {
                row.checkbox.checked = false;
                selected.delete(row.key);
            });
            updateState();
        });
        cancelButton.addEventListener('click', () => close(null));
        confirmButton.addEventListener('click', () => {
            close(rows
                .filter(row => selected.has(row.key))
                .map(row => row.round));
        });
        backdrop.addEventListener('click', event => {
            if (event.target === backdrop) {
                close(null);
            }
        });
        document.addEventListener('keydown', onKeydown);
        updateState();
        confirmButton.focus();
    });
}

function dialogButton(label, tone) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `message-export-dialog-btn is-${tone}`;
    button.textContent = label;
    return button;
}

function exportRoundKey(round, index) {
    return String(round?.run_id || '').trim() || `index:${index}`;
}

function roundExportPreview(round) {
    const intentParts = normalizePromptContentParts(round?.intent_parts);
    const text = summarizePromptContentParts(intentParts, {
        fallback: String(round?.intent || ''),
    }).replace(/\s+/g, ' ').trim();
    if (text) {
        return text;
    }
    const createdAt = String(round?.created_at || '').trim();
    if (createdAt) {
        return new Date(createdAt).toLocaleString();
    }
    return t('message_export.turn_empty_preview');
}

function exportFormatLabel(format) {
    return String(format || '').trim().toLowerCase() === 'png'
        ? t('message_export.png_format')
        : t('message_export.html_format');
}

function renderExportRoot({ sessionId, title, exportedAt, rounds }) {
    const root = document.createElement('article');
    root.className = 'message-export-root';
    root.dataset.sessionId = sessionId;

    const header = document.createElement('header');
    header.className = 'message-export-header';
    const heading = document.createElement('h1');
    heading.className = 'message-export-title';
    heading.textContent = title || sessionId;
    const meta = document.createElement('div');
    meta.className = 'message-export-meta';
    meta.textContent = formatMessage('message_export.meta', {
        session_id: sessionId,
        exported_at: formatExportDate(exportedAt),
    });
    header.append(heading, meta);
    root.appendChild(header);

    const roundsEl = document.createElement('div');
    roundsEl.className = 'message-export-timeline';
    if (rounds.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'message-export-empty';
        empty.textContent = t('message_export.empty');
        roundsEl.appendChild(empty);
    } else {
        rounds.forEach((round, index) => {
            roundsEl.appendChild(renderRoundSection(round, index, {
                includeDomId: false,
                isLatestRound: index === rounds.length - 1,
            }));
        });
    }
    root.appendChild(roundsEl);
    return root;
}

async function buildStandaloneHtml(exportDocument) {
    const cssText = `${await collectExportCss()}\n\n${buildExportPageCss()}`;
    const root = exportDocument.root.cloneNode(true);
    stripExportInteractions(root);
    const bodyClass = document.body.classList.contains('light-theme')
        ? 'message-export-page light-theme'
        : 'message-export-page';
    return [
        '<!doctype html>',
        `<html lang="${escapeAttribute(getCurrentLanguage())}">`,
        '<head>',
        '<meta charset="UTF-8" />',
        '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
        `<title>${escapeHtml(exportDocument.title || exportDocument.sessionId)}</title>`,
        `<style>${cssText}</style>`,
        '</head>',
        `<body class="${bodyClass}">`,
        root.outerHTML,
        '</body>',
        '</html>',
    ].join('\n');
}

async function collectExportCss() {
    const segments = [];
    const seen = new Set();
    for (const path of STYLE_PATHS) {
        segments.push(await fetchCssWithImports(path, seen));
    }
    segments.push(SVG_STYLE);
    return segments.filter(Boolean).join('\n\n');
}

async function fetchCssWithImports(path, seen) {
    const url = new URL(path, window.location.origin);
    if (seen.has(url.href)) {
        return '';
    }
    seen.add(url.href);
    try {
        const response = await fetch(url.href);
        if (!response.ok) {
            throw new Error(`CSS request failed: ${response.status}`);
        }
        const text = await response.text();
        return inlineCssImports(text, url.href, seen);
    } catch (_) {
        return stylesheetTextFromDocument(url.pathname, seen);
    }
}

async function inlineCssImports(text, baseUrl, seen) {
    const importPattern = /@import\s+url\((["']?)([^"')]+)\1\)\s*;/g;
    const chunks = [];
    let lastIndex = 0;
    for (const match of text.matchAll(importPattern)) {
        chunks.push(text.slice(lastIndex, match.index));
        const importUrl = new URL(match[2], baseUrl);
        chunks.push(await fetchCssWithImports(importUrl.href, seen));
        lastIndex = Number(match.index) + match[0].length;
    }
    chunks.push(text.slice(lastIndex));
    return chunks.join('\n');
}

function stylesheetTextFromDocument(pathname, seen) {
    const sheets = Array.from(document.styleSheets || []);
    const sheet = sheets.find(item => {
        const href = String(item.href || '');
        return href.endsWith(pathname);
    });
    return stylesheetCssText(sheet, seen);
}

function stylesheetCssText(sheet, seen) {
    if (!sheet) {
        return '';
    }
    const href = String(sheet.href || '');
    if (href && seen.has(`sheet:${href}`)) {
        return '';
    }
    if (href) {
        seen.add(`sheet:${href}`);
    }
    try {
        return Array.from(sheet.cssRules || [])
            .map(rule => {
                if (rule.styleSheet) {
                    return stylesheetCssText(rule.styleSheet, seen);
                }
                return rule.cssText || '';
            })
            .join('\n');
    } catch (_) {
        return '';
    }
}

function attachCaptureHost(root) {
    const host = document.createElement('div');
    host.className = 'message-export-capture-host';
    host.appendChild(root);
    document.body.appendChild(host);
    return host;
}

async function renderRootToPngBlobs(root, cssText, options = {}) {
    const plan = options.renderPlan || measurePngRenderPlan(root, options);
    const { width, height, chunkHeight } = plan;
    const chunks = [];
    for (let offset = 0; offset < height; offset += chunkHeight) {
        const currentHeight = Math.min(chunkHeight, height - offset);
        chunks.push(await renderRootChunkToPngBlob(root, cssText, {
            width,
            height: currentHeight,
            offset,
        }));
    }
    return chunks;
}

function measurePngRenderPlan(root, options = {}) {
    const width = Math.max(1, Math.ceil(root.getBoundingClientRect().width || EXPORT_CAPTURE_WIDTH));
    const height = Math.max(1, Math.ceil(root.scrollHeight || root.getBoundingClientRect().height || 1));
    const chunkHeight = resolveCanvasChunkHeight(width, height, options.maxChunkHeight);
    return {
        width,
        height,
        chunkHeight,
        chunkCount: Math.max(1, Math.ceil(height / chunkHeight)),
    };
}

function confirmLargePngExport(plan) {
    return new Promise(resolve => {
        const backdrop = document.createElement('div');
        backdrop.className = 'message-export-dialog-backdrop';
        backdrop.setAttribute('role', 'presentation');

        const panel = document.createElement('section');
        panel.className = 'message-export-dialog message-export-warning-dialog';
        panel.setAttribute('role', 'alertdialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-labelledby', 'message-export-png-warning-title');

        const header = document.createElement('header');
        header.className = 'message-export-dialog-header';
        const title = document.createElement('h2');
        title.id = 'message-export-png-warning-title';
        title.textContent = t('message_export.png_too_large_title');
        const description = document.createElement('p');
        description.textContent = formatMessage('message_export.png_too_large_message', {
            count: plan.chunkCount,
            height: plan.height,
            limit: plan.chunkHeight,
        });
        header.append(title, description);

        const footer = document.createElement('footer');
        footer.className = 'message-export-dialog-footer';
        const cancelButton = dialogButton(t('message_export.cancel'), 'secondary');
        const confirmButton = dialogButton(
            formatMessage('message_export.png_split_confirm', { count: plan.chunkCount }),
            'primary',
        );
        footer.append(cancelButton, confirmButton);

        panel.append(header, footer);
        backdrop.appendChild(panel);
        document.body.appendChild(backdrop);

        const close = value => {
            document.removeEventListener('keydown', onKeydown);
            backdrop.remove();
            resolve(value);
        };
        const onKeydown = event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                close(false);
            }
        };
        cancelButton.addEventListener('click', () => close(false));
        confirmButton.addEventListener('click', () => close(true));
        backdrop.addEventListener('click', event => {
            if (event.target === backdrop) {
                close(false);
            }
        });
        document.addEventListener('keydown', onKeydown);
        confirmButton.focus();
    });
}

async function renderRootChunkToPngBlob(root, cssText, { width, height, offset }) {
    const clone = root.cloneNode(true);
    stripExportInteractions(clone);
    clone.style.width = `${width}px`;
    clone.style.maxWidth = `${width}px`;
    const svgText = buildSvgDocument({
        root: clone,
        cssText: `${cssText}\n\n${buildExportPageCss()}`,
        width,
        height,
        offset,
    });
    const image = await loadImage(svgTextToDataUrl(svgText));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('Canvas rendering is unavailable.');
    }
    context.drawImage(image, 0, 0);
    return await canvasToPngBlob(canvas);
}

function buildSvgDocument({ root, cssText, width, height, offset }) {
    const svgNamespace = 'http://www.w3.org/2000/svg';
    const xhtmlNamespace = 'http://www.w3.org/1999/xhtml';
    const svgDocument = document.implementation.createDocument(svgNamespace, 'svg', null);
    const svg = svgDocument.documentElement;
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    const foreignObject = svgDocument.createElementNS(svgNamespace, 'foreignObject');
    foreignObject.setAttribute('width', String(width));
    foreignObject.setAttribute('height', String(height));

    const frame = svgDocument.createElementNS(xhtmlNamespace, 'div');
    frame.setAttribute('class', 'message-export-image-frame');
    frame.setAttribute(
        'style',
        [
            `width:${width}px`,
            `height:${height}px`,
            'overflow:hidden',
            'background:var(--bg-base)',
            'color:var(--text-primary)',
        ].join(';'),
    );

    const style = svgDocument.createElementNS(xhtmlNamespace, 'style');
    style.textContent = cssText;

    const viewport = svgDocument.createElementNS(xhtmlNamespace, 'div');
    viewport.setAttribute(
        'style',
        [
            `width:${width}px`,
            `transform:translateY(-${offset}px)`,
        ].join(';'),
    );
    viewport.appendChild(svgDocument.importNode(root, true));
    frame.append(style, viewport);
    foreignObject.appendChild(frame);
    svg.appendChild(foreignObject);
    return new XMLSerializer().serializeToString(svgDocument);
}

function resolveCanvasChunkHeight(width, height, requestedMaxHeight) {
    const byArea = Math.floor(MAX_CANVAS_AREA / Math.max(width, 1));
    const safeHeight = Math.max(1, Math.min(MAX_CANVAS_EDGE, byArea));
    const maxHeight = Number.isFinite(Number(requestedMaxHeight))
        ? Math.max(1, Math.floor(Number(requestedMaxHeight)))
        : Math.min(safeHeight, DEFAULT_PNG_CHUNK_HEIGHT);
    return Math.min(height, safeHeight, maxHeight);
}

function svgTextToDataUrl(svgText) {
    const bytes = new TextEncoder().encode(String(svgText || ''));
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += SVG_DATA_URL_CHUNK_SIZE) {
        const chunk = bytes.slice(offset, offset + SVG_DATA_URL_CHUNK_SIZE);
        binary += String.fromCharCode(...chunk);
    }
    return `data:image/svg+xml;base64,${btoa(binary)}`;
}

function loadImage(url) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Image export rendering failed.'));
        image.src = url;
    });
}

function canvasToPngBlob(canvas) {
    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
            if (blob) {
                resolve(blob);
                return;
            }
            reject(new Error('PNG export failed.'));
        }, 'image/png');
    });
}

async function waitForImages(root) {
    const images = Array.from(root.querySelectorAll('img'));
    await Promise.all(images.map(image => {
        if (image.complete) {
            return Promise.resolve();
        }
        return new Promise(resolve => {
            image.addEventListener('load', resolve, { once: true });
            image.addEventListener('error', resolve, { once: true });
        });
    }));
}

function uniqueRoundsByRunId(rounds) {
    const byRunId = new Map();
    rounds.forEach(round => {
        const runId = String(round?.run_id || '').trim();
        if (!runId || byRunId.has(runId)) {
            return;
        }
        byRunId.set(runId, round);
    });
    return Array.from(byRunId.values());
}

function sortRoundsAscending(rounds) {
    return (Array.isArray(rounds) ? rounds : []).slice().sort((left, right) =>
        sortableTimestamp(left?.created_at) - sortableTimestamp(right?.created_at),
    );
}

function sortableTimestamp(value) {
    const timestamp = Date.parse(String(value || ''));
    return Number.isFinite(timestamp) ? timestamp : 0;
}

function stripExportInteractions(root) {
    root.querySelectorAll([
        '.message-copy-actions',
        '.round-scroll-bottom-btn',
        '.markdown-code-copy',
        '.tool-approval-controls',
        'button',
        'input',
        'select',
        'textarea',
        'script',
        'link',
    ].join(',')).forEach(node => node.remove());
    root.querySelectorAll('[data-image-preview-trigger]').forEach(node => {
        node.removeAttribute('data-image-preview-trigger');
        node.removeAttribute('data-image-preview-src');
        node.removeAttribute('data-image-preview-name');
        node.removeAttribute('role');
        node.removeAttribute('tabindex');
        node.removeAttribute('title');
    });
}

function buildExportPageCss() {
    return `
body.message-export-page,
.message-export-image-frame {
${exportThemeDeclarations()}    background: var(--bg-base);
    color: var(--text-primary);
}
body.message-export-page {
    width: auto;
    min-height: 100vh;
    height: auto;
    margin: 0;
    overflow: auto;
}
body.message-export-page .message-export-root {
    width: min(${EXPORT_CAPTURE_WIDTH}px, 100%);
}
.message-export-image-frame .message-export-root {
    width: ${EXPORT_CAPTURE_WIDTH}px;
    max-width: ${EXPORT_CAPTURE_WIDTH}px;
}
`;
}

function exportThemeDeclarations() {
    const styles = getComputedStyle(document.body);
    return EXPORT_THEME_VARIABLES
        .map(name => {
            const value = String(styles.getPropertyValue(name) || '').trim();
            return value ? `    ${name}: ${value};\n` : '';
        })
        .filter(Boolean)
        .join('');
}

function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => {
        URL.revokeObjectURL(url);
    }, 0);
}

function toggleExportMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!triggerEl || triggerEl.disabled) {
        return;
    }
    const isOpen = !menuEl?.hidden;
    setExportMenuOpen(!isOpen);
}

function handleDocumentClick(event) {
    if (!controlEl || controlEl.contains(event.target)) {
        return;
    }
    closeExportMenu();
}

function handleDocumentKeydown(event) {
    if (event.key === 'Escape') {
        closeExportMenu();
    }
}

function closeExportMenu() {
    setExportMenuOpen(false);
}

function setExportMenuOpen(open) {
    if (!menuEl || !triggerEl) {
        return;
    }
    menuEl.hidden = !open;
    triggerEl.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function setExportBusy(nextBusy) {
    exportBusy = nextBusy;
    syncExportControlState();
}

function syncExportControlState() {
    if (!triggerEl) {
        return;
    }
    const disabled = exportBusy || !currentExportSessionId();
    triggerEl.disabled = disabled;
    triggerEl.dataset.busy = exportBusy ? 'true' : 'false';
    if (htmlButtonEl) {
        htmlButtonEl.disabled = disabled;
    }
    if (pngButtonEl) {
        pngButtonEl.disabled = disabled;
    }
    if (disabled) {
        closeExportMenu();
    }
}

function currentExportSessionId() {
    return String(state.currentSessionId || '').trim();
}

function resolveSessionTitle(sessionId) {
    const sessionItem = Array.from(document.querySelectorAll('.session-item'))
        .find(item => String(item.getAttribute('data-session-id') || '').trim() === sessionId);
    const candidates = [
        sessionItem?.getAttribute?.('data-session-title'),
        sessionItem?.querySelector?.('.session-label-text')?.textContent,
        sessionItem?.querySelector?.('.session-title')?.textContent,
        sessionItem?.querySelector?.('.session-id')?.textContent,
    ];
    for (const candidate of candidates) {
        const title = sanitizeExportTitle(candidate);
        if (title) {
            return title;
        }
    }
    return sessionId;
}

function sanitizeExportTitle(value) {
    let text = String(value || '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!text) {
        return '';
    }
    let previous = '';
    while (text && text !== previous) {
        previous = text;
        text = text
            .replace(/\s+(?:刚刚|just now|now)$/iu, '')
            .replace(/\s+\d+\s*(?:秒|分|分钟|小时|时|天|日|周|星期|个月|月|年)(?:前)?$/u, '')
            .replace(/\s+\d+\s*(?:s|sec|secs|m|min|mins|h|hr|hrs|d|day|days|w|wk|wks|mo|mos|y|yr|yrs)(?:\s+ago)?$/iu, '')
            .replace(/([^\d\s])\d+\s*(?:秒|分|分钟|小时|时|天|日|周|星期|个月|月|年)(?:前)?$/u, '$1')
            .trim();
    }
    return text;
}

function exportFilenameBase(sessionId, date) {
    return `agent-teams-${safeFilenameToken(sessionId)}-messages-${timestampForFilename(date)}`;
}

function safeFilenameToken(value) {
    return String(value || 'session')
        .trim()
        .replace(/[^a-zA-Z0-9_.-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        || 'session';
}

function timestampForFilename(date) {
    const value = date instanceof Date ? date : new Date();
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    const hour = String(value.getHours()).padStart(2, '0');
    const minute = String(value.getMinutes()).padStart(2, '0');
    const second = String(value.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}-${hour}${minute}${second}`;
}

function formatExportDate(date) {
    return new Intl.DateTimeFormat(getCurrentLanguage(), {
        dateStyle: 'medium',
        timeStyle: 'medium',
    }).format(date);
}


function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function escapeAttribute(value) {
    return escapeHtml(value);
}
