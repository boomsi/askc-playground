# create-askc-preview

初始化一个 [AskcPreview](https://github.com/boomsi/askc-playground) 预览宿主工程：React Native + keel 真实运行时 + 示例 guest 应用（counterapp），用于在真机/模拟器上调试 askc 应用。

## 用法

```bash
bunx @boomsi/create-askc-preview my-preview

# bun 的脚手架约定（@scope/create-foo 对应 @scope/foo）
bun create @boomsi/askc-preview my-preview
```

## 初始化完成后

```bash
cd my-preview
corepack yarn install
corepack yarn pod:install   # 首次 iOS 调试需要（Xcode + CocoaPods）
corepack yarn dev           # 构建 guest 并启动 Metro（8084）
corepack yarn ios           # 编译并启动 iOS 模拟器
```

## 运行环境

- Node.js `>=20`、Yarn 4（`corepack` 提供）、Bun（构建 guest）
- iOS 调试：Xcode + CocoaPods；Android 调试：Android Studio
- 依赖中的 `keel` / `askit` 来自 GitHub（需要相应访问权限）

## 相关工具

- [`@boomsi/create-askc-app`](https://www.npmjs.com/package/@boomsi/create-askc-app)：初始化独立的 askc 应用（guest）工程，构建产物为 `.askc` 交付包。
