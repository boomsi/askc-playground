#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const path = require('node:path');

// 随包发布的模板快照目录（由 prepack 的 sync-template.cjs 从仓库生成）。
const TEMPLATE_ROOT = path.join(__dirname, 'template');
// 发布壳自身目录：初始化目标不能落在里面，避免污染包内容。
const PACKAGE_ROOT = __dirname;

// 这些目录包含依赖、原生构建缓存或版本控制元数据，不应复制到新工程。
const EXCLUDED_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  'Pods',
  'DerivedData',
  'coverage',
  '.gradle',
]);

// 这些文件是工程的生成产物或本机文件，不属于初始化模板源码。
const EXCLUDED_FILES = new Set([
  '.DS_Store',
  'counterapp/app.js',
  'counterapp/preview-app.js',
  'counterapp/counterapp.askc',
]);

/** 输出 CLI 使用方式。 */
function printUsage() {
  console.log(`
用法：
  create-askc-preview [目标目录] [--force]

示例：
  create-askc-preview
  create-askc-preview ./my-preview
  create-askc-preview ./my-preview --force

说明：
  - 不传目标目录时，初始化当前目录。
  - 目标目录非空时默认拒绝覆盖，使用 --force 才会覆盖同名文件。
  - 初始化完成后依次执行 corepack yarn install、corepack yarn pod:install（首次 iOS 调试）。
`);
}

/** 解析目标目录和覆盖选项。 */
function parseArguments(argv) {
  const options = {
    force: false,
    help: false,
    target: null,
  };

  for (const argument of argv) {
    if (argument === '--force' || argument === '-f') {
      options.force = true;
      continue;
    }

    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }

    if (argument.startsWith('-')) {
      throw new Error(`未知参数：${argument}`);
    }

    if (options.target !== null) {
      throw new Error('只能指定一个目标目录。');
    }

    options.target = argument;
  }

  return options;
}

/** 判断目标路径是否位于发布壳目录内部，避免把包内容复制进包自身。 */
function isInsidePackageRoot(targetPath) {
  const relativePath = path.relative(PACKAGE_ROOT, targetPath);
  return (
    relativePath === '' ||
    (!relativePath.startsWith(`..${path.sep}`) && relativePath !== '..' && !path.isAbsolute(relativePath))
  );
}

/** 判断模板文件是否属于应该复制到初始化工程的模板内容。 */
function shouldCopy(sourcePath) {
  const relativePath = path.relative(TEMPLATE_ROOT, sourcePath);
  if (!relativePath) return true;

  const normalizedPath = relativePath.split(path.sep).join('/');
  const pathSegments = normalizedPath.split('/');
  const fileName = path.basename(normalizedPath);

  // 模板由 git ls-files 白名单生成，本不含依赖与产物；以下规则作为兜底防御。
  if (pathSegments.some((segment) => segment.startsWith('.askc-build.'))) return false;
  if (normalizedPath.includes('/.yarn/cache/')) return false;
  if (pathSegments.some((segment) => EXCLUDED_DIRECTORIES.has(segment))) return false;
  if (EXCLUDED_FILES.has(normalizedPath)) return false;
  if (fileName === '.DS_Store' || fileName.endsWith('.log')) return false;

  return true;
}

/** 校验目标目录，防止误覆盖已有工程。 */
function validateTargetDirectory(targetPath, force) {
  if (isInsidePackageRoot(targetPath)) {
    throw new Error('目标目录不能位于 create-askc-preview 包目录内部。');
  }

  if (!fs.existsSync(targetPath)) return;

  const targetStat = fs.statSync(targetPath);
  if (!targetStat.isDirectory()) {
    throw new Error(`目标路径不是目录：${targetPath}`);
  }

  const existingEntries = fs.readdirSync(targetPath);
  if (existingEntries.length > 0 && !force) {
    throw new Error(`目标目录非空：${targetPath}\n如需覆盖同名文件，请添加 --force。`);
  }
}

/** 将模板快照复制到目标目录，并过滤本机依赖和构建产物。 */
function copyTemplate(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
  fs.cpSync(TEMPLATE_ROOT, targetPath, {
    recursive: true,
    force: true,
    filter: shouldCopy,
  });
}

/** 执行初始化流程并打印后续开发命令。 */
function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const targetPath = path.resolve(process.cwd(), options.target ?? '.');
  validateTargetDirectory(targetPath, options.force);
  copyTemplate(targetPath);

  console.log(`✅ AskcPreview 已初始化到：${targetPath}`);
  console.log('\n下一步：');
  console.log(`  cd ${targetPath}`);
  console.log('  corepack yarn install');
  console.log('  corepack yarn pod:install   # 首次 iOS 调试需要');
  console.log('  corepack yarn dev');
}

// 将参数错误和复制错误转换成简洁的 CLI 错误，不输出 Node 内部堆栈。
try {
  main();
} catch (error) {
  console.error(`❌ 初始化失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
