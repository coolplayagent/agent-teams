/**
 * components/messageRenderer/transcriptGrouping.js
 * Shared processed transcript grouping for history replay and terminal streams.
 */
import { formatMessage } from '../../utils/i18n.js';

export function normalizeProcessedTranscript(container, options = {}) {
    if (!container || typeof document === 'undefined') {
        return null;
    }
    unwrapNestedMessagesInToolGroups(container);
    if (directChildren(container).some(node => hasClass(node, 'tool-group'))) {
        return null;
    }

    const transcriptNodes = directChildren(container).filter(isTranscriptNode);
    const groupStartIndex = firstGroupableTranscriptIndex(transcriptNodes);
    const groupableNodes = groupStartIndex >= 0
        ? transcriptNodes.slice(groupStartIndex)
        : [];
    if (groupableNodes.length === 0) {
        return null;
    }
    const lastWork = findLastWorkLocation(groupableNodes);
    if (!lastWork) {
        return null;
    }

    const finalStart = findFinalStartAfterWork(groupableNodes, lastWork);
    const firstGroupedNode = groupableNodes[0];
    const { group, body } = createToolGroup(container, options, groupableNodes, lastWork);
    container.insertBefore(group, firstGroupedNode);

    let movedCount = 0;
    for (const node of groupableNodes) {
        if (node === finalStart?.message) {
            movedCount += moveMessageChildrenBefore(node, body, finalStart.child);
            appendFinalDivider(body);
            cleanupMessage(node);
            break;
        }
        movedCount += moveTranscriptNodeIntoBody(node, body);
    }

    if (movedCount === 0) {
        group.remove?.();
        return null;
    }
    wireToolGroupAnimation(group, body);
    return group;
}

function unwrapNestedMessagesInToolGroups(container) {
    Array.from(container.querySelectorAll?.('.tool-group-body > .message') || [])
        .forEach(message => {
            const body = message.parentNode;
            const contentEl = messageContent(message);
            if (body && contentEl) {
                directChildNodes(contentEl).forEach(child => {
                    body.insertBefore(child, message);
                });
            }
            message.remove?.();
        });
}

export function flattenTranscriptMessages(container, options = {}) {
    if (!container || typeof document === 'undefined') {
        return 0;
    }
    const nodes = directChildren(container);
    let activeMessage = null;
    let activeContent = null;
    let activeKey = '';
    let removedCount = 0;

    nodes.forEach(node => {
        if (!hasClass(node, 'message')) {
            activeMessage = null;
            activeContent = null;
            activeKey = '';
            return;
        }
        if (!isFlattenableMessage(node, options)) {
            activeMessage = null;
            activeContent = null;
            activeKey = '';
            return;
        }
        const contentEl = messageContent(node);
        const key = flattenMessageKey(node);
        if (!activeMessage || !activeContent || !key || key !== activeKey) {
            activeMessage = node;
            activeContent = contentEl;
            activeKey = key;
            return;
        }
        directChildNodes(contentEl).forEach(child => {
            activeContent.appendChild(child);
        });
        node.remove?.();
        removedCount += 1;
    });

    return removedCount;
}

export function formatElapsed(ms) {
    const totalSeconds = Math.round(ms / 1000);
    if (totalSeconds < 60) return `${totalSeconds}s`;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes < 60) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainMinutes = minutes % 60;
    return remainMinutes > 0 ? `${hours}h ${remainMinutes}m` : `${hours}h`;
}

function isFlattenableMessage(message, options = {}) {
    const role = String(message?.dataset?.role || '').trim().toLowerCase();
    if (role === 'user') {
        return false;
    }
    if (hasClass(message, 'message-injection')) {
        return false;
    }
    const contentEl = messageContent(message);
    if (!contentEl) {
        return false;
    }
    if (options.requireWorkOrText === true) {
        return directChildNodes(contentEl).some(child => isWorkPart(child) || isFinalPart(child));
    }
    return true;
}

function firstGroupableTranscriptIndex(transcriptNodes) {
    for (let index = 0; index < transcriptNodes.length; index += 1) {
        if (!isLeadingUserPromptMessage(transcriptNodes[index])) {
            return index;
        }
    }
    return -1;
}

function isLeadingUserPromptMessage(node) {
    return hasClass(node, 'message')
        && String(node?.dataset?.role || '').trim().toLowerCase() === 'user';
}

function flattenMessageKey(message) {
    const runId = String(message?.dataset?.runId || '').trim();
    const streamKey = String(message?.dataset?.streamKey || '').trim();
    const instanceId = String(message?.dataset?.instanceId || '').trim();
    const roleId = String(message?.dataset?.roleId || '').trim();
    const roleLabel = String(message?.dataset?.roleLabel || '').trim();
    const role = String(message?.dataset?.role || '').trim();
    return [
        runId,
        streamKey || instanceId || roleId || roleLabel,
        role,
        roleLabel,
    ].join('::');
}

function createToolGroup(container, options, transcriptNodes, lastWork) {
    const label = processedGroupLabel(container, options, transcriptNodes, lastWork);
    const group = document.createElement('details');
    group.className = 'tool-group';
    group.innerHTML = `
        <summary class="tool-group-summary">
            <span class="tool-group-line" aria-hidden="true"></span>
            <span class="tool-group-label">${label}</span>
            <span class="tool-group-toggle" aria-hidden="true">></span>
            <span class="tool-group-line" aria-hidden="true"></span>
        </summary>
    `;
    const body = document.createElement('div');
    body.className = 'tool-group-body msg-content';
    group.appendChild(body);
    return { group, body };
}

function processedGroupLabel(container, options, transcriptNodes, lastWork) {
    const durationText = processedDuration(container, transcriptNodes, lastWork);
    const durationSuffix = durationText ? ` (${durationText})` : '';
    return formatMessage('tool.group.processed', { duration: durationSuffix }).trim();
}

function processedDuration(container, transcriptNodes, lastWork) {
    const firstMessage = transcriptNodes.find(node => hasClass(node, 'message'));
    const firstTime = Date.parse(
        container.dataset?.roundStartedAt
        || container.dataset?.roundCreatedAt
        || container.dataset?.roundFirstMessageAt
        || firstMessage?.dataset?.createdAt
        || '',
    );
    const lastTime = Date.parse(
        container.dataset?.roundUpdatedAt
        || container.dataset?.roundLastMessageAt
        || lastWork.message?.dataset?.createdAt
        || '',
    );
    return Number.isFinite(firstTime) && Number.isFinite(lastTime) && lastTime > firstTime
        ? formatElapsed(lastTime - firstTime)
        : '';
}

function findLastWorkLocation(transcriptNodes) {
    for (let nodeIndex = transcriptNodes.length - 1; nodeIndex >= 0; nodeIndex -= 1) {
        const node = transcriptNodes[nodeIndex];
        if (!hasClass(node, 'message')) {
            continue;
        }
        const contentEl = messageContent(node);
        const children = directChildNodes(contentEl);
        for (let childIndex = children.length - 1; childIndex >= 0; childIndex -= 1) {
            const child = children[childIndex];
            if (isWorkPart(child)) {
                return { nodeIndex, childIndex, message: node, child };
            }
        }
    }
    return null;
}

function findFinalStartAfterWork(transcriptNodes, lastWork) {
    for (let nodeIndex = lastWork.nodeIndex; nodeIndex < transcriptNodes.length; nodeIndex += 1) {
        const node = transcriptNodes[nodeIndex];
        if (!hasClass(node, 'message')) {
            continue;
        }
        const contentEl = messageContent(node);
        const children = directChildNodes(contentEl);
        const startIndex = node === lastWork.message ? lastWork.childIndex + 1 : 0;
        for (let childIndex = startIndex; childIndex < children.length; childIndex += 1) {
            const child = children[childIndex];
            if (isFinalPart(child)) {
                return { message: node, child };
            }
        }
    }
    return null;
}

function moveTranscriptNodeIntoBody(node, body) {
    if (hasClass(node, 'message')) {
        const movedCount = moveAllMessageChildren(node, body);
        cleanupMessage(node);
        return movedCount;
    }
    body.appendChild(node);
    return 1;
}

function moveAllMessageChildren(message, body) {
    const contentEl = messageContent(message);
    let movedCount = 0;
    directChildNodes(contentEl).forEach(child => {
        body.appendChild(child);
        movedCount += 1;
    });
    return movedCount;
}

function moveMessageChildrenBefore(message, body, boundaryChild) {
    const contentEl = messageContent(message);
    let movedCount = 0;
    for (const child of directChildNodes(contentEl)) {
        if (child === boundaryChild) {
            break;
        }
        body.appendChild(child);
        movedCount += 1;
    }
    return movedCount;
}

function appendFinalDivider(body) {
    const divider = document.createElement('div');
    divider.className = 'tool-group-final-divider';
    divider.setAttribute('aria-hidden', 'true');
    body.appendChild(divider);
}

function cleanupMessage(message) {
    const contentEl = messageContent(message);
    if (contentEl && directChildNodes(contentEl).length > 0) {
        return;
    }
    message.hidden = true;
    if (typeof message.remove === 'function') {
        message.remove();
    }
}

function wireToolGroupAnimation(group, body) {
    group.addEventListener?.('click', (event) => {
        if (!event.target.closest('.tool-group-summary')) return;
        event.preventDefault();
        if (group.open) {
            body.animate(
                [
                    { opacity: 1, maxHeight: `${body.scrollHeight}px` },
                    { opacity: 0, maxHeight: '0px' },
                ],
                { duration: 180, easing: 'ease' },
            ).onfinish = () => { group.open = false; };
        } else {
            group.open = true;
            body.animate(
                [
                    { opacity: 0, maxHeight: '0px' },
                    { opacity: 1, maxHeight: `${body.scrollHeight}px` },
                ],
                { duration: 200, easing: 'ease' },
            );
        }
    });
}

function isTranscriptNode(node) {
    return (
        hasClass(node, 'message')
        || hasClass(node, 'message-inject-marker')
        || hasClass(node, 'message-history-divider')
    );
}

function isWorkPart(node) {
    return hasClass(node, 'thinking-block') || hasClass(node, 'tool-block');
}

function isFinalPart(node) {
    if (!node || isWorkPart(node)) {
        return false;
    }
    if (node.nodeType === 3) {
        return String(node.textContent || '').trim().length > 0;
    }
    return !!(
        hasClass(node, 'msg-text')
        || hasClass(node, 'prompt-content-block')
        || hasClass(node, 'media-ref')
        || String(node.textContent || '').trim()
    );
}

function messageContent(message) {
    return message?.querySelector?.('.msg-content') || null;
}

function directChildren(node) {
    return Array.from(node?.children || []);
}

function directChildNodes(node) {
    return Array.from(node?.childNodes || node?.children || []);
}

function hasClass(node, className) {
    if (node?.classList?.contains?.(className)) {
        return true;
    }
    return String(node?.className || '').split(/\s+/).includes(className);
}
