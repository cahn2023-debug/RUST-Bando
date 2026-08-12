import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const artifactRoot = join(root, 'dist', 'basemap-preview-debug');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function read(path) {
    return readFileSync(join(root, path), 'utf8');
}

for (const artifact of ['vietnam-basemap-preview.exe', 'vietnam-basemap-preview.pdb']) {
    const path = join(artifactRoot, artifact);
    assert(existsSync(path), `Missing debug artifact: ${path}`);
    assert(statSync(path).size > 1024, `Debug artifact is unexpectedly small: ${path}`);
}

const googleSource = read('vietnam-basemap-preview/src/basemapPreview/googleSource.ts');
assert(googleSource.includes('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}'), 'Google template drifted');
assert(googleSource.includes('recordTileError'), 'Google tile error policy is not wired');
assert(!googleSource.includes('fallback'), 'Google adapter must not implement fallback');

const localPackage = read('vietnam-basemap-preview/src/basemapPreview/localPackage.ts');
assert(localPackage.includes('validatePreviewManifest'), 'Local manifest validation missing');
assert(localPackage.includes('containsExternalUrl'), 'Local style external URL validation missing');
assert(localPackage.includes('pmtiles://package'), 'Local PMTiles style protocol missing');

const localProtocol = read('vietnam-basemap-preview/src/basemapPreview/localProtocol.ts');
assert(localProtocol.includes('new PMTiles(source)'), 'Local PMTiles archive reader missing');

const tauriMain = read('vietnam-basemap-preview/src-tauri/src/main.rs');
assert(tauriMain.includes('read_preview_package_file'), 'Package reader command missing');
assert(!/\b(activate|rollback)\b/i.test(tauriMain), 'Release lifecycle command leaked into preview shell');

const sourceFiles = [
    'vietnam-basemap-preview/src/BasemapPreviewApp.tsx',
    'vietnam-basemap-preview/src/basemapPreview/MapCanvas.tsx',
    'vietnam-basemap-preview/src/basemapPreview/MetadataDrawer.tsx',
];
for (const file of sourceFiles) {
    const content = read(file);
    assert(!content.includes('../src/'), `Production source import leaked into ${file}`);
    assert(!content.includes('src-tauri/'), `Production Tauri path leaked into ${file}`);
}

console.log('Vietnam Basemap Preview smoke verifier: PASS');
console.log('  - standalone EXE/PDB present');
console.log('  - Google template and error-only policy present');
console.log('  - local manifest/style validation present');
console.log('  - read-only production boundary present');
