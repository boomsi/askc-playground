/**
 * Preview 只保留一个项目级导出入口，但协议实现完全复用 Loom 使用的 askit。
 * 这样 requestId、Keel bridge 命名和请求-响应契约不会在 Preview 再维护一份。
 */
export { ask, http } from 'askit';
