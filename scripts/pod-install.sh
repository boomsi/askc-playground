#!/bin/bash
# pod install 固化：双本地 RN prebuilt tarball + 代理
# 背景：RN 0.83 的 ReactNativeCore 与 ReactNativeDependencies 都是 Maven Central
# 的 prebuilt tarball，不带代理的 pod install 会静默产出空 artifact——
# app 缺 React 原生模块集（运行时 'DeviceInfo' could not be found），
# 或缺动态库（dyld: ReactNativeDependencies.framework Library missing 启动即崩）。
set -e
cd "$(dirname "$0")/../ios"

BASE="https://repo1.maven.org/maven2/com/facebook/react/react-native-artifacts/0.83.0"
PROXY="${https_proxy:-http://127.0.0.1:7890}"

fetch () { # $1=输出文件 $2=URL
  if [ ! -f "$1" ]; then
    echo "⬇️  下载 $(basename "$1")（走 $PROXY）..."
    curl -sL -x "$PROXY" -o "$1" "$2"
  fi
}

CORE=/tmp/rncore-0.83.0-debug.tar.gz
DEPS=/tmp/rndeps-0.83.0-debug.tar.gz
fetch "$CORE" "$BASE/react-native-artifacts-0.83.0-reactnative-core-debug.tar.gz"
fetch "$DEPS" "$BASE/react-native-artifacts-0.83.0-reactnative-dependencies-debug.tar.gz"

echo "📦 pod install（双本地 tarball + 代理）..."
RCT_TESTONLY_RNCORE_TARBALL_PATH="$CORE" \
  RCT_USE_LOCAL_RN_DEP="$DEPS" \
  https_proxy="$PROXY" http_proxy="$PROXY" \
  pod install

echo "✅ 验证 prebuilt："
ls -d Pods/React-Core-prebuilt/React.xcframework
