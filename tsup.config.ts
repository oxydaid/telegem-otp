import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/app.ts', 'src/modules/*/index.ts'],
    format: ['cjs'],
    platform: 'node',
    target: 'node20',
    outDir: 'dist',
    clean: true,
    sourcemap: false,
    dts: false,
    splitting: false,
    bundle: true,
    minify: true,
    tsconfig: './tsconfig.json'
});