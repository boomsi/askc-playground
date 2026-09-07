import { watch, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// 统一通过 Corepack 启动项目声明的 Yarn 版本，避免 watcher 内部退回全局 Yarn。
const yarnCommand = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';
const yarnCommandArgs = ['yarn'];
// 防止编辑器一次保存触发多次构建，和 Bun build 争抢同一个输出文件。
const BUILD_DEBOUNCE_MS = 200;
const watchedPaths = [
  resolve(projectRoot, 'counterapp/src'),
  resolve(projectRoot, 'counterapp/preview-footer.js'),
  resolve(projectRoot, 'node_modules/askit/src'),
  resolve(projectRoot, 'node_modules/keel/src'),
];

let metroProcess = null;
let buildProcess = null;
let buildTimer = null;
let buildPending = false;
let shuttingDown = false;
const watchers = [];

/** 使用项目声明的 Yarn 执行一个脚本命令。 */
function spawnYarn(args, options) {
  return spawn(yarnCommand, [...yarnCommandArgs, ...args], options);
}

/** 执行一次 guest bundle 构建，并把日志直接交给当前开发终端。 */
function runGuestBuild() {
  if (shuttingDown) return;
  if (buildProcess) {
    buildPending = true;
    return;
  }

  buildProcess = spawnYarn(['build:guest'], {
    cwd: projectRoot,
    stdio: 'inherit',
  });
  buildProcess.on('error', (error) => {
    console.error('[dev] guest build process failed:', error);
  });
  buildProcess.on('close', (code) => {
    buildProcess = null;
    if (code !== 0) {
      console.error(`[dev] guest build exited with code ${code ?? 'unknown'}`);
    }
    // 构建期间再次保存文件时，构建结束后补跑一次，确保输出追上最后一次修改。
    if (buildPending && !shuttingDown) {
      buildPending = false;
      runGuestBuild();
    }
  });
}

/** 将文件变化合并成一次 guest bundle 构建。 */
function scheduleGuestBuild() {
  if (shuttingDown) return;
  if (buildTimer) clearTimeout(buildTimer);
  buildTimer = setTimeout(() => {
    buildTimer = null;
    runGuestBuild();
  }, BUILD_DEBOUNCE_MS);
}

/** 关闭 watcher、Metro 和正在运行的构建，避免 yarn dev 退出后留下子进程。 */
function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (buildTimer) clearTimeout(buildTimer);
  for (const watcher of watchers) watcher.close();
  buildProcess?.kill('SIGTERM');
  metroProcess?.kill('SIGTERM');
  process.exitCode = exitCode;
}

async function main() {
  // 先生成首个 bundle，再启动 Metro，避免首次请求拿到 503。
  await new Promise((resolveBuild, rejectBuild) => {
    const initialBuild = spawnYarn(['build:guest'], {
      cwd: projectRoot,
      stdio: 'inherit',
    });
    initialBuild.on('error', rejectBuild);
    initialBuild.on('close', (code) => {
      if (code === 0) resolveBuild();
      else rejectBuild(new Error(`Initial guest build exited with code ${code ?? 'unknown'}`));
    });
  });

  metroProcess = spawnYarn(['react-native', 'start', '--port', '8084'], {
    cwd: projectRoot,
    stdio: 'inherit',
  });
  metroProcess.on('exit', (code) => {
    if (!shuttingDown) shutdown(code ?? 1);
  });

  for (const watchedPath of watchedPaths) {
    try {
      const isDirectory = statSync(watchedPath).isDirectory();
      watchers.push(
        watch(watchedPath, { recursive: isDirectory }, () => {
          scheduleGuestBuild();
        }),
      );
    } catch (error) {
      console.warn(`[dev] unable to watch ${watchedPath}:`, error);
    }
  }

  console.log('[dev] watching guest sources and serving counterapp/app.js');
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

main().catch((error) => {
  console.error('[dev] failed to start:', error);
  shutdown(1);
});
