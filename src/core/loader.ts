// src/core/loader.ts
import fs from 'fs';
import path from 'path';
import { Telegraf } from 'telegraf';

export const loadModules = (bot: Telegraf) => {
    const modulesPath = path.join(__dirname, '../modules');
    const disabledModules = new Set(['h2h']);

    // Pastikan folder modules ada
    if (!fs.existsSync(modulesPath)) {
        console.warn('⚠️ Folder modules tidak ditemukan!');
        return;
    }

    // Baca semua sub-folder di dalam src/modules/
    const moduleFolders = fs.readdirSync(modulesPath).filter(file => 
        fs.statSync(path.join(modulesPath, file)).isDirectory() && !disabledModules.has(file)
    );

    const resolveModuleEntry = (folder: string) => {
        const candidates = [
            path.join(modulesPath, folder, 'index.js'),
            path.join(modulesPath, folder, 'index.cjs'),
            path.join(modulesPath, folder, 'index.mjs'),
            path.join(modulesPath, folder, 'index.ts')
        ];

        return candidates.find(file => fs.existsSync(file));
    };

    let loadedCount = 0;

    moduleFolders.forEach((folder) => {
        const indexPath = resolveModuleEntry(folder);
        
        // Jika file index.ts ada di dalam folder tersebut, muat fiturnya
        if (indexPath) {
            const moduleSetup = require(indexPath).default;
            if (typeof moduleSetup === 'function') {
                moduleSetup(bot);
                loadedCount++;
                console.log(`📦 Modul dimuat: [${folder}]`);
            }
        }
    });

    console.log(`✅ Total ${loadedCount} modul berhasil dimuat.`);
};