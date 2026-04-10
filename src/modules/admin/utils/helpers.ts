// src/modules/admin/utils/helpers.ts
// ==========================================
// 🛠️ ADMIN MODULE HELPER FUNCTIONS
// ==========================================

import { MyContext } from '../../../middlewares/guard';
import { Setting } from '../../../models/Setting';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ADMIN_CONFIG } from './constants';

/**
 * Load image dari folder lokal atau fallback ke URL
 */
export const getMenuImage = () => {
    const fullPath = path.resolve(ADMIN_CONFIG.MENU_IMAGE_PATH);
    if (fs.existsSync(fullPath)) {
        return { source: fs.createReadStream(fullPath) };
    }
    return { url: ADMIN_CONFIG.FALLBACK_IMAGE_URL };
};

/**
 * Deteksi error untuk callback query yang sudah expired
 */
export const isExpiredCallbackQueryError = (error: unknown): boolean => {
    if (!(error instanceof Error)) return false;
    const description = (error as Error & { response?: { description?: string } }).response?.description || error.message;
    const normalized = description.toLowerCase();
    return normalized.includes('query is too old')
        || normalized.includes('query id is invalid')
        || normalized.includes('response timeout expired');
};

/**
 * Safe answer callback query dengan error handling
 */
export const safeAnswerCbQuery = async (
    ctx: MyContext,
    text?: string,
    extra?: { show_alert?: boolean; url?: string; cache_time?: number }
) => {
    try {
        await ctx.answerCbQuery(text, extra);
    } catch (error) {
        if (!isExpiredCallbackQueryError(error)) throw error;
    }
};

/**
 * Parse toggle command (on/off)
 */
export const parseToggle = (text: string): boolean => text.split(' ')[1]?.toLowerCase() === 'on';

/**
 * Escape regex special characters
 */
export const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Generate pagination button row
 */
export const makePaginationButtons = (
    prefix: string,
    currentPage: number,
    totalPages: number
): Array<{ text: string; callback_data: string }> => {
    const buttons: Array<{ text: string; callback_data: string }> = [];

    if (currentPage > 1) {
        buttons.push({ text: '⬅️ Prev', callback_data: `${prefix}_${currentPage - 1}` });
    }

    buttons.push({ text: `📖 Hal ${currentPage}/${totalPages}`, callback_data: 'owner_noop' });

    if (currentPage < totalPages) {
        buttons.push({ text: 'Next ➡️', callback_data: `${prefix}_${currentPage + 1}` });
    }

    return buttons;
};

/**
 * Get bot uptime text (Hari, Jam, Menit)
 */
export const getUptimeText = (): string => {
    const uptime = os.uptime();
    const hari = Math.floor(uptime / 86400);
    const jam = Math.floor((uptime % 86400) / 3600);
    const menit = Math.floor((uptime % 3600) / 60);
    return `${hari} Hari, ${jam} Jam, ${menit} Menit`;
};

/**
 * Ensure action is only for owner
 */
export const ensureOwnerAction = async (ctx: MyContext): Promise<boolean> => {
    if (ctx.from?.id !== ADMIN_CONFIG.OWNER_ID) {
        await safeAnswerCbQuery(ctx, 'Akses hanya untuk owner.', { show_alert: true });
        return false;
    }
    return true;
};

/**
 * Get or create settings document
 */
export const getOrCreateSettings = async (): Promise<any> => {
    let settings = await Setting.findOne();
    if (!settings) settings = await Setting.create({});
    return settings;
};

/**
 * Middleware guard for admin only
 */
export const adminGuard = async (ctx: MyContext, next: () => Promise<void>) => {
    if (ctx.from?.id !== ADMIN_CONFIG.OWNER_ID) {
        await ctx.reply('❌ *Akses Ditolak!*\nHanya owner yang dapat menggunakan perintah ini.', { parse_mode: 'Markdown' });
        return;
    }
    return next();
};
