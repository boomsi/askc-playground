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

# askc CLI 通过 import('keel/cli') 加载构建器，因此必须先确认项目已有 keel 依赖。
if [[ -d "$COUNTERAPP_DIR/node_modules/keel" ]]; then
  KEEL_PACKAGE_DIR="$COUNTERAPP_DIR/node_modules/keel"
elif [[ -d "$PROJECT_ROOT/node_modules/keel" ]]; then
  KEEL_PACKAGE_DIR="$PROJECT_ROOT/node_modules/keel"
else
  echo "[build:askc] 未找到 keel 依赖，请先在根目录安装项目依赖。" >&2
  exit 1
fi

# 将临时 checkout 放在 counterapp 下，使 Bun 能沿父目录解析到 counterapp/node_modules 或根 node_modules。
BUILD_TEMP_DIR="$(mktemp -d "$COUNTERAPP_DIR/.askc-build.XXXXXX")"
ASKIT_DIR="$BUILD_TEMP_DIR/askit"
TEMP_FOOTER="$COUNTERAPP_DIR/askc-footer.js"
ORIGINAL_FOOTER="$BUILD_TEMP_DIR/original-askc-footer.js"
HAD_ORIGINAL_FOOTER=0

restore_files() {
  if [[ "$HAD_ORIGINAL_FOOTER" == "1" ]]; then
    cp "$ORIGINAL_FOOTER" "$TEMP_FOOTER"
  else
    rm -f "$TEMP_FOOTER"
  fi
  rm -rf "$BUILD_TEMP_DIR"
}

trap restore_files EXIT

echo "[build:askc] 通过 SSH 拉取 askit@$ASKIT_REF ..."
git clone --depth 1 --single-branch --branch "$ASKIT_REF" "$ASKIT_REPOSITORY" "$ASKIT_DIR"

ASKC_CLI="$ASKIT_DIR/cli/askc.ts"
ASKC_FOOTER="$ASKIT_DIR/src/cli/askc-footer.js"
if [[ ! -f "$ASKC_CLI" ]]; then
  echo "[build:askc] askit@$ASKIT_REF 中缺少 cli/askc.ts。" >&2
  exit 1
fi
if [[ ! -f "$ASKC_FOOTER" ]]; then
  echo "[build:askc] askit@$ASKIT_REF 中缺少 src/cli/askc-footer.js。" >&2
  exit 1
fi

if [[ -e "$TEMP_FOOTER" ]]; then
  cp "$TEMP_FOOTER" "$ORIGINAL_FOOTER"
  HAD_ORIGINAL_FOOTER=1
fi

# askc CLI 固定读取工程根目录的 askc-footer.js；临时注入远程 askit 自带 footer，构建结束后恢复。
# runtime 的 sendBatch 定义位于 guest 子模块中，bundle.ts 入口稳定暴露 Reconciler 名称，因此检测入口名称。
if grep -Eq '__keel_|KeelReconciler|__KEEL_' "$KEEL_PACKAGE_DIR/src/guest/bundle.ts"; then
  cp "$ASKC_FOOTER" "$TEMP_FOOTER"
elif grep -Eq '__rill_|RillReconciler|__RILL_' "$KEEL_PACKAGE_DIR/src/guest/bundle.ts"; then
  # 当前锁定的旧 Keel 仍使用 rill 全局名，将 askit footer 适配到同一运行时命名。
  sed -e 's/__keel/__rill/g' -e 's/Keel/Rill/g' "$ASKC_FOOTER" > "$TEMP_FOOTER"
else
  echo "[build:askc] 无法识别当前 keel 的 guest runtime 命名，拒绝生成不匹配的 askc 包。" >&2
  exit 1
fi

echo "[build:askc] 构建 counterapp.askc ..."
bun "$ASKC_CLI" build --project "$COUNTERAPP_DIR"
