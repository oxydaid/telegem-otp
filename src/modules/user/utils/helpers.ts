// src/modules/user/utils/helpers.ts
import fs from 'fs';
import path from 'path';
import { MyContext } from '../../../middlewares/guard';
import { USER_CONFIG } from './constants';

// ==========================================
// 🖼️ HELPER: LOAD IMAGE (LOCAL OR URL)
// ==========================================
export const getMenuImage = () => {
    const fullPath = path.resolve(USER_CONFIG.MENU_IMAGE_PATH);
    if (fs.existsSync(fullPath)) {
        return { source: fs.createReadStream(fullPath) };
    }
    return { url: USER_CONFIG.FALLBACK_IMAGE_URL };
};

// ==========================================
// 🛡️ HELPER: ENSURE USER AUTH
// ==========================================
export const ensureUserAuth = async (ctx: MyContext) => {
    if (!ctx.dbUser) {
        if (ctx.callbackQuery) {
            await ctx.answerCbQuery('Silakan ulangi perintah /start terlebih dahulu.', { show_alert: true });
        } else {
            await ctx.reply('❌ Silakan ulangi perintah /start terlebih dahulu.');
        }
        return false;
    }
    return true;
};
