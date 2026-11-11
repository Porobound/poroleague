#!/bin/sh
# `npm run shots`: the browser runs in Playwright's Docker image, so every machine renders the
# same pixels (same Chromium, fonts and locale). The app and the tests run here as usual.
set -e
v=$(node -p "require('@playwright/test/package.json').version")
port=4320
# Greyscale, unhinted text: Ubuntu's defaults (subpixel, slight hinting) put colour fringes on it.
conf='<fontconfig><match target="font"><edit name="rgba" mode="assign"><const>none</const></edit><edit name="hinting" mode="assign"><bool>false</bool></edit><edit name="hintstyle" mode="assign"><const>hintnone</const></edit></match></fontconfig>'
c=$(docker run -d --rm --init --network host --user pwuser --workdir /home/pwuser \
	"mcr.microsoft.com/playwright:v$v-noble" sh -c \
	"mkdir -p .config/fontconfig && echo '$conf' > .config/fontconfig/fonts.conf && npx -y playwright@$v run-server --port $port --host 127.0.0.1")
trap 'docker stop "$c" >/dev/null' EXIT
until curl -so /dev/null "http://127.0.0.1:$port"; do sleep 1; done
rm -rf .shots
SHOTS=1 PW_TEST_CONNECT_WS_ENDPOINT="ws://127.0.0.1:$port/" \
	playwright test -c playwright.shots.config.ts --trace off
