// src/modules/deposit/index.ts
import { Telegraf, Markup } from 'telegraf';
import { MyContext } from '../../middlewares/guard';
import { Deposit } from '../../models/Deposit';
import { RumahOtpService } from '../../services/RumahOtpService';
import { ChannelService } from '../../services/ChannelService';

export default (bot: Telegraf<MyContext>) => {
    const otpService = new RumahOtpService();
    const channelService = new ChannelService(bot);

    // 1. Tangkap klik tombol "Top Up Saldo"
    bot.action('topup_nokos', async (ctx) => {
        // Nyalakan state session bahwa user ini sedang ditunggu input angkanya
        if (ctx.session) ctx.session.awaitingDeposit = true;

        await ctx.editMessageCaption(
            `💳 *TOP UP BALANCE*\n\nSilakan balas pesan ini dengan nominal deposit yang ingin kamu isi.\n\n💡 *Minimal Rp 2.000*\nContoh ketik: \`5000\``, 
            { parse_mode: 'Markdown' }
        ).catch(() => {});
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

        const loadingMsg = await ctx.reply('⏳ Sedang membuat QRIS...');

        try {
            // Cek apakah user punya deposit pending di database
            const pending = await Deposit.findOne({ user: dbUser._id, status: 'pending' });
            if (pending) {
                return ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, `⚠️ Kamu masih memiliki deposit yang belum dibayar (ID: \`${pending.depositId}\`).\nSelesaikan atau batalkan terlebih dahulu.`, { parse_mode: 'Markdown' });
            }

            const untungDeposit = Number(process.env.UNTUNG_DEPOSIT) || 500;
            const totalRequest = amount + untungDeposit; // Total + Fee

            // Tembak API RumahOTP
            const data = await otpService.createDeposit(totalRequest);
            const feeAkhir = data.total - amount;

            // Catat di Database
            await Deposit.create({
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
            // Hapus pesan loading, kirim QR
            await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id).catch(() => {});
            const qrMsg = await ctx.replyWithPhoto(
                { url: data.qr_image },
                {
                    caption,
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[Markup.button.callback('❌ Batalkan', `bataldepo_${data.id}`)]] }
                }
            );

            // ==========================================
            // AUTO-CHECKER LOOP (Cek tiap 5 detik selama 5 menit)
            // ==========================================
            let checks = 0;
            const maxChecks = 60; // 5 detik x 60 = 300 detik (5 menit)
            
            const checkInterval = setInterval(async () => {
                checks++;
                try {
                    // Cek status di Database (siapa tahu sudah dibatalkan manual)
                    const currentDepo = await Deposit.findOne({ depositId: data.id });
                    if (!currentDepo || currentDepo.status !== 'pending') {
                        clearInterval(checkInterval);
                        return;
                    }

                    // Cek status ke API
                    const statusData = await otpService.checkDepositStatus(data.id);
                    
                    if (statusData.status === 'success') {
                        clearInterval(checkInterval);
                        
                        // Update DB Deposit
                        currentDepo.status = 'success';
                        await currentDepo.save();

                        // Tambah Saldo User
                        dbUser.balance += amount;
                        await dbUser.save();

                        // Notif Sukses & Hapus QRIS
                        await ctx.telegram.deleteMessage(ctx.chat.id, qrMsg.message_id).catch(() => {});
                        await ctx.reply(`✅ *DEPOSIT BERHASIL!*\n\nID: \`${data.id}\`\nSaldo Masuk: *Rp${amount.toLocaleString('id-ID')}*\n💰 Saldo Sekarang: *Rp${dbUser.balance.toLocaleString('id-ID')}*`, { parse_mode: 'Markdown' });

                        if (!currentDepo.channelSentAt) {
                            await channelService.sendDepositTesti({
                                user: {
                                    telegramId: dbUser.telegramId,
                                    fullName: dbUser.fullName,
                                    username: dbUser.username
                                },
                                depositId: data.id,
                                nominal: amount,
                                fee: feeAkhir,
                                received: amount,
                                balanceAfter: dbUser.balance,
                                total: data.total,
                                method: 'QRIS',
                                createdAt: new Date()
                            }).catch(() => {});

                            currentDepo.channelSentAt = new Date();
                            await currentDepo.save();
                        }

                        // Notif ke Admin (Opsional)
                        bot.telegram.sendMessage(process.env.OWNER_ID!, `💰 *Deposit Masuk!*\nUser: ${dbUser.fullName}\nNominal: Rp${amount.toLocaleString('id-ID')}`, { parse_mode: 'Markdown' }).catch(() => {});
                    }

                    // Jika waktu habis (5 menit berlalu)
                    if (checks >= maxChecks && statusData.status === 'pending') {
                        clearInterval(checkInterval);
                        await otpService.cancelDeposit(data.id); // Cancel di API
                        currentDepo.status = 'canceled';
                        await currentDepo.save();

                        await ctx.telegram.deleteMessage(ctx.chat.id, qrMsg.message_id).catch(() => {});
                        await ctx.reply(`⌛ Waktu habis. Deposit \`${data.id}\` dibatalkan otomatis.`, { parse_mode: 'Markdown' });
                    }
                } catch (err) {
                    console.log('Error AutoCheck:', err);
                }
            }, 5000);

        } catch (error: any) {
            await ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, `❌ Gagal: ${error.message}`);
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
};