#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const path = require('node:path');

// CLI 所在仓库的根目录，同时也是初始化时复制的模板根目录。
const SOURCE_ROOT = path.resolve(__dirname, '..');

// 这些目录包含依赖、原生构建缓存或版本控制元数据，不应复制到新工程。
const EXCLUDED_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  'Pods',
  'DerivedData',
  'coverage',
  '.gradle',
]);

// 这些文件是当前工程的生成产物或本机文件，不属于初始化模板源码。
const EXCLUDED_FILES = new Set([
  '.DS_Store',
  'counterapp/app.js',
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
  - 初始化完成后需要在目标目录单独执行 corepack yarn install。
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

/** 判断目标路径是否位于模板仓库内部，避免把仓库复制到自身的子目录。 */
function isInsideSourceRoot(targetPath) {
  const relativePath = path.relative(SOURCE_ROOT, targetPath);
  return (
    relativePath === '' ||
    (!relativePath.startsWith(`..${path.sep}`) && relativePath !== '..' && !path.isAbsolute(relativePath))
  );
}

/** 判断当前源文件是否属于应该复制到初始化工程的模板内容。 */
function shouldCopy(sourcePath) {
  const relativePath = path.relative(SOURCE_ROOT, sourcePath);
  if (!relativePath) return true;

  const normalizedPath = relativePath.split(path.sep).join('/');
  const pathSegments = normalizedPath.split('/');
  const fileName = path.basename(normalizedPath);

  // 临时 askc checkout 可能因进程被强制终止而残留，初始化时也必须排除。
  if (pathSegments.some((segment) => segment.startsWith('.askc-build.'))) return false;
  if (pathSegments.some((segment) => EXCLUDED_DIRECTORIES.has(segment))) return false;
  if (EXCLUDED_FILES.has(normalizedPath)) return false;
  if (fileName === '.DS_Store' || fileName.endsWith('.log')) return false;

  return true;
}

/** 校验目标目录，防止误覆盖当前模板仓库或已有工程。 */
function validateTargetDirectory(targetPath, force) {
  if (isInsideSourceRoot(targetPath)) {
    throw new Error('目标目录不能位于当前 AskcPreview 模板仓库内部。');
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

/** 将当前仓库模板复制到目标目录，并过滤本机依赖和构建产物。 */
function copyTemplate(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
  fs.cpSync(SOURCE_ROOT, targetPath, {
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
  console.log('  corepack yarn dev');
}

// 将参数错误和复制错误转换成简洁的 CLI 错误，不输出 Node 内部堆栈。
try {
  main();
} catch (error) {
  console.error(`❌ 初始化失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
