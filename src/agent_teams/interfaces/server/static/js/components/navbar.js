/**
 * components/navbar.js
 * Wires UI toggle controls for the header navigation and sidebar overlays.
 */
import { els } from '../utils/dom.js';

export function setupNavbarBindings() {
    _initSidebarResize();

    if (els.sidebarToggleBtn) {
        els.sidebarToggleBtn.onclick = () => {
            const collapsed = els.sidebar.classList.toggle('collapsed');
            if (collapsed) {
                localStorage.setItem('agent_teams_sidebar_collapsed', '1');
            } else {
                localStorage.setItem('agent_teams_sidebar_collapsed', '0');
            }
        };
    }

    if (els.inspectorToggleBtn) {
        els.inspectorToggleBtn.onclick = () => {
            els.inspectorPanel.classList.toggle('collapsed');
        };
    }

    if (els.themeToggleBtn) {
        els.themeToggleBtn.onclick = () => {
            document.body.classList.toggle('light-theme');
            const isLight = document.body.classList.contains('light-theme');
            localStorage.setItem('agent_teams_theme', isLight ? 'light' : 'dark');
        };

        // Load theme from localStorage on start
        const savedTheme = localStorage.getItem('agent_teams_theme');
        if (savedTheme === 'light') {
            document.body.classList.add('light-theme');
        }
    }
}

function _initSidebarResize() {
    if (!els.sidebar) return;

    const savedWidth = localStorage.getItem('agent_teams_sidebar_width');
    let initialWidth = 280;
    if (savedWidth && /^\d+$/.test(savedWidth)) {
        const px = Number(savedWidth);
        if (px >= 180 && px <= 520) {
            els.sidebar.style.width = `${px}px`;
            els.sidebar.style.setProperty('--sidebar-width', `${px}px`);
            initialWidth = px;
        }
    }
    document.documentElement.style.setProperty('--sidebar-width', `${initialWidth}px`);

    const collapsed = localStorage.getItem('agent_teams_sidebar_collapsed');
    if (collapsed === '1') {
        els.sidebar.classList.add('collapsed');
    }

    if (!els.sidebarResizer) return;
    let dragging = false;

    const onMove = (e) => {
        if (!dragging || !els.sidebar || els.sidebar.classList.contains('collapsed')) return;
        const next = Math.max(180, Math.min(520, e.clientX));
        els.sidebar.style.width = `${next}px`;
        els.sidebar.style.setProperty('--sidebar-width', `${next}px`);
        document.documentElement.style.setProperty('--sidebar-width', `${next}px`);
        localStorage.setItem('agent_teams_sidebar_width', String(next));
    };

    const onUp = () => {
        if (!dragging) return;
        dragging = false;
        els.sidebarResizer.classList.remove('dragging');
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
    };

    els.sidebarResizer.addEventListener('mousedown', (e) => {
        if (els.sidebar.classList.contains('collapsed')) return;
        dragging = true;
        els.sidebarResizer.classList.add('dragging');
        document.body.style.userSelect = 'none';
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        e.preventDefault();
    });
}
