/**
 * app.js
 * Entry point facade. New implementation lives under ./app/.
 */
export { selectSession } from './app/index.js';

import { startApp } from './app/index.js';

void startApp();
