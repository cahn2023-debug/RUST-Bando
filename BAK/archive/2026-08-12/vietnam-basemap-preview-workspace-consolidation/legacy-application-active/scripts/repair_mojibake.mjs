import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const write = process.argv.includes('--write');
const fromGit = process.argv.includes('--from-git');
const onlyArgument = process.argv.find((argument) => argument.startsWith('--only='));
const onlyPath = onlyArgument?.slice('--only='.length).replaceAll('\\', '/');
const suspiciousPattern = /(?:\u00c3[\u0080-\u00bf]|\u00c2[\u0080-\u00bf]|\u00c4[\u0080-\u00bf]|\u00c6[\u0080-\u00bf]|\u00d0[\u0080-\u00bf]|\u00d1[\u0080-\u00bf]|\u00e1(?:\u00ba|\u00bb|\u00bc|\u00bd|\u00be|\u00bf).|\u00e2(?:[\u0080-\u009f]|\u20ac|\u201a|\u0192|\u201e|\u2026|\u2020|\u2021|\u02c6|\u2030|\u0160|\u2039|\u0152|\u017d|\u2018|\u2019|\u201c|\u201d|\u2022|\u2013|\u2014|\u02dc|\u2122|\u0161|\u203a|\u0153|\u017e|\u0178)|\u00f0\u0178.|\u00ef\u00bf\u00bd|[\u0080-\u009f])/u;
const textExtensions = new Set(['.css', '.html', '.json', '.md', '.mjs', '.rs', '.ts', '.tsx', '.txt']);
const explicitFiles = new Set([
  'README.md',
  'DESIGN.md',
  'docs/INDEX.md',
  'docs/README.md',
  'docs/MASTER_GUIDE.md',
  'docs/architecture/CODEBASE_MAP.md',
  'docs/guides/AGENTS_GUIDE.vi.md',
  'docs/guides/CONTRIBUTING.md',
  'docs/guides/CONTRIBUTING.vi.md',
  'docs/guides/WORKFLOW_GUIDE.vi.md',
  'docs/plans/PLAN-refactor-architecture-docs.md',
  'docs/plans/PLAN-refactor-code-quality.md',
  'docs/plans/PLAN-ui-standardize-perf.md',
  'docs/plans/PLAN-ui-ux-i18n-sync.md',
  'docs/PRODUCT_STANDARDIZATION_PLAN.md',
]);
const cp1252Special = new Map([
  ['\u20ac', 0x80], ['\u201a', 0x82], ['\u0192', 0x83], ['\u201e', 0x84], ['\u2026', 0x85], ['\u2020', 0x86],
  ['\u2021', 0x87], ['\u02c6', 0x88], ['\u2030', 0x89], ['\u0160', 0x8a], ['\u2039', 0x8b], ['\u0152', 0x8c],
  ['\u017d', 0x8e], ['\u2018', 0x91], ['\u2019', 0x92], ['\u201c', 0x93], ['\u201d', 0x94], ['\u2022', 0x95],
  ['\u2013', 0x96], ['\u2014', 0x97], ['\u02dc', 0x98], ['\u2122', 0x99], ['\u0161', 0x9a], ['\u203a', 0x9b],
  ['\u0153', 0x9c], ['\u017e', 0x9e], ['\u0178', 0x9f],
]);
const candidatePattern = /[A-Za-z0-9_\s\-.,:;!?()[\]{}'"`/@#$%&*+=<>|~\u20ac\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u017d\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u017e\u0178\u0080-\u00ff]+/gu;

const isExcluded = (relativePath) => {
  const normalized = relativePath.replaceAll('\\', '/');
  return normalized.startsWith('BAK/')
    || normalized.startsWith('docs/archive/')
    || normalized.startsWith('docs/NOTEBOOK_LM')
    || normalized === 'docs/project_index.html'
    || normalized.startsWith('src-tauri/local_data/')
    || normalized.startsWith('src-tauri/resources/')
    || normalized.startsWith('node_modules/')
    || normalized.startsWith('dist/')
    || normalized.startsWith('coverage/')
    || normalized.startsWith('.git/');
};

const shouldScan = (relativePath) => {
  const normalized = relativePath.replaceAll('\\', '/');
  if (isExcluded(normalized) || !textExtensions.has(path.extname(normalized).toLowerCase())) return false;
  return explicitFiles.has(normalized)
    || normalized.startsWith('src/')
    || normalized.startsWith('src-tauri/src/');
};

const walk = (directory) => {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute);
    if (isExcluded(relative)) continue;
    if (entry.isDirectory()) files.push(...walk(absolute));
    else if (shouldScan(relative)) files.push(relative);
  }
  return files;
};

const score = (value) => {
  const matches = value.match(suspiciousPattern);
  return (matches?.length ?? 0) + (value.includes('\ufffd') ? 10 : 0);
};

const encodeCp1252 = (value) => {
  const bytes = [];
  for (const character of value) {
    const code = character.codePointAt(0);
    if (code <= 0xff) bytes.push(code);
    else if (cp1252Special.has(character)) bytes.push(cp1252Special.get(character));
    else return null;
  }
  return Buffer.from(bytes);
};

const repairSegment = (segment) => {
  if (!suspiciousPattern.test(segment)) return segment;
  const encoded = encodeCp1252(segment);
  if (!encoded) return segment;
  const decoded = encoded.toString('utf8');
  if (decoded.includes('\ufffd') || score(decoded) >= score(segment)) return segment;
  return decoded;
};

const repairText = (text) => text.replace(candidatePattern, repairSegment);
const files = [
  ...explicitFiles,
  ...['src', 'src-tauri/src'].flatMap((directory) => walk(path.join(root, directory))),
].map((file) => file.replaceAll('\\', '/'))
  .filter((file, index, all) => all.indexOf(file) === index)
  .filter((file) => !onlyPath || file === onlyPath)
  .sort();

let changedFiles = 0;
let changedLines = 0;
for (const relativePath of files) {
  const absolutePath = path.join(root, relativePath);
  const original = fromGit
    ? execFileSync('git', ['show', `HEAD:${relativePath}`], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 })
    : fs.readFileSync(absolutePath, 'utf8');
  const newline = original.includes('\r\n') ? '\r\n' : '\n';
  const bom = original.startsWith('\ufeff') ? '\ufeff' : '';
  const body = bom ? original.slice(1) : original;
  let fileChanged = false;
  const repairedBody = body.split(/\r?\n/u).map((line) => {
    const repaired = repairText(line);
    if (repaired !== line) {
      fileChanged = true;
      changedLines += 1;
    }
    return repaired;
  }).join(newline);
  const repaired = bom + repairedBody;
  if (!fileChanged || repaired === original) continue;
  changedFiles += 1;
  if (write) fs.writeFileSync(absolutePath, repaired, 'utf8');
  console.log(`${write ? 'fixed' : 'would fix'} ${relativePath}`);
}

console.log(`${write ? 'Repaired' : 'Preview'}: ${changedFiles} files, ${changedLines} lines.`);
