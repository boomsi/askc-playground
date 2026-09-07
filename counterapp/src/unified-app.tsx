/**
 * Unified App - usePanels Hook 模式
 * 与 CounterMacOS 相同的模式，直接导出 usePanels hook
 *
 * @version 4.0.0 - Export usePanels hook directly (same as CounterMacOS)
 */
import './preview-runtime';

import { usePanels } from './panels';

// 预览 footer 直接从 guest 全局读取导出，避免 keel bundle 的 CommonJS 捕获丢失 named export。
const previewGuestExports = { usePanels };
(globalThis as Record<string, unknown>).__ASKC_PREVIEW_GUEST__ = previewGuestExports;

export { usePanels };
