#!/bin/sh
# builds the demo into dist/: the app, pdf.js's worker, the solver's worker, and the book
set -e
cd "$(dirname "$0")"
mkdir -p dist
npx esbuild main.tsx --bundle --format=esm --minify --jsx=automatic --outfile=dist/app.js --log-level=warning
npx esbuild ../packages/react-eqsum/src/worker.ts --bundle --format=esm --minify --outfile=dist/eqsum-worker.js --log-level=warning
cp ../node_modules/pdfjs-dist/build/pdf.worker.min.mjs dist/
cp index.html dist/
cp "${BOOK:-/home/claude/books/cphb/book.pdf}" dist/book.pdf
ls -la dist
