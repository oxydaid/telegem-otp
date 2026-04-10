// src/modules/admin/handlers/historyHandler.ts
// ==========================================
// 🧾 TRANSACTION HISTORY HANDLER
// ==========================================

import { Telegraf } from 'telegraf';
import { MyContext } from '../../../middlewares/guard';
import { Transaction } from '../../../models/Transaction';
import { Deposit } from '../../../models/Deposit';
import { PAGINATION_CONFIG } from '../utils/constants';
import { getMenuImage, safeAnswerCbQuery, ensureOwnerAction, makePaginationButtons } from '../utils/helpers';
import { formatUserLabel, formatCurrency, formatTimestamp, formatStatusLabel } from '../utils/formatters';

/**
 * Render history menu intro
 */
const renderOwnerHistoryMenu = async (ctx: MyContext, isEdit = true) => {
    const caption = `<blockquote><b>🧾 Riwayat Transaksi Admin</b></blockquote>
Pilih kategori riwayat yang ingin ditampilkan:

1. OTP / Nokos / Layanan
2. Deposit

Gunakan pagination untuk melihat data lama.`;

    const reply_markup = {
        inline_keyboard: [
            [{ text: '📲 Riwayat Layanan', callback_data: 'owner_tx_service_1' }],
            [{ text: '💳 Riwayat Deposit', callback_data: 'owner_tx_deposit_1' }],
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
 * Render service transactions
 */
const renderServiceTransactions = async (ctx: MyContext, page: number) => {
    const totalTransactions = await Transaction.countDocuments();

    if (totalTransactions === 0) {
        await ctx.editMessageCaption('📭 *Belum ada transaksi layanan yang tercatat.*', {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '⬅️ Kembali', callback_data: 'owner_history_menu' }],
                    [{ text: '🏠 Admin Menu', callback_data: 'owner_home' }]
                ]
            }
        });
        return;
    }

    const totalPages = Math.max(1, Math.ceil(totalTransactions / PAGINATION_CONFIG.ADMIN_HISTORY_PER_PAGE));
    const safePage = Math.min(Math.max(page, 1), totalPages);
    const rows = await Transaction.find({})
        .populate('user', 'telegramId username fullName')
        .sort({ createdAt: -1 })
        .skip((safePage - 1) * PAGINATION_CONFIG.ADMIN_HISTORY_PER_PAGE)
        .limit(PAGINATION_CONFIG.ADMIN_HISTORY_PER_PAGE);

    let caption = `🧾 *Riwayat Transaksi Layanan*\n📄 Halaman ${safePage}/${totalPages}\n📦 Total Data: *${totalTransactions}*\n\n`;

    rows.forEach((trx, index) => {
        const userLabel = formatUserLabel(trx.user);
        const otpText = trx.otpCode ? `\`${trx.otpCode}\`` : 'Belum ada OTP';

        caption += `*${(safePage - 1) * PAGINATION_CONFIG.ADMIN_HISTORY_PER_PAGE + index + 1}. ${trx.serviceName}*\n`;
        caption += `🌍 Negara: ${trx.countryName}\n`;
        caption += `📞 Nomor: \`${trx.phoneNumber}\`\n`;
        caption += `🆔 Order: \`${trx.orderId}\`\n`;
        caption += `💰 Harga: ${formatCurrency(trx.price)}\n`;
        caption += `🚥 Status: ${formatStatusLabel(trx.status)}\n`;
        caption += `🗓️ Waktu: ${formatTimestamp(trx.createdAt)} WIB\n`;
        caption += `👤 User: ${userLabel}\n`;
        caption += `🔐 OTP: ${otpText}\n`;
        caption += `━━━━━━━━━━━━━━━━━━\n`;
    });

    const keyboard = [
        makePaginationButtons('owner_tx_service', safePage, totalPages),
        [{ text: '⬅️ Kembali', callback_data: 'owner_history_menu' }],
        [{ text: '🏠 Admin Menu', callback_data: 'owner_home' }]
    ];

    await ctx.editMessageCaption(caption, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard }
    });
};

/**
 * Render deposit transactions
 */
const renderDepositTransactions = async (ctx: MyContext, page: number) => {
    const totalDeposits = await Deposit.countDocuments();

    if (totalDeposits === 0) {
        await ctx.editMessageCaption('📭 *Belum ada transaksi deposit yang tercatat.*', {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '⬅️ Kembali', callback_data: 'owner_history_menu' }],
                    [{ text: '🏠 Admin Menu', callback_data: 'owner_home' }]
                ]
            }
        });
        return;
    }

    const totalPages = Math.max(1, Math.ceil(totalDeposits / PAGINATION_CONFIG.ADMIN_HISTORY_PER_PAGE));
    const safePage = Math.min(Math.max(page, 1), totalPages);
    const rows = await Deposit.find({})
        .populate('user', 'telegramId username fullName')
        .sort({ createdAt: -1 })
        .skip((safePage - 1) * PAGINATION_CONFIG.ADMIN_HISTORY_PER_PAGE)
        .limit(PAGINATION_CONFIG.ADMIN_HISTORY_PER_PAGE);

    let caption = `💳 *Riwayat Transaksi Deposit*\n📄 Halaman ${safePage}/${totalPages}\n📦 Total Data: *${totalDeposits}*\n\n`;

    rows.forEach((depo, index) => {
        const userLabel = formatUserLabel(depo.user);

        caption += `*${(safePage - 1) * PAGINATION_CONFIG.ADMIN_HISTORY_PER_PAGE + index + 1}. Deposit ${depo.depositId}*\n`;
        caption += `🆔 ID Deposit: \`${depo.depositId}\`\n`;
        caption += `📥 Nominal Masuk: ${formatCurrency(depo.amount)}\n`;
        caption += `🧾 Fee: ${formatCurrency(depo.fee)}\n`;
        caption += `💰 Total Bayar: ${formatCurrency(depo.total)}\n`;
        caption += `🚥 Status: ${formatStatusLabel(depo.status)}\n`;
        caption += `🗓️ Waktu: ${formatTimestamp(depo.createdAt)} WIB\n`;
        caption += `👤 User: ${userLabel}\n`;
        caption += `━━━━━━━━━━━━━━━━━━\n`;
    });

    const keyboard = [
        makePaginationButtons('owner_tx_deposit', safePage, totalPages),
        [{ text: '⬅️ Kembali', callback_data: 'owner_history_menu' }],
        [{ text: '🏠 Admin Menu', callback_data: 'owner_home' }]
    ];

    await ctx.editMessageCaption(caption, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard }
    });
};

/**
 * Register history handler actions
 */
export const registerHistoryHandlers = (bot: Telegraf<MyContext>) => {
    bot.action('owner_history_menu', async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;
        await safeAnswerCbQuery(ctx);
        await renderOwnerHistoryMenu(ctx, true);
    });

    bot.action(/^owner_tx_service_(\d+)$/, async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;

        const page = Number(ctx.match[1] || 1);
        await safeAnswerCbQuery(ctx);

        try {
            await renderServiceTransactions(ctx, page);
        } catch (error: any) {
            await ctx.editMessageCaption(`❌ *Gagal memuat riwayat layanan:* ${error.message}`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '⬅️ Kembali', callback_data: 'owner_history_menu' }],
                        [{ text: '🏠 Admin Menu', callback_data: 'owner_home' }]
                    ]
                }
            });
        }
    });

    bot.action(/^owner_tx_deposit_(\d+)$/, async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;

        const page = Number(ctx.match[1] || 1);
        await safeAnswerCbQuery(ctx);

        try {
            await renderDepositTransactions(ctx, page);
        } catch (error: any) {
            await ctx.editMessageCaption(`❌ *Gagal memuat riwayat deposit:* ${error.message}`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '⬅️ Kembali', callback_data: 'owner_history_menu' }],
                        [{ text: '🏠 Admin Menu', callback_data: 'owner_home' }]
                    ]
                }
            });
        }
    });
};
