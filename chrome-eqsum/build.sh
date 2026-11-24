#!/bin/sh
# builds the extension into dist/ and packs it as equation-summary.zip for the Chrome Web Store
set -e
cd "$(dirname "$0")"
rm -rf dist && mkdir -p dist/icons
npx esbuild viewer.tsx --bundle --format=esm --minify --jsx=automatic --outfile=dist/viewer.js --log-level=warning
npx esbuild ../packages/react-eqsum/src/worker.ts --bundle --format=esm --minify --outfile=dist/eqsum-worker.js --log-level=warning
cp ../node_modules/pdfjs-dist/build/pdf.worker.min.mjs dist/
cp manifest.json background.js viewer.html dist/
cp icons/*.png dist/icons/
rm -f equation-summary.zip && python3 -c "import shutil; shutil.make_archive('equation-summary', 'zip', 'dist')"
ls -la dist equation-summary.zip
