import { createInitialState } from './state.js';
import { renderAppShell } from './shell.js';

const appRoot = document.querySelector('#app');
const state = createInitialState();

if (appRoot !== null) {
  renderAppShell(appRoot, state);
}
