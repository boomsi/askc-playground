#!/bin/bash
# askc 预览器 iOS 启动：免签名编译 → 安装到已启动的模拟器 → 拉起 app
# （不用 react-native run-ios：它的签名检查会挡模拟器目标，且会抢 8081 起 metro）
set -e
cd "$(dirname "$0")/.."

DEVICE=$(xcrun simctl list devices booted | grep -oE '\([0-9A-F-]{8}-([0-9A-F-]{4}-){3}[0-9A-F]{12}\)' | head -1 | tr -d '()')
if [ -z "$DEVICE" ]; then
  echo "❌ 没有已启动的模拟器：先打开 Simulator 并启动一台设备"
  exit 1
fi
echo "📱 目标模拟器: $DEVICE"

echo "🔨 编译（免签名，模拟器目标）..."
xcodebuild -workspace ios/AskcPreview.xcworkspace -scheme AskcPreview \
  -configuration Debug -sdk iphonesimulator \
  -destination "id=$DEVICE" CODE_SIGNING_ALLOWED=NO build -quiet

APP=$(ls -d "$HOME/Library/Developer/Xcode/DerivedData/AskcPreview-"*/Build/Products/Debug-iphonesimulator/AskcPreview.app | head -1)
echo "📦 安装: $APP"
xcrun simctl install "$DEVICE" "$APP"

xcrun simctl terminate "$DEVICE" org.reactjs.native.example.AskcPreview 2>/dev/null || true
echo "🚀 启动 app（若模拟器在锁屏，先手动解锁）..."
xcrun simctl launch "$DEVICE" org.reactjs.native.example.AskcPreview
echo "✅ 完成。metro 请另开终端: corepack yarn dev（端口 8084）"
