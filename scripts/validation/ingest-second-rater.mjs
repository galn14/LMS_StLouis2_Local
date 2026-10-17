#!/usr/bin/env node
/**
 * Reads the returned second-teacher workbook and writes scores.json.
 *
 *   node scripts/validation/ingest-second-rater.mjs [path/to/returned.xlsx]
 *     default input: docs/validation/automated-grading/second-rater/lembar-penilaian-guru-2.xlsx
 *     -> docs/validation/automated-grading/second-rater/scores.json
 *
 * Fails loudly on anything that would corrupt an agreement statistic: a code
 * that is not in the manifest, a duplicated code, or a score that is not an
 * integer within [0, max]. Blank Part B rows are allowed; blank Part A rows
 * are reported, because every local-v2 metric is computed on Part A.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const DIR = path.join(ROOT, 'docs/validation/automated-grading/second-rater');
const input = process.argv[2] ?? path.join(DIR, 'lembar-penilaian-guru-2.xlsx');

const manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
const wb = XLSX.readFile(input);
const out = { source: path.relative(ROOT, input), ingested_at: new Date().toISOString(), subjects: {} };
const problems = [];

for (const [subj, m] of Object.entries(manifest.subjects)) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[m.sheet], { header: 1 }).slice(3);
  const expected = new Set([...m.part_a, ...m.part_b]);
  const scores = {};
  const notes = {};

  for (const row of rows) {
    const [, , code, , rawScore, note] = row;
    if (!code) continue;
    if (!expected.has(code)) problems.push(`${subj}: unknown code ${code}`);
    if (code in scores) problems.push(`${subj}: duplicated code ${code}`);
    if (rawScore === undefined || rawScore === '') {
      scores[code] = null;
      continue;
    }
    const score = Number(rawScore);
    if (!Number.isInteger(score) || score < 0 || score > m.max_score) {
      problems.push(`${subj}: ${code} has invalid score "${rawScore}" (expected an integer 0-${m.max_score})`);
      continue;
    }
    scores[code] = score;
    if (note) notes[code] = String(note);
  }

  const missingA = m.part_a.filter(code => scores[code] == null);
  if (missingA.length) problems.push(`${subj}: Part A not scored for ${missingA.join(', ')}`);
  out.subjects[subj] = { max_score: m.max_score, scores, notes };
}

if (problems.some(p => !p.includes('Part A not scored'))) {
  console.error('Refusing to write scores.json:\n  ' + problems.join('\n  '));
  process.exit(1);
}
fs.writeFileSync(path.join(DIR, 'scores.json'), JSON.stringify(out, null, 2));
console.error(`wrote ${path.relative(ROOT, path.join(DIR, 'scores.json'))}`);
if (problems.length) console.error('Warnings:\n  ' + problems.join('\n  '));
