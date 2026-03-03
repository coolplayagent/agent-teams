/**
 * components/workflow/edges.js
 * SVG edge creation and DAG edge drawing.
 */

export function createEdgeSvg() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'dag-edges');
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', 'arrow');
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '8');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '6');
    marker.setAttribute('markerHeight', '6');
    marker.setAttribute('orient', 'auto-start-reverse');
    const pathArrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathArrow.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    pathArrow.setAttribute('fill', 'var(--border-color)');
    marker.appendChild(pathArrow);
    defs.appendChild(marker);
    svg.appendChild(defs);
    return svg;
}

export function drawEdges(svg, container, layers) {
    while (svg.childNodes.length > 1) {
        svg.removeChild(svg.lastChild);
    }

    const contRect = container.getBoundingClientRect();
    layers.forEach(layer => {
        layer.forEach(node => {
            const sources = node.deps || [];
            if (!sources.length) return;
            sources.forEach(srcId => {
                const srcEl = document.getElementById(`node-${srcId}`);
                const dstEl = document.getElementById(`node-${node.id}`);
                if (!srcEl || !dstEl) return;

                const srcRect = srcEl.getBoundingClientRect();
                const dstRect = dstEl.getBoundingClientRect();
                const startX = srcRect.right - contRect.left;
                const startY = srcRect.top + srcRect.height / 2 - contRect.top;
                const endX = dstRect.left - contRect.left;
                const endY = dstRect.top + dstRect.height / 2 - contRect.top;
                const curve = Math.abs(endX - startX) * 0.5;
                const d = `M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`;
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', d);
                path.setAttribute('class', 'dag-edge-path');
                path.setAttribute('marker-end', 'url(#arrow)');
                svg.appendChild(path);
            });
        });
    });
}
