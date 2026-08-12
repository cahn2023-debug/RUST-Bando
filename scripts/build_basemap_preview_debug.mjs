import { cpSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const previewRoot = join(root, 'vietnam-basemap-preview');
const manifest = join(previewRoot, 'src-tauri', 'Cargo.toml');
const targetDir = join(root, 'dist', 'basemap-preview-debug');
const cargoTarget = join(previewRoot, 'target');
const npm = 'npm';

function run(command, args, env = {}) {
    const isWindowsNpm = process.platform === 'win32' && command === 'npm';
    const executable = isWindowsNpm ? process.env.ComSpec : command;
    const executableArgs = isWindowsNpm ? ['/d', '/s', '/c', [command, ...args].join(' ')] : args;
    const result = spawnSync(executable, executableArgs, {
        cwd: root,
        env: { ...process.env, ...env },
        stdio: 'inherit',
    });
    if (result.error) {
        console.error(result.error);
        process.exit(1);
    }
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

run(npm, ['run', 'build:basemap-preview'], { TAURI_DEBUG: 'true' });
run('cargo', ['build', '--manifest-path', manifest, '--bin', 'vietnam-basemap-preview'], {
    CARGO_TARGET_DIR: cargoTarget,
});

const binary = join(cargoTarget, 'debug', 'vietnam-basemap-preview.exe');
const symbols = join(cargoTarget, 'debug', 'vietnam_basemap_preview.pdb');
mkdirSync(targetDir, { recursive: true });
cpSync(binary, join(targetDir, 'vietnam-basemap-preview.exe'));
cpSync(symbols, join(targetDir, 'vietnam-basemap-preview.pdb'));
console.log(`Debug artifacts: ${targetDir}`);
