# AskcPreview

Askc 预览器：使用 React Native 宿主加载并预览 Keel guest bundle。

## 环境要求

- Node.js `>=20`
- Yarn `4.18.0`（项目已固定版本）
- Bun（用于构建 guest bundle 和执行 askc CLI）
- `git` 与 GitHub SSH key（仅执行 `build:askc` 时需要访问 `git@github.com:boomsi/askit.git`）
- iOS 调试：Xcode、CocoaPods、已启动的 iOS Simulator
- Android 调试：Android Studio、Android SDK 和已启动的模拟器或设备

## 首次安装

在项目根目录执行：

```bash
corepack yarn install
```

`askit` 和 `keel` 都直接从 GitHub 的 `main` 分支安装，不需要额外准备同级目录。

如果本机的 `yarn` 命令仍指向旧的全局 Yarn，可直接使用项目内固定版本：

```bash
node .yarn/releases/yarn-stable-temp.cjs install
```

首次进行 iOS 调试，安装原生依赖：

```bash
corepack yarn pod:install
```

如果本机使用代理，可通过 `https_proxy` / `http_proxy` 传入代理地址；`pod:install` 默认使用 `http://127.0.0.1:7890`。

## 初始化新的 AskcPreview 工程

当前仓库内置了初始化 CLI，不需要发布到 npm。可以从仓库根目录把完整模板复制到外部目录：

```bash
corepack yarn init:preview ../my-preview
```

也可以直接调用 CLI：

```bash
node cli/create-askc-preview.cjs ../my-preview
```

目标目录非空时默认拒绝覆盖；确认需要覆盖同名文件时加上 `--force`：

```bash
corepack yarn init:preview ../my-preview --force
```

如果以后为 AskcPreview 配置了 Git SSH 地址，也可以不发布 npm，直接从 Git 仓库执行 CLI：

```bash
npm exec --yes \
  --package=git+ssh://git@github.com:<owner>/<askc-preview-repo>.git \
  -- create-askc-preview ../my-preview
```

这里的 `<owner>/<askc-preview-repo>` 需要替换为 AskcPreview 自己的仓库地址，不能使用 `askit` 或 `keel` 的仓库地址。

## 启动调试

### 1. 启动开发服务

```bash
corepack yarn dev
```

这个命令会：

1. 构建 `counterapp/src/unified-app.tsx` 为 `counterapp/app.js`；
2. 启动 Metro，端口为 `8084`；
3. 监听 `counterapp/src`、guest footer 以及 `askit` / `keel` 源码变化；
4. guest 源码修改后自动重新构建，预览器检测到新 bundle 后自动重载。

`corepack yarn start` 是 `corepack yarn dev` 的别名。Metro 不会由其他命令自动启动，8084 需要保持这个终端进程运行。

### 2. 启动 iOS

先打开并启动一台 iOS Simulator，然后在另一个终端执行：

```bash
corepack yarn ios
```

`corepack yarn ios` 会编译、安装并启动模拟器中的 AskcPreview。iOS 宿主和 guest bundle 都使用 Metro 的 `8084` 端口，因此 `corepack yarn dev` 必须保持运行。

### 3. 启动 Android

保持 `corepack yarn dev` 运行，再执行：

```bash
corepack yarn android
```

### 停止开发服务

在运行 `corepack yarn dev` 的终端按 `Ctrl+C`。如果 8084 仍被占用，先查出进程再结束它：

```bash
lsof -nP -iTCP:8084 -sTCP:LISTEN
kill <PID>
```

## 日常开发

- 修改 `App.tsx`：由 React Native Fast Refresh 更新宿主页面。
- 修改 `counterapp/src`：`corepack yarn dev` 自动重新生成 guest bundle，预览器自动重载 guest。
- 修改 `counterapp/preview-footer.js`：同样会触发 guest bundle 重建。
- 只想手动构建 guest bundle：

  ```bash
  corepack yarn build
  ```

- 构建可交付的 `.askc` 包：

  ```bash
  corepack yarn build:askc
  ```

  `build:askc` 会临时通过 SSH 拉取 `boomsi/askit` 的 `main` 分支，直接执行其中的 `cli/askc.ts`，构建结束后自动清理临时 checkout。它仍然使用本项目已安装的 `keel`，不会依赖同级 askit 源码目录，也不会修改 askit 仓库。

## 常见问题

### `keel/host could not be found`

确认 8084 没有残留进程后，重新安装依赖并启动 Metro：

```bash
corepack yarn install
corepack yarn dev
```

如果刚切换过依赖来源，先重新执行一次：

```bash
corepack yarn install
```

如果 `corepack yarn install` 报 `Unsupported workflow` 或 `invalid key: core.autocrlf`，说明 Corepack 没有使用项目固定版本；改用上面的项目内固定 Yarn 命令。

### guest bundle 加载失败或页面没有更新

确认 `corepack yarn dev` 正在运行，并检查终端是否出现 guest bundle 构建错误。必要时停止并重新启动 `corepack yarn dev`，确保 Metro 使用最新配置。

### iOS CocoaPods 依赖异常

重新执行：

```bash
corepack yarn pod:install
```

### `Cannot read property 'setup'` 或 guest 区域白屏

这是 guest bundle 与当前 `keel/main` 运行时不匹配，或 8084 提供了旧 bundle。确认依赖已从 `main` 安装，并重启 `corepack yarn dev`；不要直接编辑生成的 `counterapp/app.js`。

项目使用的是自己的 fork `https://github.com/boomsi/keel.git#main`；原仓库 `https://github.com/Actrium/keel.git` 作为 `upstream` 保持不变。具体运行时命名以 fork 当前锁定的 commit 为准，更新依赖后不要混用不同来源的 host 与 guest bundle。

## 相关脚本

| 命令 | 作用 |
| --- | --- |
| `corepack yarn dev` | 构建 guest、启动 Metro `8084` 并监听 guest 源码 |
| `corepack yarn init:preview [dir]` | 将当前完整工程模板初始化到目标目录 |
| `corepack yarn build` | 只构建 guest bundle，根目录的标准构建入口 |
| `corepack yarn build:guest` | `build` 的兼容别名 |
| `corepack yarn build:askc` | 通过 SSH 拉取 askit CLI 并生成 `counterapp/counterapp.askc` |
| `corepack yarn ios` | 编译并启动 iOS Simulator |
| `corepack yarn android` | 启动 Android 调试构建 |
| `corepack yarn pod:install` | 安装 iOS CocoaPods 原生依赖 |
| `corepack yarn lint` | 执行 ESLint |
| `corepack yarn test` | 执行 Jest 测试 |
