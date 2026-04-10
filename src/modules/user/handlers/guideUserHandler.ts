// src/modules/user/handlers/guideUserHandler.ts
// ==========================================
// 📖 USER GUIDE HANDLER
// ==========================================
// Menampilkan menu panduan dinamis kepada user

import { Telegraf } from 'telegraf';
import { MyContext } from '../../../middlewares/guard';
import { Guide, IGuide } from '../../../models/Guide';

// ==========================================
// 🛠️ HELPER: KIRIM KONTEN PANDUAN KE USER
// ==========================================
const sendGuideContent = async (ctx: MyContext, guide: IGuide) => {
    const backKeyboard = {
        inline_keyboard: [
            [
                { text: '⬅️ Kembali ke Panduan', callback_data: 'user_guide_menu' },
                { text: '🏠 Menu Utama', callback_data: 'user_home' }
            ]
        ]
    };

    const locationRow = guide.location
        ? `\n\n📍 <b>Lokasi:</b> ${guide.location}`
        : '';

    const fullContent = `<blockquote><b>${guide.emoji} ${guide.title}</b></blockquote>\n\n${guide.content}${locationRow}`;

    // Kirim media jika ada
    if (guide.mediaType !== 'none' && guide.mediaFileId) {
        const caption = `${fullContent}`;
        try {
            switch (guide.mediaType) {
                case 'photo':
                    await ctx.replyWithPhoto(guide.mediaFileId, {
                        caption,
                        parse_mode: 'HTML',
                        reply_markup: backKeyboard
                    });
                    break;
                case 'video':
                    await ctx.replyWithVideo(guide.mediaFileId, {
                        caption,
                        parse_mode: 'HTML',
                        reply_markup: backKeyboard
                    });
                    break;
                case 'document':
                    await ctx.replyWithDocument(guide.mediaFileId, {
                        caption,
                        parse_mode: 'HTML',
                        reply_markup: backKeyboard
                    });
                    break;
                case 'animation':
                    await ctx.replyWithAnimation(guide.mediaFileId, {
                        caption,
                        parse_mode: 'HTML',
                        reply_markup: backKeyboard
                    });
                    break;
                case 'audio':
                    await ctx.replyWithAudio(guide.mediaFileId, {
                        caption,
                        parse_mode: 'HTML',
                        reply_markup: backKeyboard
                    });
                    break;
                default:
                    await ctx.reply(fullContent, { parse_mode: 'HTML', reply_markup: backKeyboard });
            }
        } catch (error) {
            // Fallback jika media gagal
            await ctx.reply(fullContent, { parse_mode: 'HTML', reply_markup: backKeyboard });
        }

        // Kirim lokasi Telegram jika ada koordinat
        if (guide.locationLat && guide.locationLon) {
            await ctx.replyWithLocation(guide.locationLat, guide.locationLon);
        }
        return;
    }

    // Tanpa media - kirim teks biasa
    await ctx.reply(fullContent, { parse_mode: 'HTML', reply_markup: backKeyboard });

    // Kirim lokasi Telegram jika ada koordinat
    if (guide.locationLat && guide.locationLon) {
        await ctx.replyWithLocation(guide.locationLat, guide.locationLon);
    }
};

// ==========================================
// 📋 RENDER MENU PANDUAN USER
// ==========================================
export const renderUserGuideMenu = async (ctx: MyContext, isEdit = false) => {
    const guides = await Guide.find({ isActive: true }).sort({ order: 1, createdAt: 1 });

    if (guides.length === 0) {
        const emptyText = `<blockquote><b>📖 Menu Panduan</b></blockquote>\n\nBelum ada panduan tersedia saat ini.\nSilakan hubungi admin jika butuh bantuan.`;
        const keyboard = {
            inline_keyboard: [
                [{ text: '⬅️ Kembali', callback_data: 'user_home' }]
            ]
        };

        if (isEdit) {
            try {
                await ctx.editMessageCaption(emptyText, { parse_mode: 'HTML', reply_markup: keyboard });
            } catch {
                await ctx.reply(emptyText, { parse_mode: 'HTML', reply_markup: keyboard });
            }
            return;
        }
        await ctx.reply(emptyText, { parse_mode: 'HTML', reply_markup: keyboard });
        return;
    }

    // Build keyboard dinamis dari database
    const guideButtons = guides.map(g => ([{
        text: `${g.emoji} ${g.title}`,
        callback_data: `user_guide_view_${g._id}`
    }]));

    const keyboard = {
        inline_keyboard: [
            ...guideButtons,
            [{ text: '⬅️ Kembali ke Menu', callback_data: 'user_home' }]
        ]
    };

    const caption = `<blockquote><b>📖 Menu Panduan</b></blockquote>

Pilih panduan di bawah untuk membaca informasi lengkapnya:`;

    if (isEdit) {
        try {
            await ctx.editMessageCaption(caption, { parse_mode: 'HTML', reply_markup: keyboard });
        } catch {
            await ctx.reply(caption, { parse_mode: 'HTML', reply_markup: keyboard });
        }
        return;
    }

    await ctx.reply(caption, { parse_mode: 'HTML', reply_markup: keyboard });
};

// ==========================================
// 📝 REGISTER HANDLER
// ==========================================
export const registerGuideUserHandlers = (bot: Telegraf<MyContext>) => {
    // Tombol panduan di menu utama user
    bot.action('user_guide_menu', async (ctx) => {
        if (!ctx.dbUser) {
            await ctx.answerCbQuery('Silakan ulangi /start terlebih dahulu.', { show_alert: true });
            return;
        }
        await ctx.answerCbQuery();
        await renderUserGuideMenu(ctx, true);
    });

    // Buka detail panduan
    bot.action(/^user_guide_view_(.+)$/, async (ctx) => {
        if (!ctx.dbUser) {
            await ctx.answerCbQuery('Silakan ulangi /start terlebih dahulu.', { show_alert: true });
            return;
        }
        await ctx.answerCbQuery();

        const guideId = (ctx.match as RegExpMatchArray)[1];
        const guide = await Guide.findById(guideId);

        if (!guide || !guide.isActive) {
            await ctx.answerCbQuery('❌ Panduan ini tidak tersedia.', { show_alert: true });
            return;
        }

        await sendGuideContent(ctx, guide);
    });

    // Command /panduan untuk user
    bot.command('panduan', async (ctx) => {
        if (!ctx.dbUser) return;
        await renderUserGuideMenu(ctx, false);
    });
};
