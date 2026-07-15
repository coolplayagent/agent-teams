/**
 * core/eventRouter/notificationEvents.js
 * Handlers for backend-driven notification events.
 */
import { sysLog } from '../../utils/logger.js';
import { notifyFromRequest } from '../../utils/notifications.js';

export function handleNotificationRequested(payload) {
    const notified = notifyFromRequest(payload || {});
    if (!notified) {
        sysLog('Notification requested but no channel delivered.', 'log-info');
    }
}
