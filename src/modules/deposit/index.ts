// src/modules/deposit/index.ts
import { Telegraf, Markup } from 'telegraf';
import { MyContext } from '../../middlewares/guard';
import { Deposit } from '../../models/Deposit';
import { User } from '../../models/User';
import { RumahOtpService } from '../../services/RumahOtpService';
import { ChannelService } from '../../services/ChannelService';

export default (bot: Telegraf<MyContext>) => {
    const otpService = new RumahOtpService();
    const channelService = new ChannelService(bot);

    const showTopupWizard = async (ctx: any) => {
        if (ctx.session) ctx.session.awaitingDeposit = false;
        
        const text = `💳 *TOP UP BALANCE*\n\nSilakan pilih nominal deposit yang ingin kamu isi:`;
        const keyboard = {
            inline_keyboard: [
                [
                    { text: 'Rp 5.000', callback_data: 'topup_pilih_5000' },
                    { text: 'Rp 10.000', callback_data: 'topup_pilih_10000' }
                ],
                [
                    { text: 'Rp 20.000', callback_data: 'topup_pilih_20000' },
                    { text: 'Rp 50.000', callback_data: 'topup_pilih_50000' }
                ],
                [
                    { text: '✍️ Input Manual', callback_data: 'topup_manual' }
                ],
                [
                    { text: '⬅️ Batal / Kembali', callback_data: 'user_home' }
                ]
            ]
        };

        if (ctx.callbackQuery) {
            try {
                await ctx.editMessageCaption(text, { parse_mode: 'Markdown', reply_markup: keyboard });
            } catch {
                try {
                    await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: keyboard });
                } catch {
                    await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
                }
            }
        } else {
            await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
        }
    };

    // 1. Tangkap klik tombol "Top Up Saldo"
    bot.action(['topup_nokos', 'user_topup'], async (ctx) => {
        await ctx.answerCbQuery().catch(() => {});
        await showTopupWizard(ctx);
    });

    bot.action(/^topup_pilih_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery().catch(() => {});
        const amount = parseInt(ctx.match[1]);
        
        const text = `⚠️ *KONFIRMASI DEPOSIT*\n\nKamu akan melakukan top up saldo sebesar *Rp ${amount.toLocaleString('id-ID')}*.\nLanjutkan?`;
        const keyboard = {
            inline_keyboard: [
                [
                    { text: '✅ Ya, Lanjutkan', callback_data: `topup_confirm_${amount}` },
                    { text: '❌ Batal', callback_data: 'topup_nokos' }
                ]
            ]
        };
        try {
            await ctx.editMessageCaption(text, { parse_mode: 'Markdown', reply_markup: keyboard });
        } catch {
            await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: keyboard }).catch(() => {});
        }
    });

    bot.action('topup_manual', async (ctx) => {
        await ctx.answerCbQuery().catch(() => {});
        if (ctx.session) ctx.session.awaitingDeposit = true;

        const text = `✍️ *INPUT MANUAL*\n\nSilakan balas pesan ini dengan nominal deposit yang ingin kamu isi.\n\n💡 *Minimal Rp 2.000*\nContoh ketik: \`5000\``;
        const keyboard = {
            inline_keyboard: [[{ text: '⬅️ Kembali', callback_data: 'topup_nokos' }]]
        };
        try {
            await ctx.editMessageCaption(text, { parse_mode: 'Markdown', reply_markup: keyboard });
        } catch {
            await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: keyboard }).catch(() => {});
        }
    });

    // 2. Tangkap pesan teks nominal deposit (Hanya jika session aktif)
    bot.on('text', async (ctx, next) => {
        const dbUser = ctx.dbUser;
        if (!dbUser || !ctx.session?.awaitingDeposit) return next(); // Lanjut ke perintah lain jika bukan sedang deposit

        // Matikan session agar tidak terus-terusan meminta deposit
        ctx.session.awaitingDeposit = false;

        const amount = parseInt(ctx.message.text.trim());
        if (isNaN(amount) || amount < 2000) {
            return ctx.reply('🚫 *Gagal:* Minimal deposit adalah Rp 2.000!\nSilakan klik tombol Top Up lagi.', { parse_mode: 'Markdown' });
        }

        const text = `⚠️ *KONFIRMASI DEPOSIT*\n\nKamu akan melakukan top up saldo sebesar *Rp ${amount.toLocaleString('id-ID')}*.\nLanjutkan?`;
        const keyboard = {
            inline_keyboard: [
                [
                    { text: '✅ Ya, Lanjutkan', callback_data: `topup_confirm_${amount}` },
                    { text: '❌ Ulangi Input', callback_data: 'topup_manual' },
                    { text: '⬅️ Menu Top Up', callback_data: 'topup_nokos' }
                ]
            ]
        };
        await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
    });

    bot.action(/^topup_confirm_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery().catch(() => {});
        const amount = parseInt(ctx.match[1]);
        const dbUser = ctx.dbUser;
        if (!dbUser) return;

        const loadingText = '⏳ Sedang membuat QRIS...';
        try {
            await ctx.editMessageCaption(loadingText);
        } catch {
            await ctx.editMessageText(loadingText).catch(() => {});
        }

        try {
            // Cek apakah user punya deposit pending di database
            const pending = await Deposit.findOne({ user: dbUser._id, status: 'pending' }).lean();
            if (pending) {
                const failText = `⚠️ Kamu masih memiliki deposit yang belum dibayar (ID: \`${pending.depositId}\`).\nSelesaikan atau batalkan terlebih dahulu.`;
                try {
                    await ctx.editMessageCaption(failText, { parse_mode: 'Markdown' });
                } catch {
                    await ctx.editMessageText(failText, { parse_mode: 'Markdown' }).catch(() => {});
                }
                return;
            }

            const untungDeposit = Number(process.env.UNTUNG_DEPOSIT) || 500;
            const totalRequest = amount + untungDeposit; // Total + Fee

            // Tembak API RumahOTP
            const data = await otpService.createDeposit(totalRequest);
            const feeAkhir = data.total - amount;

            // Catat di Database terlebih dahulu
            const newDeposit = await Deposit.create({
                user: dbUser._id,
                depositId: data.id,
                amount: amount,
                fee: feeAkhir,
                total: data.total,
                status: 'pending'
            });

            const caption = `
🏦 *PEMBAYARAN DEPOSIT OTP*
━━━━━━━━━━━━━━━━━━
🧾 *ID:* \`${data.id}\`
💰 *Nominal:* Rp${data.total.toLocaleString('id-ID')}
📥 *Saldo Masuk:* Rp${amount.toLocaleString('id-ID')}

📸 *Scan QRIS di atas untuk membayar!*
⏳ Berlaku selama 5 menit. Pengecekan otomatis sedang berjalan.
`;
            // Hapus pesan lama, kirim QR
            await ctx.deleteMessage().catch(() => {});
            
            const qrMsg = await ctx.replyWithPhoto(
                { url: data.qr_image },
                {
                    caption,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [Markup.button.callback('🔄 Cek Status Deposit', `checkdeposit_${data.id}`)],
                            [Markup.button.callback('❌ Batalkan', `bataldepo_${data.id}`)]
                        ]
                    }
                }
            );

            // Simpan message id QR agar bisa dihapus oleh sistem Cron otomatis
            newDeposit.qrMessageId = qrMsg.message_id;
            await newDeposit.save();

        } catch (error: any) {
            try {
                await ctx.editMessageCaption(`❌ Gagal: ${error.message}`);
            } catch {
                await ctx.editMessageText(`❌ Gagal: ${error.message}`).catch(() => {});
            }
        }
    });

    // 3. Batalkan Deposit Manual
    bot.action(/^bataldepo_(.+)$/, async (ctx) => {
        const depositId = ctx.match[1];
        try {
            await ctx.editMessageCaption('⏳ *Membatalkan deposit...*', { parse_mode: 'Markdown' });
            
            await otpService.cancelDeposit(depositId);
            await Deposit.findOneAndUpdate({ depositId }, { status: 'canceled' });

            await ctx.editMessageCaption(`❌ Deposit \`${depositId}\` berhasil dibatalkan.`, { parse_mode: 'Markdown' });
        } catch (error: any) {
            await ctx.answerCbQuery(`Gagal membatalkan: ${error.message}`, { show_alert: true });
        }
    });

    // 4. Cek Status Deposit Manual (untuk percepat update tanpa menunggu long polling)
    bot.action(/^checkdeposit_(.+)$/, async (ctx) => {
        const depositId = ctx.match[1];
        const dbUser = ctx.dbUser;
        if (!dbUser) return;

        await ctx.answerCbQuery('🔍 Mengecek status deposit...').catch(() => {});

        try {
            const deposit = await Deposit.findOne({
                depositId,
                user: dbUser._id,
                status: 'pending'
            });

            if (!deposit) {
                await ctx.answerCbQuery('Deposit tidak ditemukan atau sudah diproses.', { show_alert: true });
                return;
            }

            const statusData = await otpService.checkDepositStatus(depositId);
            if (statusData.status !== 'success') {
                await ctx.answerCbQuery('Belum masuk. Silakan cek lagi beberapa detik.', { show_alert: true });
                return;
            }

            const updatedDeposit = await Deposit.findOneAndUpdate(
                { depositId, user: dbUser._id, status: 'pending' },
                { status: 'success' },
                { returnDocument: 'after' }
            );

            if (!updatedDeposit) {
                await ctx.answerCbQuery('Deposit sudah diproses oleh sistem.', { show_alert: true });
                return;
            }

            const userToUpdate = await User.findByIdAndUpdate(
                dbUser._id,
                { $inc: { balance: updatedDeposit.amount } },
                { returnDocument: 'after' }
            );

            if (!userToUpdate) {
                await ctx.answerCbQuery('User tidak ditemukan saat update saldo.', { show_alert: true });
                return;
            }

            if (!updatedDeposit.channelSentAt) {
                await channelService.sendDepositTesti({
                    user: {
                        telegramId: userToUpdate.telegramId,
                        fullName: userToUpdate.fullName,
                        username: userToUpdate.username
                    },
                    depositId: updatedDeposit.depositId,
                    nominal: updatedDeposit.amount,
                    fee: updatedDeposit.fee,
                    received: updatedDeposit.amount,
                    balanceAfter: userToUpdate.balance,
                    total: updatedDeposit.total,
                    method: 'QRIS',
                    createdAt: new Date()
                }).catch(() => {});

                updatedDeposit.channelSentAt = new Date();
                await updatedDeposit.save();
            }

            if (process.env.OWNER_ID) {
                bot.telegram.sendMessage(
                    process.env.OWNER_ID,
                    `💰 *Deposit Masuk!*\nUser: ${userToUpdate.fullName}\nNominal: Rp${updatedDeposit.amount.toLocaleString('id-ID')}`,
                    { parse_mode: 'Markdown' }
                ).catch(() => {});
            }

            await ctx.editMessageCaption(
                `✅ *DEPOSIT BERHASIL!*\n\nID: \`${updatedDeposit.depositId}\`\nSaldo Masuk: *Rp${updatedDeposit.amount.toLocaleString('id-ID')}*\n💰 Saldo Sekarang: *Rp${userToUpdate.balance.toLocaleString('id-ID')}*`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [] }
                }
            );
        } catch (error: any) {
            await ctx.answerCbQuery(`Gagal cek status: ${error.message}`, { show_alert: true });
        }
    });
};