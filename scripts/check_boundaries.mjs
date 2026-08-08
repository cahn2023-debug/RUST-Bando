import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourceRoot = path.join(root, 'src');
const sourceExtensions = new Set(['.ts', '.tsx']);
const directTauriImport = /@tauri-apps\/(?:api|plugin)(?:\/|['"])/u;

const isTestFile = (relativePath) => relativePath.includes('__tests__') || /\.test\.[^.]+$/u.test(relativePath);

const walk = (directory) => {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(absolute));
    else if (sourceExtensions.has(path.extname(entry.name))) files.push(absolute);
  }
  return files;
};

const violations = [];
for (const absolutePath of walk(sourceRoot)) {
  const relativePath = path.relative(root, absolutePath).replaceAll('\\', '/');
  if (relativePath === 'src/modules/implement/lib/tauri.ts' || relativePath === 'src/test-setup.ts' || isTestFile(relativePath)) {
    continue;
  }

  fs.readFileSync(absolutePath, 'utf8').split(/\r?\n/u).forEach((line, index) => {
    if (directTauriImport.test(line)) violations.push(`${relativePath}:${index + 1}`);
  });
}

if (violations.length) {
  console.error('Tauri boundary check failed. Use the adapter/facade instead of importing Tauri in feature code.');
  violations.forEach((violation) => console.error(`- ${violation}`));
  process.exitCode = 1;
} else {
  console.log('Tauri boundary check passed.');
}
