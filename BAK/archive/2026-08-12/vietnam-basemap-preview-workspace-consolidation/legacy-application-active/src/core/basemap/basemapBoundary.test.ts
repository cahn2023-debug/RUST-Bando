import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const forbiddenPatterns = [
    /modules\/design/,
    /modules\\design/,
    /@DESIGN/,
    /@IMPLEMENT/,
    /useDesignSync/,
    /FeatureState/,
    /DesignState/,
    /projectId/,
    /projectMetadata/,
    /activeProject/,
];

const collectFiles = (dir: string): string[] => {
    const entries = readdirSync(dir);
    return entries.flatMap(entry => {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) return collectFiles(path);
        return /\.(ts|tsx)$/.test(entry) && !entry.endsWith('.test.ts') && !entry.endsWith('.test.tsx')
            ? [path]
            : [];
    });
};

describe('core basemap dependency boundary', () => {
    it('does not import or reference project/design domain code', () => {
        const files = collectFiles(join(process.cwd(), 'src/core/basemap'));
        const violations = files.flatMap(file => {
            const source = readFileSync(file, 'utf8');
            return forbiddenPatterns
                .filter(pattern => pattern.test(source))
                .map(pattern => `${file}: ${pattern}`);
        });

        expect(violations).toEqual([]);
    });
});
