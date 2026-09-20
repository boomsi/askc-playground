'use strict';

/**
 * 把仓库中 git 追踪的文件同步进 template/，作为发布模板快照。
 *
 * 白名单来自 git ls-files：node_modules / Pods / 构建产物等未追踪内容
 * 天然不会混进模板；发布壳自身目录（packages/）也排除在外。
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const packageRoot = __dirname;
const repoRoot = path.resolve(packageRoot, '..', '..');
const templateRoot = path.join(packageRoot, 'template');

const trackedFiles = execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot })
  .toString()
  .split('\0')
  .filter(Boolean)
  // 发布壳自身不入模板（git ls-files 在未提交新文件时本就不含它，此处双保险）。
  .filter((file) => !file.startsWith('packages/'))
  // Yarn 离线缓存是机器本地产物（含依赖的旧快照），不属于模板；
  // 初始化工程会自行 yarn install 重建缓存。
  .filter((file) => !file.includes('/.yarn/cache/'))
  // 已删除但尚未提交的追踪文件会出现在 ls-files 里，跳过不存在的源。
  .filter((file) => fs.existsSync(path.join(repoRoot, file)));

fs.rmSync(templateRoot, { recursive: true, force: true });

for (const file of trackedFiles) {
  const target = path.join(templateRoot, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(repoRoot, file), target);
}

console.log(`[create-askc-preview] 已同步模板：${trackedFiles.length} 个文件`);
