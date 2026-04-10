// src/modules/admin/handlers/menuHandler.ts
// ==========================================
// ⚙️ ADMIN MENU HANDLER
// ==========================================

import { Telegraf } from 'telegraf';
import { MyContext } from '../../../middlewares/guard';
import { User } from '../../../models/User';
import { Setting } from '../../../models/Setting';
import { ADMIN_CONFIG } from '../utils/constants';
import {
    getMenuImage,
    safeAnswerCbQuery,
    getOrCreateSettings,
    getUptimeText,
    ensureOwnerAction,
    adminGuard
} from '../utils/helpers';
import { formatToggle, formatCurrency } from '../utils/formatters';

/**
 * Build owner menu keyboard by panel type
 */
const getOwnerMenuKeyboard = (panel: 'home' | 'mode' | 'stats' | 'balance' | 'tools') => {
    if (panel === 'mode') {
        return {
            inline_keyboard: [
                [
                    { text: '🔒 Toggle Self', callback_data: 'owner_toggle_self' },
                    { text: '🛠 Toggle Maintenance', callback_data: 'owner_toggle_maintenance' }
                ],
                [
                    { text: '👥 Toggle GroupOnly', callback_data: 'owner_toggle_group' }
                ],
                [
                    { text: '⬅️ Kembali', callback_data: 'owner_home' },
                    { text: '🔄 Refresh', callback_data: 'owner_mode' }
                ]
            ]
        };
    }

    if (panel === 'tools') {
        return {
            inline_keyboard: [
                [
                    { text: '📢 /broadcast', callback_data: 'owner_hint_broadcast' },
                    { text: '💰 /addsaldo', callback_data: 'owner_hint_addsaldo' }
                ],
                [
                    { text: '💸 /delsaldo', callback_data: 'owner_hint_delsaldo' },
                    { text: '🚫 /bluser', callback_data: 'owner_hint_bluser' }
                ],
                [
                    { text: '♻️ /unbluser', callback_data: 'owner_hint_unbluser' },
                    { text: '📋 /listsaldo', callback_data: 'owner_hint_listsaldo' }
                ],
                [
                    { text: '🗂 /backup', callback_data: 'owner_hint_backup' },
                    { text: '👥 /joingrup', callback_data: 'owner_hint_joingrup' }
                ],
                [
                    { text: '📣 /joinch', callback_data: 'owner_hint_joinch' }
                ],
                [
                    { text: '⬅️ Kembali', callback_data: 'owner_home' }
                ]
            ]
        };
    }

    return {
        inline_keyboard: [
            [
                { text: '⚙️ Mode Bot', callback_data: 'owner_mode' },
                { text: '📊 Statistik', callback_data: 'owner_stats' }
            ],
            [
                { text: '💳 Ringkasan Saldo', callback_data: 'owner_balance' },
                { text: '🛠️ Tools Cepat', callback_data: 'owner_tools' }
            ],
            [
                { text: '👥 List User', callback_data: 'owner_user_menu' },
                { text: '🧾 Riwayat Transaksi', callback_data: 'owner_history_menu' }
            ],
            [
                { text: '📣 Manajemen Channel/Group', callback_data: 'owner_channel_menu' }
            ],
            [
                { text: '📖 Manajemen Panduan', callback_data: 'guide_admin_menu' }
            ],
            [
                { text: '🆘 Kontak Admin', callback_data: 'owner_contact' },
                { text: '⌦ Developer ⌫', url: `https://t.me/${ADMIN_CONFIG.BOT_OWNER_NAME.replace('@', '')}` }
            ],
            [
                { text: '🔄 Refresh', callback_data: 'owner_refresh' }
            ]
        ]
    };
};

/**
 * Build owner menu caption by panel type
 */
const buildOwnerCaption = async (ctx: MyContext, panel: 'home' | 'mode' | 'stats' | 'balance' | 'tools') => {
    const username = ctx.from?.username || 'Owner';

    if (panel === 'mode') {
        const settings = await getOrCreateSettings();
        return `<blockquote><b>⚙️ Panel Mode Bot</b></blockquote>
👤 Owner: @${username}

🔒 Self Mode: <b>${formatToggle(settings.isSelfMode)}</b>
🛠 Maintenance: <b>${formatToggle(settings.isMaintenance)}</b>
👥 Group Only: <b>${formatToggle(settings.isGroupOnly)}</b>

Klik tombol toggle di bawah untuk ubah mode secara real-time.`;
    }

    if (panel === 'stats') {
        const [totalUser, blacklistedUser, activeBalanceUser, balanceAgg] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ isBlacklisted: true }),
            User.countDocuments({ balance: { $gt: 0 } }),
            User.aggregate([{ $group: { _id: null, totalBalance: { $sum: '$balance' } } }])
        ]);

        const totalBalance = balanceAgg[0]?.totalBalance || 0;

        return `<blockquote><b>📊 Statistik Bot</b></blockquote>
⏱ Runtime: <b>${getUptimeText()}</b>
👥 Total User: <b>${totalUser}</b>
🚫 Blacklisted: <b>${blacklistedUser}</b>
💰 User Bersaldo: <b>${activeBalanceUser}</b>
🏦 Akumulasi Saldo: <b>${formatCurrency(totalBalance)}</b>`;
    }

    if (panel === 'balance') {
        const topUsers = await User.find({ balance: { $gt: 0 } }).lean().sort({ balance: -1 }).limit(5);

        if (topUsers.length === 0) {
            return `<blockquote><b>💳 Ringkasan Saldo</b></blockquote>
Belum ada user dengan saldo di atas Rp0.`;
        }

        let text = `<blockquote><b>💳 Top 5 Saldo User</b></blockquote>\n`;
        topUsers.forEach((u, i) => {
            const uname = u.username ? `@${u.username}` : u.fullName;
            text += `\n${i + 1}. <b>${uname}</b>\n🆔 <code>${u.telegramId}</code>\n💰 ${formatCurrency(u.balance)}\n`;
        });
        return text;
    }

    if (panel === 'tools') {
        return `<blockquote><b>🛠️ Quick Tools</b></blockquote>
Gunakan tombol di bawah untuk melihat panduan singkat command owner.

Tip: Setelah buka panel ini, tetap gunakan command manual agar input lebih cepat.`;
    }

    return `<blockquote><b>🍁 ${ADMIN_CONFIG.BOT_NAME} 🛒</b></blockquote>
Halo, @${username} 👋

<b>Bot Information</b>
☇ Nama: ${ADMIN_CONFIG.BOT_NAME}
☇ Deskripsi: ${ADMIN_CONFIG.BOT_DESCRIPTION}
☇ Versi: ${ADMIN_CONFIG.BOT_VERSION}
☇ Framework: Telegraf (Node.js)
☇ Runtime: ${getUptimeText()}

<blockquote><b>Owner Interactive Panel</b></blockquote>
Pilih menu di bawah untuk kontrol cepat bot, cek statistik, dan ringkasan saldo.`;
};

/**
 * Render owner menu (home/mode/stats/balance/tools)
 */
const renderOwnerMenu = async (
    ctx: MyContext,
    panel: 'home' | 'mode' | 'stats' | 'balance' | 'tools' = 'home',
    isEdit = false
) => {
    const caption = await buildOwnerCaption(ctx, panel);
    const reply_markup = getOwnerMenuKeyboard(panel);

    if (isEdit) {
        try {
            await ctx.editMessageCaption(caption, { parse_mode: 'HTML', reply_markup });
        } catch {
            await ctx.replyWithPhoto(getMenuImage(), { caption, parse_mode: 'HTML', reply_markup });
        }
        return;
    }

    await ctx.replyWithPhoto(getMenuImage(), { caption, parse_mode: 'HTML', reply_markup });
};

/**
 * Register menu handlers
 */
export const registerMenuHandlers = (bot: Telegraf<MyContext>) => {
    bot.command('ownermenu', adminGuard, async (ctx) => {
        await renderOwnerMenu(ctx, 'home');
    });

    bot.action('owner_home', async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;
        await safeAnswerCbQuery(ctx);
        await renderOwnerMenu(ctx, 'home', true);
    });

    bot.action('owner_mode', async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;
        await safeAnswerCbQuery(ctx);
        await renderOwnerMenu(ctx, 'mode', true);
    });

    bot.action('owner_noop', async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;
        await safeAnswerCbQuery(ctx);
    });

    bot.action('owner_stats', async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;
        await safeAnswerCbQuery(ctx);
        await renderOwnerMenu(ctx, 'stats', true);
    });

    bot.action('owner_balance', async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;
        await safeAnswerCbQuery(ctx);
        await renderOwnerMenu(ctx, 'balance', true);
    });

    bot.action('owner_tools', async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;
        await safeAnswerCbQuery(ctx);
        await renderOwnerMenu(ctx, 'tools', true);
    });

    bot.action('owner_refresh', async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;
        await safeAnswerCbQuery(ctx, 'Menu diperbarui.');
        await renderOwnerMenu(ctx, 'home', true);
    });

    bot.action('owner_contact', async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;
        await ctx.answerCbQuery(`Hubungi ${ADMIN_CONFIG.BOT_OWNER_NAME} untuk bantuan cepat.`, { show_alert: true });
    });

    bot.action('owner_toggle_self', async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;
        const settings = await getOrCreateSettings();
        settings.isSelfMode = !settings.isSelfMode;
        await settings.save();
        await safeAnswerCbQuery(ctx, `Self mode: ${settings.isSelfMode ? 'ON' : 'OFF'}`);
        await renderOwnerMenu(ctx, 'mode', true);
    });

    bot.action('owner_toggle_maintenance', async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;
        const settings = await getOrCreateSettings();
        settings.isMaintenance = !settings.isMaintenance;
        await settings.save();
        await safeAnswerCbQuery(ctx, `Maintenance: ${settings.isMaintenance ? 'ON' : 'OFF'}`);
        await renderOwnerMenu(ctx, 'mode', true);
    });

    bot.action('owner_toggle_group', async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;
        const settings = await getOrCreateSettings();
        settings.isGroupOnly = !settings.isGroupOnly;
        await settings.save();
        await safeAnswerCbQuery(ctx, `Group only: ${settings.isGroupOnly ? 'ON' : 'OFF'}`);
        await renderOwnerMenu(ctx, 'mode', true);
    });

    // Tool hints
    bot.action('owner_hint_broadcast', async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;
        await safeAnswerCbQuery(ctx, 'Reply pesan target lalu kirim /broadcast', { show_alert: true });
    });

    bot.action('owner_hint_addsaldo', async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;
        await safeAnswerCbQuery(ctx, 'Format: /addsaldo <id_user> <nominal>', { show_alert: true });
    });

    bot.action('owner_hint_delsaldo', async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;
        await safeAnswerCbQuery(ctx, 'Format: /delsaldo <id_user> <nominal>', { show_alert: true });
    });

    bot.action('owner_hint_bluser', async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;
        await safeAnswerCbQuery(ctx, 'Format: /bluser <id_user>', { show_alert: true });
    });

    bot.action('owner_hint_unbluser', async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;
        await safeAnswerCbQuery(ctx, 'Format: /unbluser <id_user>', { show_alert: true });
    });

    bot.action('owner_hint_listsaldo', async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;
        await safeAnswerCbQuery(ctx, 'Kirim command /listsaldo untuk melihat Top 20 saldo.', { show_alert: true });
    });

    bot.action('owner_hint_backup', async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;
        await safeAnswerCbQuery(ctx, 'Gunakan /backup untuk unduh data database (JSON).', { show_alert: true });
    });

    bot.action('owner_hint_joingrup', async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;
        await safeAnswerCbQuery(ctx, 'Format: /joingrup <link_atau_username>', { show_alert: true });
    });

    bot.action('owner_hint_joinch', async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;
        await safeAnswerCbQuery(ctx, 'Format: /joinch <link_atau_username>', { show_alert: true });
    });
};
