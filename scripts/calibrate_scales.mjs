// 고정 범위(0~100 정규화 기준)를 계산해 src/data/scales.json 으로 저장한다
// 실행: node scripts/calibrate_scales.mjs   (src/data/*.json 이 바뀌면 다시 실행)
import { readFileSync, writeFileSync } from 'node:fs';
import { computeScales, PARAMS } from '../src/js/engine/scoring.js';

const read = (n) => JSON.parse(readFileSync(new URL(`../src/data/${n}.json`, import.meta.url)));
const data = Object.fromEntries(['network', 'congestion', 'ridership', 'transfers', 'service'].map((n) => [n, read(n)]));
const scales = { ...computeScales(data), params: PARAMS };
writeFileSync(new URL('../src/data/scales.json', import.meta.url), JSON.stringify(scales, null, 1));
console.log('wrote src/data/scales.json', scales);
