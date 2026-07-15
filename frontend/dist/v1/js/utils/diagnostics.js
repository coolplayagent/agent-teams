/**
 * utils/diagnostics.js
 * Local display preferences and presentation helpers for internal diagnostics.
 */
import { t } from './i18n.js';

export const DIAGNOSTICS_VISIBILITY_EVENT = 'agent-teams-diagnostics-visibility-changed';

const APPEARANCE_STORAGE_KEY = 'agent_teams_appearance';
const LEGACY_VERIFICATION_MARKER = 'Verification failed.';
const LEGACY_VERIFICATION_PATTERN = escapeRegExp(LEGACY_VERIFICATION_MARKER);
const PUBLIC_VERIFICATION_MESSAGES = new Set([
    'The task finished, but verification did not pass. Review the result and continue with corrections if needed.',
    '任务已结束，但验证未通过。请检查结果或继续修正。',
]);

export function areDiagnosticsVisible() {
    const bodyValue = document.body?.dataset?.showDiagnostics;
    if (bodyValue === 'true') {
        return true;
    }
    if (bodyValue === 'false') {
        return false;
    }
    try {
        const raw = localStorage.getItem(APPEARANCE_STORAGE_KEY);
        if (!raw) {
            return false;
        }
        const config = JSON.parse(raw);
        return config?.showDiagnostics === true;
    } catch (e) {
        return false;
    }
}

export function applyDiagnosticsVisibility(enabled) {
    const normalized = enabled === true;
    const previousValue = document.body?.dataset?.showDiagnostics;
    const nextValue = normalized ? 'true' : 'false';
    if (previousValue === nextValue) {
        return;
    }
    if (document.body) {
        document.body.dataset.showDiagnostics = nextValue;
    }
    document.dispatchEvent(
        new CustomEvent(DIAGNOSTICS_VISIBILITY_EVENT, {
            detail: { enabled: normalized },
        }),
    );
}

export function buildDiagnosticPresentation(text, options = {}) {
    const source = String(text || '');
    const suppressUserMessage = options.suppressUserMessage === true;
    const userMessage = t('rounds.verification.user_message');
    if (!source) {
        return {
            text: '',
            hasDetails: false,
            detail: '',
            detailMode: '',
        };
    }
    const legacyReport = extractLegacyVerificationReport(source);
    if (legacyReport.found) {
        const prefix = legacyReport.prefix;
        const rawReport = legacyReport.report;
        const detailPresentation = buildVerificationDetailPresentation(rawReport);
        const showDetails = !suppressUserMessage && areDiagnosticsVisible();
        return {
            text: suppressUserMessage
                ? prefix
                : [prefix, userMessage].filter(Boolean).join('\n\n'),
            hasDetails: showDetails ? detailPresentation.hasDetails : false,
            detail: showDetails ? detailPresentation.detail : '',
            detailMode: showDetails ? detailPresentation.detailMode : '',
        };
    }
    if (suppressUserMessage && isPublicVerificationMessage(source, userMessage)) {
        return {
            text: '',
            hasDetails: false,
            detail: '',
            detailMode: '',
        };
    }
    if (!containsInternalDiagnostic(source)) {
        return {
            text: source,
            hasDetails: false,
            detail: '',
            detailMode: '',
        };
    }
    if (!suppressUserMessage && areDiagnosticsVisible()) {
        return {
            text: source,
            hasDetails: false,
            detail: '',
            detailMode: '',
        };
    }
    const withoutDetails = source
        .replace(/\s*Details:\s*(verification_failed|runtime_guardrail)[\s\S]*$/i, '')
        .replace(/verification_failed\s*runtime_guardrail:[^\n\r]*/gi, '')
        .trim();
    if (suppressUserMessage) {
        return {
            text: withoutDetails && !containsInternalDiagnostic(withoutDetails)
                ? withoutDetails
                : '',
            hasDetails: false,
            detail: '',
            detailMode: '',
        };
    }
    return {
        text: withoutDetails && !containsInternalDiagnostic(withoutDetails)
            ? withoutDetails
            : t('rounds.verification.user_message'),
        hasDetails: false,
        detail: '',
        detailMode: '',
    };
}

export function sanitizeDiagnosticText(text) {
    return buildDiagnosticPresentation(text).text;
}

export function extractLegacyVerificationReport(text) {
    const source = String(text || '');
    const reportStartPattern = new RegExp(
        `(^|\\n)\\s*${LEGACY_VERIFICATION_PATTERN}`,
        'i',
    );
    const markerPattern = new RegExp(LEGACY_VERIFICATION_PATTERN, 'i');
    const legacyIndex = source.search(reportStartPattern);
    if (legacyIndex < 0) {
        return {
            found: false,
            prefix: source,
            report: '',
        };
    }
    const markerOffset = source.slice(legacyIndex).search(markerPattern);
    const reportIndex = legacyIndex + Math.max(0, markerOffset);
    return {
        found: true,
        prefix: source.slice(0, reportIndex).trimEnd(),
        report: source.slice(reportIndex).trim(),
    };
}

export function buildVerificationDetailPresentation(report) {
    const rawReport = String(report || '').trim();
    if (!rawReport) {
        return {
            hasDetails: false,
            detail: '',
            detailMode: '',
        };
    }
    return {
        hasDetails: true,
        detail: rawReport,
        detailMode: 'raw',
    };
}

function containsInternalDiagnostic(text) {
    const source = String(text || '').trim();
    return (
        /\bDetails:\s*(verification_failed|runtime_guardrail)/i.test(source)
        || /^verification_failed\s*runtime_guardrail[:_]/i.test(source)
    );
}

function isPublicVerificationMessage(text, localizedMessage) {
    const normalized = String(text || '').trim();
    if (!normalized) {
        return false;
    }
    return (
        normalized === String(localizedMessage || '').trim()
        || PUBLIC_VERIFICATION_MESSAGES.has(normalized)
    );
}

function escapeRegExp(text) {
    return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
