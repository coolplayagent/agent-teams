/**
 * components/workflow/layout.js
 * DAG node-level computation and visual compaction.
 */

export function computeNodeLevels(tasks, taskIds) {
    const nodeLevels = {};
    taskIds.forEach(t => {
        nodeLevels[t] = 0;
    });

    let changed = true;
    let guard = 0;
    while (changed && guard < taskIds.length * 4) {
        changed = false;
        guard += 1;
        for (const t of taskIds) {
            const deps = tasks[t].depends_on || [];
            if (deps.length === 0) {
                if (nodeLevels[t] !== 0) {
                    nodeLevels[t] = 0;
                    changed = true;
                }
                continue;
            }
            let maxDep = 0;
            deps.forEach(d => {
                if (nodeLevels[d] !== undefined) {
                    maxDep = Math.max(maxDep, nodeLevels[d]);
                }
            });
            const newLevel = maxDep + 1;
            if (nodeLevels[t] !== newLevel) {
                nodeLevels[t] = newLevel;
                changed = true;
            }
        }
    }

    return nodeLevels;
}

export function compactDagForCanvas(canvas, container, nodeEls) {
    const isFloating = !!canvas.closest('.workflow-panel-floating');
    if (!isFloating) {
        resetDagCompaction(canvas, container, nodeEls);
        return;
    }

    const maxPass = 3;
    for (let pass = 0; pass < maxPass; pass += 1) {
        const avail = Math.max(120, canvas.clientWidth - 8);
        const natural = Math.max(1, container.scrollWidth);
        if (natural <= avail) break;

        const ratio = avail / natural;
        const density = Math.max(0.56, Math.min(1, ratio * (pass === 0 ? 1.0 : 0.95)));
        const gap = Math.max(8, Math.round(64 * density));
        const padX = Math.max(8, Math.round(28 * density));
        const padY = Math.max(8, Math.round(20 * density));
        const nodeMin = Math.max(68, Math.round(130 * density));
        const nodePadY = Math.max(5, Math.round(10 * density));
        const nodePadX = Math.max(7, Math.round(14 * density));
        const titleSize = Math.max(10, Math.round(13 * density));
        const roleSize = Math.max(9, Math.round(11 * density));
        const iconSize = Math.max(12, Math.round(18 * density));

        container.style.gap = `${gap}px`;
        container.style.padding = `${padY}px ${padX}px`;

        nodeEls.forEach(el => {
            el.style.minWidth = `${nodeMin}px`;
            el.style.padding = `${nodePadY}px ${nodePadX}px`;
            const title = el.querySelector('.node-title');
            if (title) title.style.fontSize = `${titleSize}px`;
            const role = el.querySelector('.node-role');
            if (role) role.style.fontSize = `${roleSize}px`;
            const icon = el.querySelector('.node-icon');
            if (icon) icon.style.fontSize = `${iconSize}px`;
        });
    }

    const hasOverflow = container.scrollWidth > canvas.clientWidth + 2;
    canvas.style.overflowX = hasOverflow ? 'auto' : 'hidden';
}

function resetDagCompaction(canvas, container, nodeEls) {
    canvas.style.overflowX = 'auto';
    container.style.gap = '';
    container.style.padding = '';
    nodeEls.forEach(el => {
        el.style.minWidth = '';
        el.style.padding = '';
        const title = el.querySelector('.node-title');
        if (title) title.style.fontSize = '';
        const role = el.querySelector('.node-role');
        if (role) role.style.fontSize = '';
        const icon = el.querySelector('.node-icon');
        if (icon) icon.style.fontSize = '';
    });
}
