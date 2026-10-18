// Node 24 의 'node --test tests/' 는 폴더를 모듈 하나(tests/index.js)로 읽는다. 여기서 tests/*.test.mjs 를 전부 불러온다.
// (e2e.mjs 는 브라우저가 필요해서 제외, npm run e2e 로 따로)
import { readdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
for (const f of readdirSync(dir).filter(f => f.endsWith('.test.mjs')).sort()) import(`./${f}`);
