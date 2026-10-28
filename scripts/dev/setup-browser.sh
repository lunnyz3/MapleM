#!/usr/bin/env bash
# Headless Chromium(Playwright) 실행 환경 준비 — sudo 없이 사용자 공간에서만 동작한다.
# 이 서버(Ubuntu 22.04)에는 libxcomposite1 / libxdamage1 / libxrandr2 가 없어서
# 패키지를 내려받아 .cache/browser-libs/root 에 풀고 LD_LIBRARY_PATH 로 연결한다.
#
# 사용법:
#   bash scripts/dev/setup-browser.sh
#   source scripts/dev/browser-env.sh   # LD_LIBRARY_PATH 설정
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LIB_DIR="$ROOT_DIR/.cache/browser-libs"
PACKAGES=(libxcomposite1 libxdamage1 libxrandr2)

mkdir -p "$LIB_DIR/debs" "$LIB_DIR/root"
cd "$LIB_DIR/debs"
apt-get download "${PACKAGES[@]}"
for deb in "$LIB_DIR"/debs/*.deb; do
  dpkg -x "$deb" "$LIB_DIR/root"
done

cd "$ROOT_DIR"
npx playwright install chromium

echo "완료: source scripts/dev/browser-env.sh 후 Playwright를 실행하세요."
