import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const workspaceRoot = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(workspaceRoot, '..');
const artifactRoot = join(repositoryRoot, 'dist', 'basemap-preview-debug');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function read(path) {
    return readFileSync(join(workspaceRoot, path), 'utf8');
}

for (const artifact of ['vietnam-basemap-preview.exe', 'vietnam-basemap-preview.pdb']) {
    const path = join(artifactRoot, artifact);
    assert(existsSync(path), `Missing debug artifact: ${path}`);
    assert(statSync(path).size > 1024, `Debug artifact is unexpectedly small: ${path}`);
}

const googleSource = read('src/basemapPreview/googleSource.ts');
assert(googleSource.includes('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}'), 'Google template drifted');
assert(googleSource.includes('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}'), 'Google hybrid template drifted');
assert(googleSource.includes('GOOGLE_TILE_PROXY_PATH'), 'Google tile CORS proxy is not wired');
assert(googleSource.includes('buildGoogleTileProxyTemplate'), 'Google tile templates do not use the preview proxy');
assert(googleSource.includes('import.meta.env.DEV'), 'Dev proxy routing is not explicit');
assert(googleSource.includes("'__TAURI_INTERNALS__' in window"), 'Tauri/browser proxy routing is not explicit');
assert(googleSource.includes('recordTileError'), 'Google tile error policy is not wired');
assert(!googleSource.includes('fallback'), 'Google adapter must not implement fallback');

const localPackage = read('src/basemapPreview/localPackage.ts');
assert(localPackage.includes('validatePreviewManifest'), 'Local manifest validation missing');
assert(localPackage.includes('containsExternalUrl'), 'Local style external URL validation missing');
assert(localPackage.includes('pmtiles://package'), 'Local PMTiles style protocol missing');

const localProtocol = read('src/basemapPreview/localProtocol.ts');
assert(localProtocol.includes('new PMTiles(source)'), 'Local PMTiles archive reader missing');

const tauriMain = read('src-tauri/src/main.rs');
assert(tauriMain.includes('read_preview_package_file'), 'Package reader command missing');
assert(tauriMain.includes('TcpListener::bind(("127.0.0.1", 0))'), 'HTTP proxy has no port collision fallback');
assert(tauriMain.includes('thread::spawn(move || handle_http_connection'), 'HTTP proxy still serializes tile requests');
assert(tauriMain.includes('pool_max_idle_per_host(32)'), 'Google tile client pooling is not configured');
assert(!/\b(activate|rollback)\b/i.test(tauriMain), 'Release lifecycle command leaked into preview shell');

for (const file of [
    'src/BasemapPreviewApp.tsx',
    'src/basemapPreview/MapCanvas.tsx',
    'src/basemapPreview/MetadataDrawer.tsx',
]) {
    const content = read(file);
    assert(!content.includes('../src/'), `Production source import leaked into ${file}`);
    assert(!content.includes('src-tauri/'), `Production Tauri path leaked into ${file}`);
}

console.log('Vietnam Basemap Preview smoke verifier: PASS');
console.log('  - standalone EXE/PDB present');
console.log('  - Google template and error-only policy present');
console.log('  - local manifest/style validation present');
console.log('  - read-only production boundary present');
