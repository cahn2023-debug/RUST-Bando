import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const repoRoot = path.resolve(root, '..', '..');
const mojibakePattern = /(?:\u00c3[\u0080-\u00bf]|\u00c2[\u0080-\u00bf]|\u00c4[\u0080-\u00bf]|\u00c6[\u0080-\u00bf]|\u00d0[\u0080-\u00bf]|\u00d1[\u0080-\u00bf]|\u00e1(?:\u00ba|\u00bb|\u00bc|\u00bd|\u00be|\u00bf).|\u00e2(?:[\u0080-\u009f]|\u20ac|\u201a|\u0192|\u201e|\u2026|\u2020|\u2021|\u02c6|\u2030|\u0160|\u2039|\u0152|\u017d|\u2018|\u2019|\u201c|\u201d|\u2022|\u2013|\u2014|\u02dc|\u2122|\u0161|\u203a|\u0153|\u017e|\u0178)|\u00f0\u0178.|\u00ef\u00bf\u00bd|[\u0080-\u009f])/u;
const controlPattern = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
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

for (const file of [...explicitFiles]) {
  if (file.startsWith('docs/')) {
    explicitFiles.delete(file);
    explicitFiles.add(path.relative(root, path.join(repoRoot, file)).replaceAll('\\', '/'));
  }
}

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

const files = [
  ...explicitFiles,
  ...['src', 'src-tauri/src'].flatMap((directory) => walk(path.join(root, directory))),
].map((file) => file.replaceAll('\\', '/'))
  .filter((file, index, all) => all.indexOf(file) === index)
  .sort();

const violations = [];
for (const relativePath of files) {
  const absolutePath = path.join(root, relativePath);
  const text = fs.readFileSync(absolutePath, 'utf8');
  text.split(/\r?\n/u).forEach((line, index) => {
    if (mojibakePattern.test(line) || controlPattern.test(line)) {
      violations.push(`${relativePath}:${index + 1}`);
    }
  });
}

const flatten = (value, prefix = '', result = {}) => {
  for (const [key, child] of Object.entries(value)) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) flatten(child, next, result);
    else result[next] = child;
  }
  return result;
};

let localeError = null;
try {
  const vi = JSON.parse(fs.readFileSync(path.join(root, 'src/modules/i18n/locales/vi/common.json'), 'utf8'));
  const en = JSON.parse(fs.readFileSync(path.join(root, 'src/modules/i18n/locales/en/common.json'), 'utf8'));
  const viKeys = Object.keys(flatten(vi));
  const enKeys = Object.keys(flatten(en));
  const missingInEn = viKeys.filter((key) => !enKeys.includes(key));
  const missingInVi = enKeys.filter((key) => !viKeys.includes(key));
  if (missingInEn.length || missingInVi.length) {
    localeError = `locale key mismatch: missingInEn=${missingInEn.join(',')} missingInVi=${missingInVi.join(',')}`;
  }
} catch (error) {
  localeError = `locale parse failure: ${error instanceof Error ? error.message : String(error)}`;
}

if (violations.length || localeError) {
  console.error('Encoding check failed.');
  for (const violation of violations) console.error(`- ${violation}`);
  if (localeError) console.error(`- ${localeError}`);
  process.exitCode = 1;
} else {
  console.log(`Encoding and locale check passed for ${files.length} files.`);
}
