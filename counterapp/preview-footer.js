/* global __rill_sendBatch, globalThis */

/**
 * 预览器专用 footer：只展示 right 面板，并由宿主预览层负责滚动。
 *
 * 真实 askc 宿主会分别提取 left/right 面板，再把 right 放进
 * ExtensionPanelShell；当前预览器只有一个 EngineView，因此不能直接使用
 * 默认 footer 的双栏布局。
 */

(function () {
  // 只在 keel/main guest 运行时已注入且具备批量发送能力时启动预览渲染。
  if (typeof __rill_sendBatch === 'function' && globalThis.__rill && globalThis.__rill.guest) {
    try {
      var React = globalThis.React;
      // guest 没有 React 运行时就停止渲染，避免继续访问未注入的全局对象。
      if (!React) {
        console.error('[askc-preview] React not found, cannot render');
        return;
      }

      var RillReconciler = globalThis.RillReconciler;
      // reconciler 未注入时无法把 guest 树发送到宿主，直接输出可定位日志。
      if (!RillReconciler || !RillReconciler.render) {
        console.error('[askc-preview] RillReconciler not found, cannot render');
        return;
      }

      // 优先读取预览 guest 显式登记的导出，避免 CJS module.exports 丢失 named export。
      var GuestExport =
        globalThis.__ASKC_PREVIEW_GUEST__ || globalThis.__rill.guest;

      // usePanels 应用在预览器中只渲染 right 面板，避免空的 left 面板占用一半高度。
      if (typeof GuestExport.usePanels === 'function') {
        var usePanelsHook = GuestExport.usePanels;

        // 预览器用原生 ScrollView 承载 guest 内容，保证内容超出屏幕后可以上下滚动。
        function PreviewPanelWrapper() {
          var panels = usePanelsHook();
          return React.createElement(
            'ScrollView',
            {
              style: { flex: 1 },
              // 与 Loom ExtensionPanelShell.scrollContent 保持一致，保证预览边距所见即所得。
              contentContainerStyle: {
                paddingTop: 30,
                paddingBottom: 28,
              },
            },
            panels.right
          );
        }

        RillReconciler.render(
          React.createElement(PreviewPanelWrapper),
          __rill_sendBatch
        );
        return;
      }

      // 没有 usePanels 时保留默认组件导出行为，方便预览普通 guest 页面。
      var Component =
        typeof GuestExport === 'function' ? GuestExport : GuestExport.default || GuestExport;
      // guest 没有可执行的默认组件时停止渲染，避免产生更隐晦的运行时异常。
      if (!Component || typeof Component !== 'function') {
        console.warn('[askc-preview] No valid guest component found');
        return;
      }
      RillReconciler.render(React.createElement(Component), __rill_sendBatch);
    } catch (error) {
      console.error('[askc-preview] Auto-render failed:', error);
    }
  }
})();
