// src/core/loader.ts
import fs from 'fs';
import path from 'path';
import { Telegraf } from 'telegraf';

export const loadModules = (bot: Telegraf) => {
    const modulesCandidates = [
        path.join(__dirname, '../modules'),
        path.join(__dirname, 'modules')
    ];
    const modulesPath = modulesCandidates.find((candidate) => fs.existsSync(candidate));

    // Pastikan folder modules ada
    if (!modulesPath) {
        console.warn('⚠️ Folder modules tidak ditemukan!');
        return;
    }

    // Baca semua sub-folder di dalam src/modules/
    const moduleFolders = fs.readdirSync(modulesPath).filter(file => 
        fs.statSync(path.join(modulesPath, file)).isDirectory()
    );

    let loadedCount = 0;

    moduleFolders.forEach((folder) => {
        const indexJsPath = path.join(modulesPath, folder, 'index.js');
        const indexTsPath = path.join(modulesPath, folder, 'index.ts');
        const indexPath = fs.existsSync(indexJsPath) ? indexJsPath : indexTsPath;
        
        // Muat file modul yang tersedia untuk mode dist (js) atau dev (ts).
        if (fs.existsSync(indexPath)) {
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