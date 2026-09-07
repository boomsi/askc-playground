#### ASKC 快速上手

`askc` 最终会被放到沙箱中运行，所以需要的能力需要 上层（Host）提供

预览器只直接依赖 `askit/main` 的基础组件和 `EventEmitter`。业务请求适配层位于
`src/preview-api.ts`，用于在预览器中模拟 Loom 的 `ask/http` 通信。

##### API 能力

预览器使用的业务事件配对定义在 `src/preview-api.ts`，宿主 fixture 定义在根目录 `App.tsx`。

统一入口是预览器自己的 `ask` 单例，三个原语按通信语义区分：

- `ask.call(请求事件, 业务参数)`：请求-响应（RPC），响应事件由契约配对表自动查得
- `ask.send(事件, 参数)`：单向通知宿主（无响应）
- `ask.on(事件, 回调)`：订阅宿主推送，返回取消函数

在 `askc` 中使用方式，以 清除历史记录 为例

```ts
import { ask } from './preview-api';

const result = await ask.call('CLEAR_CHAT_HISTORY');
// ... // 业务参数不需要手动传 requestId
// 返回值由 App.tsx 中对应的 previewHandlers 提供
```

说明：

- `requestId` 由 `ask.call` 自动生成（沙箱内唯一），调用方无需传入
- 超时（默认 10s）与业务失败（响应带 `success: false`）都会走 `reject`，记得 `.catch`
- HTTP 请求有特化层 `http`：`import { http } from './preview-api'` 后 `http.get<T>(url)` / `http.post<T>(url, body)`



##### UI 组件

基础组件在 `keel/let` 中引用，比如 `View` `Text` 等
ASKC 提供了部分封装后的 UI 组件，位于 `askc` 中的 `src/ui` 目录下

##### 打包

推荐从 AskcPreview 根目录执行：

```bash
corepack yarn build:askc
```

该命令会通过 SSH 临时拉取 `git@github.com:boomsi/askit.git` 的 `main` 分支执行 askc CLI，产物为 `counterapp/counterapp.askc`。`counterapp` 内的 `build` 和 `build:askc` 仅保留为转发到根目录的兼容命令。


#### ASKC 能力开发

预览器需要关注 `askit/main` 的基础组件，以及本项目的 `preview-api` 适配层。

新增能力步骤

1. 在预览器 `src/preview-api.ts` 中定义 guest 请求与响应事件配对。
2. 在宿主 `App.tsx` 的 `previewHandlers` 中实现 fixture，并通过 `EventEmitter` 回传响应。
3. 如需同步到真实应用，再在 Loom 的宿主事件层实现相同的请求/响应事件。

#### ASKC UI 组件开发

1. 在 `askit` 库 `src/ui` 下创建，注意在外层文件导出
2. 在 `loom` 库 `src/askc-host/runtime/AskcTabView.tsx:hostComponents` 中注册
