#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
UI_DIR="$SCRIPT_DIR/../ui"
ELECTRON_DIR="$SCRIPT_DIR"

echo "=== CA Messenger Desktop Build ==="

# 1. Vue UI 빌드
echo "[1/3] Building Vue UI..."
cd "$UI_DIR"
npx vite build --outDir "$ELECTRON_DIR/web"

# 2. Electron 의존성 설치
echo "[2/3] Installing Electron dependencies..."
cd "$ELECTRON_DIR"
npm install

# 3. 패키징
echo "[3/3] Packaging Electron app..."
npm run build

echo ""
echo "=== Build complete ==="
echo "Output: $ELECTRON_DIR/dist/"
ls -la "$ELECTRON_DIR/dist/" 2>/dev/null
