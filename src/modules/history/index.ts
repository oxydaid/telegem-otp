// src/modules/history/index.ts
import { Telegraf, Markup } from 'telegraf';
import { MyContext } from '../../middlewares/guard';
import { Transaction } from '../../models/Transaction';

// Fungsi bantuan untuk membuat tombol navigasi riwayat
const makePaginationButtons = (prefix: string, currentPage: number, totalPages: number) => {
    const buttons = [];
    if (currentPage > 1) {
        buttons.push(Markup.button.callback('⬅️ Prev', `${prefix}_${currentPage - 1}`));
    }
    buttons.push(Markup.button.callback(`📖 Hal ${currentPage}/${totalPages}`, 'noop'));
    if (currentPage < totalPages) {
        buttons.push(Markup.button.callback('Next ➡️', `${prefix}_${currentPage + 1}`));
    }
    return buttons;
};

export default (bot: Telegraf<MyContext>) => {
    const PER_PAGE = 5; // Kita batasi 5 riwayat per halaman agar pesan tidak terlalu panjang

    bot.action(['history_orderbot', /^history_p_(\d+)$/], async (ctx) => {
        const dbUser = ctx.dbUser;
        if (!dbUser) return;

        try {
            // Deteksi apakah ini klik dari menu awal atau navigasi halaman
            const isPaging = ctx.match && ctx.match[0].startsWith('history_p_');
            const page = isPaging ? parseInt(ctx.match[1]) : 1;

            if (!isPaging) {
                await ctx.editMessageCaption('⏳ *Memuat riwayat transaksi Anda...*', { parse_mode: 'Markdown' });
            }

            // Hitung total transaksi milik user ini
            const totalTransactions = await Transaction.countDocuments({ user: dbUser._id });

            if (totalTransactions === 0) {
                return ctx.editMessageCaption('📭 *Anda belum pernah melakukan order apapun.*', {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[Markup.button.callback('🏠 Menu Utama', 'back_home')]] }
                });
            }

            const totalPages = Math.ceil(totalTransactions / PER_PAGE);

            // Ambil data dari MongoDB (Teroptimasi dengan limit & skip, diurutkan dari yang terbaru)
            const transactions = await Transaction.find({ user: dbUser._id })
                .sort({ createdAt: -1 })
                .skip((page - 1) * PER_PAGE)
                .limit(PER_PAGE);

            // Susun teks riwayat
            let caption = `🧾 *Riwayat Order Kamu*\n📄 Halaman ${page} dari ${totalPages}\n\n`;

            transactions.forEach((trx, index) => {
                // Tentukan emoji berdasarkan status
                let statusEmoji = '⏳';
                if (trx.status === 'success') statusEmoji = '✅';
                if (trx.status === 'canceled') statusEmoji = '❌';

                // Format tanggal ke waktu Indonesia
                const tanggal = trx.createdAt.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

                caption += `*${(page - 1) * PER_PAGE + index + 1}. ${trx.serviceName}* — ${trx.countryName}\n`;
                caption += `📞 *Nomor:* \`${trx.phoneNumber}\`\n`;
                caption += `💬 *OTP:* ${trx.otpCode ? `\`${trx.otpCode}\`` : "Belum ada"}\n`;
                caption += `💰 *Harga:* Rp${trx.price.toLocaleString('id-ID')}\n`;
                caption += `🆔 *Order ID:* \`${trx.orderId}\`\n`;
                caption += `🗓️ *Tanggal:* ${tanggal}\n`;
                caption += `🚥 *Status:* ${statusEmoji} ${trx.status.toUpperCase()}\n`;
                caption += `━━━━━━━━━━━━━━━━━━\n`;
            });

            // Buat tombol navigasi
            const keyboard = [
                makePaginationButtons('history_p', page, totalPages),
                [Markup.button.callback('🏠 Menu Utama', 'back_home')]
            ];

            await ctx.editMessageCaption(caption, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });

        } catch (error: any) {
            console.error('History Error:', error.message);
            await ctx.editMessageCaption('❌ *Terjadi kesalahan saat memuat riwayat.*', {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[Markup.button.callback('🏠 Menu Utama', 'back_home')]] }
            });
        }
    });
};