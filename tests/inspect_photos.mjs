import fs from 'node:fs';
import path from 'node:path';

const dir = 'data/surveys';
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));

let total = 0;
for (const f of files) {
  const doc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const photos = doc.photos || doc.fields?.photos || [];
  for (const p of photos) {
    let b64 = p.base64Data || p.data;
    if (!b64) {
      if (p.url && p.url.includes('base64,')) b64 = p.url.split('base64,')[1];
      else if (p.dataUrl && p.dataUrl.includes('base64,')) b64 = p.dataUrl.split('base64,')[1];
    }
    if (b64) total++;
  }
}
console.log('Total photos with valid base64 extracted:', total);
