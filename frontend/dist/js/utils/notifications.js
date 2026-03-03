/**
 * utils/notifications.js
 * Browser notification helpers.
 */

const notifiedApprovalToolCalls = new Set();
let permissionRequested = false;
let inAppToastContainer = null;
let titleFlashTimer = null;
let baseDocumentTitle = '';
let titleFlashBound = false;

export function primeNotificationPermission() {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
    if (Notification.permission !== 'default') return;
    if (permissionRequested) return;

    permissionRequested = true;
    void Notification.requestPermission().catch(() => {
        // Ignore browser-level notification permission errors.
    });
}

export function notifyToolApprovalRequested(payload = {}) {
    const toolCallId = String(payload?.tool_call_id || '');
    if (toolCallId && notifiedApprovalToolCalls.has(toolCallId)) return false;

    const title = 'Approval Required';
    const toolName = String(payload?.tool_name || 'tool');
    const roleId = String(payload?.role_id || '');
    const body = roleId
        ? `${roleId} requests approval for ${toolName}.`
        : `A tool call (${toolName}) is waiting for your approval.`;

    if (typeof window === 'undefined') {
        return false;
    }

    if (toolCallId) {
        notifiedApprovalToolCalls.add(toolCallId);
    }

    startTitleFlash('[Approval Required]');

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        showNotification(title, body, toolCallId);
        return true;
    }

    showInAppToast(body);
    return false;
}

function showNotification(title, body, toolCallId) {
    try {
        const options = {
            body,
            requireInteraction: true,
            tag: toolCallId || `approval-${Date.now()}`,
        };
        const notification = new Notification(title, options);
        notification.onclick = () => {
            try {
                window.focus();
            } catch (_) {
                // Ignore focus errors.
            }
            notification.close();
        };
    } catch (_) {
        // Ignore browser-level notification errors.
    }
}

function showInAppToast(message) {
    const body = document.body;
    if (!body) return;

    if (!inAppToastContainer) {
        inAppToastContainer = document.createElement('div');
        inAppToastContainer.style.position = 'fixed';
        inAppToastContainer.style.right = '12px';
        inAppToastContainer.style.bottom = '12px';
        inAppToastContainer.style.display = 'flex';
        inAppToastContainer.style.flexDirection = 'column';
        inAppToastContainer.style.gap = '8px';
        inAppToastContainer.style.zIndex = '1200';
        body.appendChild(inAppToastContainer);
    }

    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.background = 'rgba(17,24,39,0.92)';
    toast.style.color = '#fff';
    toast.style.border = '1px solid rgba(255,255,255,0.15)';
    toast.style.borderRadius = '8px';
    toast.style.padding = '10px 12px';
    toast.style.maxWidth = '320px';
    toast.style.fontSize = '12px';
    toast.style.boxShadow = '0 8px 24px rgba(0,0,0,0.35)';

    inAppToastContainer.appendChild(toast);
    setTimeout(() => {
        toast.remove();
    }, 4000);
}

function startTitleFlash(alertTitle) {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    const currentlyFocused = document.visibilityState === 'visible' && document.hasFocus();
    if (currentlyFocused) return;

    bindTitleResetEvents();
    if (!baseDocumentTitle) {
        baseDocumentTitle = document.title || 'Agent Teams';
    }
    if (titleFlashTimer) return;

    let showAlert = true;
    titleFlashTimer = window.setInterval(() => {
        document.title = showAlert ? alertTitle : baseDocumentTitle;
        showAlert = !showAlert;
    }, 900);
}

function stopTitleFlash() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (titleFlashTimer) {
        window.clearInterval(titleFlashTimer);
        titleFlashTimer = null;
    }
    if (baseDocumentTitle) {
        document.title = baseDocumentTitle;
    }
}

function bindTitleResetEvents() {
    if (titleFlashBound || typeof document === 'undefined' || typeof window === 'undefined') return;
    const resetIfVisible = () => {
        if (document.visibilityState === 'visible' && document.hasFocus()) {
            stopTitleFlash();
        }
    };
    document.addEventListener('visibilitychange', resetIfVisible);
    window.addEventListener('focus', resetIfVisible);
    titleFlashBound = true;
}
