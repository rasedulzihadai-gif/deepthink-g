#!/bin/bash
# End-to-end pipeline test through the real API routes, with a DeepSeek-compatible stub.
set -e
B=http://127.0.0.1:3000
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT/e2e"
node stub.mjs > stub.log 2>&1 &
STUB=$!
trap "kill $STUB 2>/dev/null" EXIT
sleep 1
echo "== default provider =="; curl -s $B/api/settings; echo
echo "== point deepseek slot at stub =="; curl -s -X PUT $B/api/providers -H 'Content-Type: application/json' -d '{"id":"deepseek","apiKey":"sk-test-1234","baseUrl":"http://127.0.0.1:4555/v1"}' | node -e 'const d=JSON.parse(require("fs").readFileSync(0));const p=d.providers.find(x=>x.id=="deepseek");console.log(p.label,p.model,p.baseUrl,p.keyPreview,p.configured, "| providers:", d.providers.map(x=>x.id).join(","))'
echo "== test connection =="; curl -s -X POST $B/api/providers/test -H 'Content-Type: application/json' -d '{"id":"deepseek"}'; echo

mk() { # file hint palette
  local b64=$(base64 -w0 "$1")
  printf '{"filename":"%s","imageData":"data:image/jpeg;base64,%s","thumbData":"data:image/jpeg;base64,%s","width":1568,"height":882,"palette":%s,"contentTypeHint":"%s"}' "$(basename $1)" "$b64" "$b64" "$3" "$2" > body.json
  curl -s -X POST $B/api/assets -H 'Content-Type: application/json' --data @body.json | node -e 'console.log(JSON.parse(require("fs").readFileSync(0)).asset.id)'
}
S=$(mk "$ROOT/public/test/single-gradient-background.jpg" auto '["navy","purple","pink"]')
T=$(mk "$ROOT/public/test/template-poster-pack.jpg" auto '["light gray","blue","cyan"]')
echo "single id=$S template id=$T"
curl -s -X POST $B/api/assets/$S/generate -H 'Content-Type: application/json' -d '{}' > single.json
curl -s -X POST $B/api/assets/$T/generate -H 'Content-Type: application/json' -d '{}' > template.json
for p in adobe shutterstock freepik istock; do
  curl -s -X POST $B/api/export -H 'Content-Type: application/json' -d "{\"platform\":\"$p\",\"ids\":[$S,$T]}" > export-$p.json
done
node -e '
const a=JSON.parse(require("fs").readFileSync("template.json")).asset.result;
a.platforms.adobe.title="Poster templates with editable text, waves and spheres";
a.platforms.adobe.category="Backgrounds";
require("fs").writeFileSync("edit.json",JSON.stringify({result:a}));'
curl -s -X PATCH $B/api/assets/$T -H 'Content-Type: application/json' --data @edit.json > edited.json
curl -s -X PATCH $B/api/assets/$T -H 'Content-Type: application/json' -d '{"result":{"content_type":"poster","platforms":{}}}' > rejected.json
echo "S=$S T=$T" > ids.txt
echo done
