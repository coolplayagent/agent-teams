export function renderAppShell(root, state) {
  root.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar" aria-label="会话">
        <div class="brand">agent-teams</div>
        <button class="icon-button" type="button" aria-label="新建会话">+</button>
      </aside>
      <main class="workspace">
        <header class="toolbar">
          <span>${state.backendLabel}</span>
          <div class="toolbar-actions">
            <a class="version-switch" href="/" aria-label="返回旧版" title="返回旧版">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M19 12H9m0 0 4-4m-4 4 4 4"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.8"
                />
                <path
                  d="M18 5H7.5A2.5 2.5 0 0 0 5 7.5v9A2.5 2.5 0 0 0 7.5 19H18"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-width="1.8"
                />
              </svg>
              <span>返回旧版</span>
            </a>
            <button class="ghost-button" type="button">设置</button>
          </div>
        </header>
        <section class="composer" aria-label="新建会话">
          <h1>开始一个新会话</h1>
          <textarea placeholder="描述你的目标、约束和期望输出"></textarea>
          <div class="actions">
            <button class="primary-button" type="button">开始会话</button>
          </div>
        </section>
      </main>
    </div>
  `;
}
