#!/usr/bin/env bash

set -euo pipefail

# 统一从脚本位置推导项目路径，避免从根目录或 counterapp 目录执行时路径不同。
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COUNTERAPP_DIR="$PROJECT_ROOT/counterapp"

# 默认拉取用户 fork 的 askit main；可通过环境变量临时切换仓库或分支。
ASKIT_REPOSITORY="${ASKIT_REPOSITORY:-git@github.com:boomsi/askit.git}"
ASKIT_REF="${ASKIT_REF:-main}"

if ! command -v bun >/dev/null 2>&1; then
  echo "[build:askc] 未找到 bun，askit CLI 需要 Bun 执行。" >&2
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "[build:askc] 未找到 git，无法通过 SSH 拉取 askit。" >&2
  exit 1
fi

if [[ ! -f "$COUNTERAPP_DIR/manifest.json" ]]; then
  echo "[build:askc] 缺少 counterapp/manifest.json。" >&2
  exit 1
fi

# askc CLI 打包时执行 counterapp 的 npm run build，该脚本直调 counterapp 内的 keel CLI。
if [[ ! -d "$COUNTERAPP_DIR/node_modules/keel" ]]; then
  echo "[build:askc] 未找到 counterapp/node_modules/keel，请先在 counterapp 安装依赖。" >&2
  exit 1
fi

# askc CLI 不随 askit 的 npm 包发布（files 不含 cli），从远程拉临时副本执行。
# 打包 footer 由 counterapp 的 build 脚本指定（node_modules/askit 的 askc-footer.js），与本脚本无关。
BUILD_TEMP_DIR="$(mktemp -d)"
ASKIT_DIR="$BUILD_TEMP_DIR/askit"
trap 'rm -rf "$BUILD_TEMP_DIR"' EXIT

echo "[build:askc] 通过 SSH 拉取 askit@$ASKIT_REF ..."
git clone --depth 1 --single-branch --branch "$ASKIT_REF" "$ASKIT_REPOSITORY" "$ASKIT_DIR"

ASKC_CLI="$ASKIT_DIR/cli/askc.ts"
if [[ ! -f "$ASKC_CLI" ]]; then
  echo "[build:askc] askit@$ASKIT_REF 中缺少 cli/askc.ts。" >&2
  exit 1
fi

echo "[build:askc] 构建 counterapp.askc ..."
bun "$ASKC_CLI" build --project "$COUNTERAPP_DIR"

ASKC_FILE="$COUNTERAPP_DIR/counterapp.askc"
if [[ ! -f "$ASKC_FILE" ]]; then
  echo "[build:askc] 构建完成但未找到产物 $ASKC_FILE。" >&2
  exit 1
fi

# 口径与 loom AppSessionService 的核验一致：对产物文件原始字节计算 sha256（小写 hex）。
ASKC_SHA256="$(shasum -a 256 "$ASKC_FILE" | awk '{print $1}')"
echo "[build:askc] 产物：counterapp/counterapp.askc"
echo "[build:askc] sha256: $ASKC_SHA256"
