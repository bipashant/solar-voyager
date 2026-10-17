// Lists every caption in every lesson, with the file name its recording should have and how it should be
// pronounced, as tools/narration-manifest.json. tools/narrate.py reads that and records what's missing.
//
//   node tools/narration-extract.mjs
//
// No dependencies, no browser: each lesson page's script is run with a stand-in for initLesson that just
// hands over the scenes.
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { lineId, plain, spoken } from '../js/learn/narration.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'narration-'));
const lines = [];
const seen = new Set();

for (const file of readdirSync(join(root, 'lessons')).filter((f) => f.endsWith('.html')).sort()) {
  const html = readFileSync(join(root, 'lessons', file), 'utf8');
  const code = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map((m) => m[1]).pop();
  if (!code) continue;
  const stub = code.replace(/^import \{ initLesson \} from .*$/m, 'const initLesson = (lesson) => { globalThis.__lesson = lesson; };');
  const mod = join(tmp, `${file}.mjs`);
  writeFileSync(mod, stub);
  globalThis.__lesson = null;
  await import(pathToFileURL(mod).href);
  const lesson = globalThis.__lesson;
  if (!lesson) { console.warn(`${file}: no initLesson call found`); continue; }
  const add = (say, where) => {
    if (!say) return;
    const id = lineId(say);
    const key = `${lesson.id}/${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    lines.push({ lesson: lesson.id, id, where, text: plain(say), spoken: spoken(say) });
  };
  for (const scene of Object.values(lesson.scenes || {})) {
    scene.beats.forEach((b, i) => add(b.say, `${scene.id} beat ${i}`));
    (scene.presets || []).forEach((p) => add(p.say, `${scene.id} jump "${p.label}"`));
  }
}
rmSync(tmp, { recursive: true, force: true });

writeFileSync(join(root, 'tools', 'narration-manifest.json'), JSON.stringify({ lines }, null, 2) + '\n');
const words = lines.reduce((n, l) => n + l.spoken.split(/\s+/).length, 0);
console.log(`${lines.length} captions, ${words} words, across ${new Set(lines.map((l) => l.lesson)).size} lessons -> tools/narration-manifest.json`);
