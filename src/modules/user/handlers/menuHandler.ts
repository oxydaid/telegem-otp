// src/modules/user/handlers/menuHandler.ts
import { Telegraf } from 'telegraf';
import { MyContext } from '../../../middlewares/guard';
import { User } from '../../../models/User';
import { USER_CONFIG } from '../utils/constants';
import { getMenuImage, ensureUserAuth } from '../utils/helpers';

const getUserMenuKeyboard = (panel: 'home' | 'profile' | 'services' | 'history' | 'deposit' | 'leaderboard') => {
    if (panel === 'profile') {
        return {
            inline_keyboard: [
                [
                    { text: '💳 Topup Saldo', callback_data: 'user_topup' },
                    { text: '📊 Riwayat Deposit', callback_data: 'history_deposit_user' }
                ],
                [
                    { text: '⬅️ Kembali', callback_data: 'user_home' },
                    { text: '🔄 Refresh', callback_data: 'user_profile' }
                ]
            ]
        };
    }

    if (panel === 'history') {
        return {
            inline_keyboard: [
                [
                    { text: '📊 Riwayat Deposit', callback_data: 'history_deposit_user' }
                ],
                [
                    { text: '⬅️ Kembali', callback_data: 'user_home' }
                ]
            ]
        };
    }

    if (panel === 'deposit') {
        return {
            inline_keyboard: [
                [
                    { text: '💰 Lihat Cara Topup', callback_data: 'user_topup_guide' },
                    { text: '📋 List Order', callback_data: 'history_orderbot' }
                ],
                [
                    { text: '⬅️ Kembali', callback_data: 'user_home' }
                ]
            ]
        };
    }

    if (panel === 'leaderboard') {
        return {
            inline_keyboard: [
                [
                    { text: '⬅️ Kembali', callback_data: 'user_home' },
                    { text: '🔄 Refresh', callback_data: 'user_leaderboard' }
                ]
            ]
        };
    }

    return {
        inline_keyboard: [
            [
                { text: '📱 Order Nomor Virtual', callback_data: 'choose_service' },
                { text: '👤 Profil Saya', callback_data: 'user_profile' }
            ],
            [
                { text: '💰 Topup Saldo', callback_data: 'user_topup' },
                { text: '🛒 Riwayat Order', callback_data: 'history_orderbot' }
            ],
            [
                { text: '📊 Riwayat Deposit', callback_data: 'history_deposit_user' },
                { text: '🏆 Leaderboard', callback_data: 'user_leaderboard' }
            ],
            [
                { text: '📣 Channel & Group', callback_data: 'user_community_menu' },
                { text: '📖 Panduan', callback_data: 'user_guide_menu' }
            ],
            [
                { text: '☎️ CS', callback_data: 'user_contact' },
                { text: '❓ Bantuan', callback_data: 'user_help' }
            ]
        ]
    };
};

const buildUserCaption = async (ctx: MyContext, panel: 'home' | 'profile' | 'services' | 'history' | 'deposit' | 'leaderboard') => {
    const dbUser = ctx.dbUser!;
    const name = ctx.from?.first_name || 'User';
    const username = ctx.from?.username ? `@${ctx.from.username}` : 'Tidak ada username';
    const joinDate = dbUser.joinedAt ? dbUser.joinedAt.toLocaleDateString('id-ID') : 'Tidak diketahui';

    if (panel === 'profile') {
        return `<blockquote><b>👤 Profil Akun Anda</b></blockquote>

🆔 ID Pengguna: <code>${dbUser.telegramId}</code>
👤 Nama: <b>${name}</b>
🔖 Username: <b>${username}</b>
💰 Saldo Tersedia: <b>Rp${dbUser.balance.toLocaleString('id-ID')}</b>
📅 Bergabung: <b>${joinDate}</b>

💡 Topup saldo untuk mulai order nomor virtual.`;
    }

    if (panel === 'history') {
        return `<blockquote><b>🛒 Riwayat Order Anda</b></blockquote>

Untuk melihat riwayat order, gunakan tombol di bawah atau kirim /listtop_user untuk melihat leaderboard.

💡 Tip: Order baru akan muncul di sini secara real-time.`;
    }

    if (panel === 'deposit') {
        return `<blockquote><b>📊 Riwayat Deposit</b></blockquote>

Kelola topup saldo dan lihat history deposit Anda di sini.

💡 Topup via QRIS otomatis masuk dalam 1-2 menit.`;
    }

    if (panel === 'leaderboard') {
        const topUsers = await User.find({ balance: { $gt: 0 } }).sort({ balance: -1 }).limit(5);

        if (topUsers.length === 0) {
            return `<blockquote><b>🏆 Leaderboard Top Saldo</b></blockquote>

Belum ada user dengan saldo.`;
        }

        let text = `<blockquote><b>🏆 Top 5 User Terbanyak Saldo</b></blockquote>\n`;
        topUsers.forEach((u, i) => {
            const badge = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
            const uname = u.username ? `@${u.username}` : u.fullName;
            text += `\n${badge} <b>${uname}</b>\n💰 Rp${u.balance.toLocaleString('id-ID')}\n`;
        });
        return text;
    }

    // Gunakan estimatedDocumentCount() untuk performa instan (O(1)) tanpa perlu memindai seluruh dokumen satu persatu
    const totalUsers = await User.estimatedDocumentCount();

    return `<blockquote><b>🌐 ${USER_CONFIG.BOT_NAME}</b></blockquote>

Halo, <b>${name}</b>! 👋

<b>📱 Layanan Tersedia:</b>
✓ Order Nomor Virtual (OTP Real-Time)
✓ Deposit Saldo Auto
✓ History Order & Deposit
✓ Leaderboard User
✓ Channel & Group Komunitas

<b>Akun Anda:</b>
🆔 ID: <code>${dbUser.telegramId}</code>
💰 Saldo: <b>Rp${dbUser.balance.toLocaleString('id-ID')}</b>
👥 Total User: <b>${totalUsers.toLocaleString('id-ID')} orang</b>

🚀 Pilih menu di bawah untuk memulai:`;
};

const renderUserMenu = async (
    ctx: MyContext,
    panel: 'home' | 'profile' | 'services' | 'history' | 'deposit' | 'leaderboard' = 'home',
    isEdit = false
) => {
    if (!(await ensureUserAuth(ctx))) return;

    const caption = await buildUserCaption(ctx, panel);
    const reply_markup = getUserMenuKeyboard(panel);

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

export const registerMenuHandlers = (bot: Telegraf<MyContext>) => {
    const openMainMenu = async (ctx: MyContext) => {
        try {
            await renderUserMenu(ctx, 'home');
        } catch (error: any) {
            console.error('Start Menu Error:', error.message);
            await ctx.reply('❌ Terjadi kesalahan saat membuka menu.');
        }
    };

    // ==========================================
    // 1. COMMAND /start
    // ==========================================
    bot.start(openMainMenu);
    bot.command('menu', openMainMenu);

    // ==========================================
    // 2. MENU NAVIGATION
    // ==========================================
    bot.action('user_home', async (ctx) => {
        if (!(await ensureUserAuth(ctx))) return;
        await ctx.answerCbQuery();
        await renderUserMenu(ctx, 'home', true);
    });

    bot.action('user_profile', async (ctx) => {
        if (!(await ensureUserAuth(ctx))) return;
        await ctx.answerCbQuery();
        await renderUserMenu(ctx, 'profile', true);
    });

    bot.action('user_history_panel', async (ctx) => {
        if (!(await ensureUserAuth(ctx))) return;
        await ctx.answerCbQuery();
        await renderUserMenu(ctx, 'history', true);
    });

    bot.action('user_history_deposit_panel', async (ctx) => {
        if (!(await ensureUserAuth(ctx))) return;
        await ctx.answerCbQuery();
        await renderUserMenu(ctx, 'deposit', true);
    });

    bot.action('user_leaderboard', async (ctx) => {
        if (!(await ensureUserAuth(ctx))) return;
        await ctx.answerCbQuery();
        await renderUserMenu(ctx, 'leaderboard', true);
    });

    // ==========================================
    // 3. QUICK ACTIONS
    // ==========================================
    bot.action('user_topup_guide', async (ctx) => {
        if (!(await ensureUserAuth(ctx))) return;
        await ctx.answerCbQuery('Klik tombol Topup Saldo untuk cara deposit lengkap.', { show_alert: true });
    });

    bot.action('user_contact', async (ctx) => {
        if (!(await ensureUserAuth(ctx))) return;
        await ctx.answerCbQuery(`Hubungi: ${USER_CONFIG.BOT_OWNER_NAME}`, { show_alert: true });
    });

    bot.action('user_help', async (ctx) => {
        if (!(await ensureUserAuth(ctx))) return;
        await ctx.answerCbQuery('📱 Order: Pilih layanan lalu nomor\n💰 Topup: Via QRIS auto\n📊 History: Lihat semua order Anda', { show_alert: true });
    });

    // ==========================================
    // 4. BACKWARD COMPATIBILITY
    // ==========================================
    bot.action('back_home', async (ctx) => {
        if (!(await ensureUserAuth(ctx))) return;
        await ctx.answerCbQuery();
        await renderUserMenu(ctx, 'home', true);
    });

    bot.action('profile', async (ctx) => {
        if (!(await ensureUserAuth(ctx))) return;
        await ctx.answerCbQuery();
        await renderUserMenu(ctx, 'profile', true);
    });
};
