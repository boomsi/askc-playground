const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');
const fs = require('fs');

// 本机还保留旧的 link: 软链接时，让 Metro 可以访问软链接目标；
// 使用者通过 GitHub 安装后这些目录不存在，Metro 会只解析项目 node_modules。
const localDependencyFolders = [
  path.resolve(__dirname, '../keel'),
  path.resolve(__dirname, '../askit'),
].filter((folder) => fs.existsSync(folder));

/**
 * askc 预览器 metro 配置：
 * - 通过项目 node_modules 使用 GitHub 安装的 keel/askit 依赖
 * - enhanceMiddleware 把 ./counterapp 的构建产物 serve 为 /guest/app.js
 */
const config = mergeConfig(getDefaultConfig(__dirname), {
  // 仅为当前工作区的历史本地软链接提供 watch 入口，不影响独立安装。
  ...(localDependencyFolders.length > 0 ? { watchFolders: localDependencyFolders } : {}),
  resolver: {
    // 统一从预览器的 node_modules 解析依赖，避免依赖包内再向上找到外部工程。
    disableHierarchicalLookup: true,
    // GitHub 依赖包的源码 import react/react-native 时，复用本工程的 RN 运行时。
    nodeModulesPaths: [
      path.resolve(__dirname, 'node_modules'),
    ],
  },
  server: {
    enhanceMiddleware: (middleware, server) => {
      return (req, res, next) => {
        if (req.url && req.url.split('?')[0] === '/guest/app.js') {
          const appJs = path.resolve(__dirname, 'counterapp/app.js');
          // 返回可诊断的 HTTP 错误，避免缺少 guest bundle 时变成网络连接错误。
          if (!fs.existsSync(appJs)) {
            res.statusCode = 503;
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.end('Guest bundle is missing. Run yarn build:guest first.');
            return;
          }
          res.setHeader('Content-Type', 'application/javascript');
          fs.createReadStream(appJs).pipe(res);
          return;
        }
        if (req.url && req.url.split('?')[0] === '/guest/app-version') {
          const appJs = path.resolve(__dirname, 'counterapp/app.js');
          // 版本接口供 Preview 检测 watch 构建是否已写入新的 guest bundle。
          if (!fs.existsSync(appJs)) {
            res.statusCode = 503;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: 'Guest bundle is missing' }));
            return;
          }
          const { mtimeMs, size } = fs.statSync(appJs);
          res.setHeader('Cache-Control', 'no-store');
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ version: `${mtimeMs}-${size}` }));
          return;
        }
        return middleware(req, res, next);
      };
    },
  },
});

module.exports = config;
