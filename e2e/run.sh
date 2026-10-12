# Real-app smoke test: Logseq OG 1.0.0 AppImage under Xvfb, unpacked plugin, file graph. Run from the repo root after build+package.
set -x
R=$PWD; H=$HOME; mkdir -p $R/e2e-out
cd $H
curl -sL -o og.AppImage https://github.com/logseq/og/releases/download/1.0.0/Logseq-OG-linux-x64-1.0.0.AppImage
sha256sum og.AppImage | tee $R/e2e-out/appimage.sha256
chmod +x og.AppImage; ./og.AppImage --appimage-extract >/dev/null 2>&1; rm og.AppImage
# graph
G=$H/graph; mkdir -p $G/pages $G/assets $G/logseq
cp $R/icon.png $G/assets/pic.png
# extra image cases (build 5): pasted-style name, jpg, gif, spaces, unicode, svg. jpg/gif are converted from icon.png by LibreOffice.
T=$(mktemp -d); cp $R/icon.png $T/base.png
(cd $T && soffice --headless --convert-to jpg:draw_jpg_Export base.png >/dev/null 2>&1; soffice --headless --convert-to gif:draw_gif_Export base.png >/dev/null 2>&1)
[ -s $T/base.jpg ] || echo "WARN soffice jpg convert failed" ; [ -s $T/base.gif ] || echo "WARN soffice gif convert failed"; ls -l $T
[ -s $T/base.jpg ] || base64 -d > $T/base.jpg <<<"/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA="
[ -s $T/base.gif ] || base64 -d > $T/base.gif <<<"R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
cp $R/icon.png "$G/assets/image_1697040000000_0.png"
cp $T/base.jpg "$G/assets/my photo 1.jpg"
cp $T/base.gif "$G/assets/anim.gif"
cp $R/icon.png "$G/assets/Zoë diagram.png"
cp $R/icon.png "$G/assets/spaced name.png"
cp $R/icon.png "$G/assets/Zoë.png"
printf '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="30" fill="#c33"/></svg>' > "$G/assets/logo.svg"
ls -l $G/assets | tee $R/e2e-out/assets-listing.txt
echo '{:meta/version 1 :preferred-format :markdown}' > $G/logseq/config.edn
cp $R/e2e/Demo.md "$G/pages/Demo Page.md"
printf -- '- Research notes body\n' > "$G/pages/Research Notes.md"
# plugin, unpacked, in both places Logseq looks
P=$H/.logseq/plugins/logseq-docx-export; mkdir -p $P
cp -r $R/dist $R/package.json $R/icon.png $P/
echo "{\"externals\":[\"$P\"]}" > $H/.logseq/preferences.json
export DISPLAY=:99
(Xvfb :99 -screen 0 1280x800x24 >/dev/null 2>&1 &)
sleep 2
mkdir -p $H/Downloads
cd squashfs-root 2>/dev/null || cd $H/squashfs-root
(LC_ALL=C.UTF-8 LANG=C.UTF-8 ./Logseq-OG --no-sandbox --disable-gpu --remote-debugging-port=9222 --remote-allow-origins='*' --inspect=9229 > $H/ls.log 2>&1 &)
cd $R
timeout 300 node e2e/drive.mjs 2>&1 | tee $R/e2e-out/drive.log
echo "drive exit $?"
tail -30 $H/ls.log > $R/e2e-out/ls-tail.log
find $H/Downloads $H/graph -name '*.docx' -o -name '*.zip' | tee $R/e2e-out/found.txt
while IFS= read -r f; do cp "$f" "$R/e2e-out/$(basename "$f" | tr ' ' _)"; done < $R/e2e-out/found.txt
f=$(grep -m1 "\.docx$" $R/e2e-out/found.txt); [ -n "$f" ] && cp "$f" $R/e2e-out/export.docx; ls -la $R/e2e-out
