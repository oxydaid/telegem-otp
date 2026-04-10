// src/modules/leaderboard/index.ts
import { Telegraf, Markup } from 'telegraf';
import { MyContext } from '../../middlewares/guard';
import { User } from '../../models/User';
import { Transaction } from '../../models/Transaction';
import { Deposit } from '../../models/Deposit';

export default (bot: Telegraf<MyContext>) => {

    // ==========================================
    // 1. MENU UTAMA TOP USER
    // ==========================================
    bot.action('listtop_user', async (ctx) => {
        const caption = "🏆 *LIST TOP USER*\n\nSilakan pilih kategori di bawah ini untuk melihat peringkat pengguna:";
        
        await ctx.editMessageCaption(caption, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [Markup.button.callback('🛒 Top Order', 'top_order')],
                    [Markup.button.callback('💰 Top Deposit', 'top_depo')],
                    [Markup.button.callback('💳 Top Saldo', 'top_saldo')],
                    [Markup.button.callback('⬅️ Kembali', 'back_home')]
                ]
            }
        }).catch(() => {});
    });

    // ==========================================
    // 2. TOP SALDO
    // ==========================================
    bot.action('top_saldo', async (ctx) => {
        try {
            await ctx.answerCbQuery('Memuat Top Saldo...');
            
            // Pencarian efisien: Ambil 10 user dengan saldo tertinggi
            const topUsers = await User.find({ balance: { $gt: 0 } })
                .sort({ balance: -1 })
                .limit(10);

            let text = `💳 *TOP 10 USER SALDO TERBANYAK*\n\n`;
            if (topUsers.length === 0) text += `_Belum ada data._`;

            topUsers.forEach((u, i) => {
                const name = u.username ? `@${u.username}` : u.fullName;
                text += `*${i + 1}.* [${name}](tg://user?id=${u.telegramId})\n`;
                text += `🆔 ID: \`${u.telegramId}\`\n💰 Saldo: *Rp${u.balance.toLocaleString('id-ID')}*\n\n`;
            });

            await ctx.editMessageCaption(text, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[Markup.button.callback('⬅️ Kembali', 'listtop_user')]] }
            });
        } catch (err) {
            await ctx.answerCbQuery('❌ Gagal memuat data.', { show_alert: true });
        }
    });

    // ==========================================
    // 3. TOP DEPOSIT (Menggunakan MongoDB Aggregation)
    // ==========================================
    bot.action('top_depo', async (ctx) => {
        try {
            await ctx.answerCbQuery('Memuat Top Deposit...');
            
            // Aggregation: Gabungkan Deposit sukses, jumlahkan, urutkan, dan gabungkan dengan tabel User
            const topDepo = await Deposit.aggregate([
                { $match: { status: 'success' } },
                { $group: { _id: '$user', totalDepo: { $sum: '$amount' } } },
                { $sort: { totalDepo: -1 } },
                { $limit: 10 },
                { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'userInfo' } },
                { $unwind: '$userInfo' }
            ]);

            let text = `💰 *TOP 10 USER DEPOSIT TERBANYAK*\n\n`;
            if (topDepo.length === 0) text += `_Belum ada data._`;

            topDepo.forEach((d, i) => {
                const u = d.userInfo;
                const name = u.username ? `@${u.username}` : u.fullName;
                text += `*${i + 1}.* [${name}](tg://user?id=${u.telegramId})\n`;
                text += `🆔 ID: \`${u.telegramId}\`\n💵 Total Deposit: *Rp${d.totalDepo.toLocaleString('id-ID')}*\n\n`;
            });

            await ctx.editMessageCaption(text, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[Markup.button.callback('⬅️ Kembali', 'listtop_user')]] }
            });
        } catch (err) {
            await ctx.answerCbQuery('❌ Gagal memuat data.', { show_alert: true });
        }
    });

    // ==========================================
    // 4. TOP ORDER (Menggunakan MongoDB Aggregation)
    // ==========================================
    bot.action('top_order', async (ctx) => {
        try {
            await ctx.answerCbQuery('Memuat Top Order...');
            
            // Aggregation: Hitung berapa kali user transaksi sukses
            const topOrder = await Transaction.aggregate([
                { $match: { status: 'success' } },
                { $group: { _id: '$user', totalOrder: { $sum: 1 } } },
                { $sort: { totalOrder: -1 } },
                { $limit: 10 },
                { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'userInfo' } },
                { $unwind: '$userInfo' }
            ]);

            let text = `🛒 *TOP 10 USER ORDER TERBANYAK*\n\n`;
            if (topOrder.length === 0) text += `_Belum ada data._`;

            topOrder.forEach((o, i) => {
                const u = o.userInfo;
                const name = u.username ? `@${u.username}` : u.fullName;
                text += `*${i + 1}.* [${name}](tg://user?id=${u.telegramId})\n`;
                text += `🆔 ID: \`${u.telegramId}\`\n🛍️ Total Order: *${o.totalOrder}x*\n\n`;
            });

            await ctx.editMessageCaption(text, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[Markup.button.callback('⬅️ Kembali', 'listtop_user')]] }
            });
        } catch (err) {
            await ctx.answerCbQuery('❌ Gagal memuat data.', { show_alert: true });
        }
    });

};