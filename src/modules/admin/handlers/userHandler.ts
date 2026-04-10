// src/modules/admin/handlers/userHandler.ts
// ==========================================
// 👥 USER MANAGEMENT HANDLER
// ==========================================

import { Telegraf } from 'telegraf';
import { MyContext } from '../../../middlewares/guard';
import { User } from '../../../models/User';
import { ADMIN_CONFIG } from '../utils/constants';
import { PAGINATION_CONFIG, USER_SEARCH_STATE_KEYS } from '../utils/constants';
import {
    getMenuImage,
    safeAnswerCbQuery,
    ensureOwnerAction,
    adminGuard,
    escapeRegex,
    makePaginationButtons
} from '../utils/helpers';
import { formatUserLabel, formatCurrency, formatTimestamp } from '../utils/formatters';

/**
 * Render user list/search menu intro
 */
const renderOwnerUserMenu = async (ctx: MyContext, isEdit = true) => {
    const caption = `<blockquote><b>👥 List User Admin</b></blockquote>
Kelola daftar user dari panel ini:

• List user dengan pagination
• Search user (nama, username, atau ID Telegram)
• Cek saldo user langsung dari tombol`;

    const reply_markup = {
        inline_keyboard: [
            [{ text: '📋 Semua User', callback_data: 'owner_users_p_1' }],
            [{ text: '🔍 Search User', callback_data: 'owner_users_search_prompt' }],
            [{ text: '⬅️ Kembali ke Admin Menu', callback_data: 'owner_home' }]
        ]
    };

    if (isEdit) {
        await ctx.editMessageCaption(caption, { parse_mode: 'HTML', reply_markup });
        return;
    }

    await ctx.replyWithPhoto(getMenuImage(), { caption, parse_mode: 'HTML', reply_markup });
};

/**
 * Render user list with pagination and search
 */
const renderUsersPage = async (ctx: MyContext, page: number, keyword?: string, isEdit = true) => {
    const hasKeyword = Boolean(keyword && keyword.trim());
    const normalizedKeyword = keyword?.trim() || '';
    const query = hasKeyword
        ? {
            $or: [
                { fullName: { $regex: escapeRegex(normalizedKeyword), $options: 'i' } },
                { username: { $regex: escapeRegex(normalizedKeyword), $options: 'i' } },
                ...(Number.isFinite(Number(normalizedKeyword)) ? [{ telegramId: Number(normalizedKeyword) }] : [])
            ]
        }
        : {};

    const totalUsers = await User.countDocuments(query as any);
    if (totalUsers === 0) {
        const emptyText = hasKeyword
            ? `📭 *User dengan keyword* \`${normalizedKeyword}\` *tidak ditemukan.*`
            : '📭 *Belum ada user terdaftar.*';

        const fallbackKeyboard = hasKeyword
            ? [
                [{ text: '🔍 Search Lagi', callback_data: 'owner_users_search_prompt' }],
                [{ text: '📋 Semua User', callback_data: 'owner_users_p_1' }],
                [{ text: '⬅️ Kembali', callback_data: 'owner_user_menu' }]
            ]
            : [
                [{ text: '⬅️ Kembali', callback_data: 'owner_user_menu' }],
                [{ text: '🏠 Admin Menu', callback_data: 'owner_home' }]
            ];

        if (isEdit) {
            await ctx.editMessageCaption(emptyText, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: fallbackKeyboard }
            });
        } else {
            await ctx.reply(emptyText, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: fallbackKeyboard }
            });
        }
        return;
    }

    const totalPages = Math.max(1, Math.ceil(totalUsers / PAGINATION_CONFIG.ADMIN_USER_PER_PAGE));
    const safePage = Math.min(Math.max(page, 1), totalPages);

    const users = await User.find(query as any)
        .sort({ joinedAt: -1 })
        .skip((safePage - 1) * PAGINATION_CONFIG.ADMIN_USER_PER_PAGE)
        .limit(PAGINATION_CONFIG.ADMIN_USER_PER_PAGE);

    const title = hasKeyword
        ? `👥 *Hasil Search User*\n🔍 Keyword: *${normalizedKeyword}*`
        : '👥 *Daftar User*';

    let caption = `${title}\n📄 Halaman ${safePage}/${totalPages}\n📦 Total Data: *${totalUsers}*\n\n`;

    users.forEach((user, index) => {
        const displayName = user.username ? `@${user.username}` : user.fullName;
        const statusBlacklist = user.isBlacklisted ? '🚫 Blacklisted' : '✅ Active';
        caption += `*${(safePage - 1) * PAGINATION_CONFIG.ADMIN_USER_PER_PAGE + index + 1}. ${displayName}*\n`;
        caption += `🆔 ID: \`${user.telegramId}\`\n`;
        caption += `👤 Nama: ${user.fullName}\n`;
        caption += `💰 Saldo: ${formatCurrency(user.balance)}\n`;
        caption += `🛡️ Status: ${statusBlacklist}\n`;
        caption += `🗓️ Join: ${formatTimestamp(user.joinedAt)} WIB\n`;
        caption += `━━━━━━━━━━━━━━━━━━\n`;
    });

    const prefix = hasKeyword ? 'owner_users_search_p' : 'owner_users_p';
    const paginationRow = makePaginationButtons(prefix, safePage, totalPages);
    const balanceRows = users.map((u) => [{ text: `💳 Cek Saldo ${u.telegramId}`, callback_data: `owner_user_balance_${u.telegramId}` }]);

    const keyboard = [
        paginationRow,
        ...balanceRows,
        [{ text: '🔍 Search User', callback_data: 'owner_users_search_prompt' }],
        [{ text: '⬅️ Kembali', callback_data: 'owner_user_menu' }],
        [{ text: '🏠 Admin Menu', callback_data: 'owner_home' }]
    ];

    if (isEdit) {
        await ctx.editMessageCaption(caption, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard }
        });
        return;
    }

    await ctx.replyWithPhoto(getMenuImage(), {
        caption,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard }
    });
};

/**
 * Register user handler actions
 */
export const registerUserHandlers = (bot: Telegraf<MyContext>) => {
    bot.action('owner_user_menu', async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;
        if (ctx.session) {
            (ctx.session as any)[USER_SEARCH_STATE_KEYS.AWAITING_SEARCH] = false;
            (ctx.session as any)[USER_SEARCH_STATE_KEYS.SEARCH_KEYWORD] = undefined;
        }
        await safeAnswerCbQuery(ctx);
        await renderOwnerUserMenu(ctx, true);
    });

    bot.action('owner_users_search_prompt', async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;
        if (ctx.session) {
            (ctx.session as any)[USER_SEARCH_STATE_KEYS.AWAITING_SEARCH] = true;
            (ctx.session as any)[USER_SEARCH_STATE_KEYS.SEARCH_KEYWORD] = undefined;
        }

        await safeAnswerCbQuery(ctx, 'Kirim keyword sekarang (nama/username/id).');
        await ctx.editMessageCaption(
            '🔍 *Search User*\n\nKirim pesan teks berisi keyword user yang ingin dicari.\nContoh:\n• `agus`\n• `@agus_store`\n• `628123456789`',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📋 Lihat Semua User', callback_data: 'owner_users_p_1' }],
                        [{ text: '⬅️ Kembali', callback_data: 'owner_user_menu' }]
                    ]
                }
            }
        );
    });

    bot.action(/^owner_users_p_(\d+)$/, async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;
        const page = Number(ctx.match[1] || 1);

        if (ctx.session) {
            (ctx.session as any)[USER_SEARCH_STATE_KEYS.AWAITING_SEARCH] = false;
            (ctx.session as any)[USER_SEARCH_STATE_KEYS.SEARCH_KEYWORD] = undefined;
        }

        await safeAnswerCbQuery(ctx);
        await renderUsersPage(ctx, page);
    });

    bot.action(/^owner_users_search_p_(\d+)$/, async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;
        const page = Number(ctx.match[1] || 1);
        const keyword = (ctx.session as any)?.[USER_SEARCH_STATE_KEYS.SEARCH_KEYWORD];

        if (!keyword) {
            await safeAnswerCbQuery(ctx, 'Sesi search habis. Ulangi search user.', { show_alert: true });
            await renderOwnerUserMenu(ctx, true);
            return;
        }

        await safeAnswerCbQuery(ctx);
        await renderUsersPage(ctx, page, keyword);
    });

    bot.action(/^owner_user_balance_(\d+)$/, async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;

        const telegramId = Number(ctx.match[1]);
        const user = await User.findOne({ telegramId });

        if (!user) {
            await safeAnswerCbQuery(ctx, 'User tidak ditemukan.', { show_alert: true });
            return;
        }

        const label = user.username ? `@${user.username}` : user.fullName;
        await safeAnswerCbQuery(
            ctx,
            `${label}\nID: ${user.telegramId}\nSaldo: ${formatCurrency(user.balance)}`,
            { show_alert: true }
        );
    });

    bot.command('listuser', adminGuard, async (ctx) => {
        const keyword = ctx.message.text.split(' ').slice(1).join(' ').trim();
        if (ctx.session) {
            (ctx.session as any)[USER_SEARCH_STATE_KEYS.AWAITING_SEARCH] = false;
            (ctx.session as any)[USER_SEARCH_STATE_KEYS.SEARCH_KEYWORD] = keyword || undefined;
        }

        await renderUsersPage(ctx, 1, keyword || undefined, false);
    });

    bot.on('text', async (ctx, next) => {
        if (ctx.from?.id !== ADMIN_CONFIG.OWNER_ID || !(ctx.session as any)?.[USER_SEARCH_STATE_KEYS.AWAITING_SEARCH]) return next();

        const keyword = ctx.message.text.trim();
        if (!keyword) {
            await ctx.reply('❗ Keyword tidak boleh kosong. Kirim nama/username/id user.', { parse_mode: 'Markdown' });
            return;
        }

        (ctx.session as any)[USER_SEARCH_STATE_KEYS.AWAITING_SEARCH] = false;
        (ctx.session as any)[USER_SEARCH_STATE_KEYS.SEARCH_KEYWORD] = keyword;

        await renderUsersPage(ctx, 1, keyword, false);
    });
};
