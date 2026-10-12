# Whole 3/3 record in one sandbox run: build + tests + package + Logseq OG smoke test + Pro-forced export + LibreOffice PDFs + one source hash.
set -x
export LC_ALL=C
R=$PWD
node -v; npm -v
npm ci 2>&1 | tail -3
rm -rf e2e-out dist release
npm run build 2>&1 | tail -8
[ -f dist/index.html ] || { echo BUILD-FAILED; exit 1; }
npm test 2>&1 | tail -12 | tee e2e-pre-test.log
npm run package 2>&1 | tail -30
mkdir -p e2e-out
cp e2e-pre-test.log e2e-out/test.log
npx vite-node e2e/pro-forced.ts 2>&1 | tee e2e-out/pro-forced.log
# source hash: one command, C-locale sort
find src test e2e package.json package-lock.json -type f ! -name '*.log' | sort | xargs sha256sum | sha256sum | tee e2e-out/source.sha256
find src test e2e package.json package-lock.json -type f ! -name '*.log' | sort | xargs sha256sum > e2e-out/source-files.sha256
sha256sum dist/index.html release/*.zip | tee e2e-out/dist.sha256
# real app + LibreOffice (apt needs update first; sudo is available in the sandbox)
sudo apt-get update -qq >/dev/null 2>&1; sudo apt-get install -y -qq --no-install-recommends xvfb libgtk-3-0 libnss3 libasound2 libgbm1 libxss1 libatk-bridge2.0-0 libdrm2 libxkbcommon0 poppler-utils libreoffice-writer fonts-dejavu >/dev/null 2>&1
bash e2e/run.sh 2>&1 | tail -60
# LibreOffice
mkdir -p e2e-out/pdf
cd e2e-out
soffice --version | tee versions.txt
for f in export.docx pro-forced.docx; do [ -f $f ] && soffice --headless --convert-to pdf --outdir pdf $f 2>&1 | tail -2; done
unzip -o -q batch.zip -d batch && for f in batch/*.docx; do soffice --headless --convert-to pdf --outdir pdf "$f" 2>&1 | tail -2; done
cd $R; mkdir -p docs
pdftotext -layout e2e-out/pdf/pro-forced.pdf - | tee e2e-out/pro-forced-pdf.txt | head -40
pdfimages -list e2e-out/pdf/export.pdf | tee e2e-out/export-pdfimages.txt
unzip -lv e2e-out/export.docx | tee e2e-out/export-docx-list.txt
ls -l $HOME/graph/assets | tee e2e-out/source-assets.txt
pdftotext -layout e2e-out/pdf/export.pdf - | tee e2e-out/export-pdf.txt | head -40
[ -f e2e-out/pdf/export.pdf ] && pdftoppm -png -r 80 -f 1 -l 1 -singlefile e2e-out/pdf/export.pdf docs/demo
[ -f e2e-out/pdf/pro-forced.pdf ] && pdftoppm -png -r 80 -f 1 -l 1 -singlefile e2e-out/pdf/pro-forced.pdf e2e-out/pro-page1
echo "Logseq OG 1.0.0 AppImage (see appimage.sha256)" >> e2e-out/versions.txt
ls -la e2e-out docs
tar czf e2e-bundle.tar.gz e2e-out docs/demo.png; ls -la e2e-bundle.tar.gz
