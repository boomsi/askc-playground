/**
 * Unified App - usePanels Hook 模式
 * 与 CounterMacOS 相同的模式，直接导出 usePanels hook
 *
 * @version 4.0.0 - Export usePanels hook directly (same as CounterMacOS)
 */
import './preview-runtime';

import { usePanels } from './panels';

// keel 沙箱 eval 环境没有 module/exports 变量，构建器尾部的自动登记
// （__keel.guest = module.exports...）拿不到模块导出；keel 的设计即由
// guest 源码显式登记（engine.ts: "verify user script set __keel.guest"）。
// guest 属性设为不可写，防止构建器兜底逻辑把它覆盖回空对象。
const guestExports = { usePanels };
const globalScope = globalThis as Record<string, unknown>;
if (!globalScope.__keel) {
  globalScope.__keel = {};
}
Object.defineProperty(globalScope.__keel, 'guest', {
  value: guestExports,
  writable: false,
  configurable: false,
});

export { usePanels };
