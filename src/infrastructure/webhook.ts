import express from 'express';
import bodyParser from 'body-parser';
import { Telegraf } from 'telegraf';
import { Deposit } from '../models/Deposit';
import { Transaction } from '../models/Transaction';
import { User, IUser } from '../models/User';
import { ChannelService } from '../services/ChannelService';

export const startWebhookServer = (bot: Telegraf<any>) => {
    const app = express();
    const port = process.env.WEBHOOK_PORT || 3000;
    const channelService = new ChannelService(bot);

    // Telegraf Webhook handler (must be placed before body-parser if Telegraf processes raw requests, but webhookCallback handles it)
    app.use(bot.webhookCallback('/telegraf'));

    app.use(bodyParser.json());

    // Endpoint sederhana untuk test webhook dari server eksternal.
    // Selalu return HTTP 200 agar mudah validasi endpoint aktif.
    app.all('/webhook/rumahotp/test', (req, res) => {
        try {
            return res.status(200).json({
                success: true,
                message: 'Webhook test endpoint reachable',
                method: req.method,
                timestamp: new Date().toISOString()
            });
        } catch {
            return res.status(200).json({
                success: false,
                message: 'Webhook test endpoint error'
            });
        }
    });

    app.post('/webhook/rumahotp', async (req, res) => {
        try {
            // Validasi sesuai dokumentasi RumahOTP: gunakan header x-requested-id.
            const requestedId = String(req.headers['x-requested-id'] || '').trim();
            if (!requestedId) {
                return res.status(200).json({ success: false, message: 'Missing x-requested-id header' });
            }

            // Opsional: jika ingin lock ke satu requested-id tertentu, isi env berikut.
            const expectedRequestedId = process.env.RUMAHOTP_REQUESTED_ID;
            if (expectedRequestedId && requestedId !== expectedRequestedId) {
                return res.status(200).json({ success: false, message: 'Invalid x-requested-id header' });
            }

            const body = req.body;
            
            // Server wajib merespon HTTP 200
            // 🟢 Tangani Event OTP SUCCESS (Number)
            if (body.category === 'callback.number') {
                const orderId = body.id;
                const code = body.code;
                const text = body.text;

                const transaction = await Transaction.findOne({ orderId }).populate<{ user: IUser }>('user');
                if (transaction && transaction.status === 'pending') {
                    const price = transaction.price;
                    
                    const updatedTransaction = await Transaction.findOneAndUpdate(
                        { orderId, status: 'pending' }, 
                        { status: 'success', otpCode: code },
                        { returnDocument: 'after' }
                    );

                    const dbUser = transaction.user;
                    if (updatedTransaction && !updatedTransaction.channelSentAt && dbUser) {
                        try {
                            await channelService.sendOtpTesti({
                                user: {
                                    telegramId: dbUser.telegramId,
                                    fullName: dbUser.fullName,
                                    username: dbUser.username
                                },
                                serviceName: transaction.serviceName,
                                countryName: transaction.countryName,
                                operatorName: 'any',
                                orderId: orderId,
                                phoneNumber: transaction.phoneNumber,
                                otpCode: code,
                                price: price,
                                createdAt: updatedTransaction.createdAt || new Date()
                            });
                            await Transaction.updateOne({ orderId }, { $set: { channelSentAt: new Date() } });
                        } catch (err) {
                            console.error('Failed to send OTP testi:', err);
                        }
                        
                        // Notifikasi otomatis ke User
                        const successCaption = `
🎉 *OTP BERHASIL DITERIMA DARI WEBHOOK!* 🎉

📱 *Layanan:* ${transaction.serviceName}
📞 *Nomor:* \`${transaction.phoneNumber}\`
🔐 *Kode OTP:* \`${code}\`
💬 *SMS text:* \`${text}\`

✅ Transaksi Selesai dan dicatat di Riwayat.`;

                        bot.telegram.sendMessage(dbUser.telegramId, successCaption, { parse_mode: 'Markdown' }).catch(() => {});
                    }
                }
                return res.status(200).json({ success: true });
            }

            // Tangani Event Deposit
            if (body.category === 'callback.deposit') {
                const depositId = body.id;
                
                const deposit = await Deposit.findOne({ depositId }).populate<{ user: IUser }>('user');
                if (deposit && deposit.status === 'pending') {
                    deposit.status = 'success';
                    await deposit.save();
                    
                    const dbUser = deposit.user;
                    if (dbUser) {
                        const userToUpdate = await User.findByIdAndUpdate(
                            dbUser._id,
                            { $inc: { balance: deposit.amount } },
                            { returnDocument: 'after' }
                        );

                        if (deposit.qrMessageId) {
                            bot.telegram.deleteMessage(dbUser.telegramId, deposit.qrMessageId).catch(() => {});
                        }

                        bot.telegram.sendMessage(
                            dbUser.telegramId,
                            `✅ *DEPOSIT BERHASIL DITERIMA (WEBHOOK)!*\n\nID: \`${deposit.depositId}\`\nSaldo Masuk: *Rp${deposit.amount.toLocaleString('id-ID')}*\n💰 Saldo Sekarang: *Rp${userToUpdate?.balance.toLocaleString('id-ID')}*`,
                            { parse_mode: 'Markdown' }
                        ).catch(() => {});

                        if (!deposit.channelSentAt) {
                            try {
                                await channelService.sendDepositTesti({
                                    user: {
                                        telegramId: dbUser.telegramId,
                                        fullName: dbUser.fullName,
                                        username: dbUser.username
                                    },
                                    depositId: deposit.depositId,
                                    nominal: deposit.amount,
                                    fee: deposit.fee,
                                    received: deposit.amount,
                                    balanceAfter: userToUpdate?.balance || 0,
                                    total: deposit.total,
                                    method: body.brand?.name || 'QRIS',
                                    createdAt: new Date()
                                });
                                deposit.channelSentAt = new Date();
                                await deposit.save();
                            } catch (err) {
                                console.error('Failed to send Deposit testi:', err);
                            }
                        }

                        if (process.env.OWNER_ID) {
                            bot.telegram.sendMessage(
                                process.env.OWNER_ID,
                                `💰 *Deposit Masuk (Webhook)!*\nUser: ${dbUser.fullName}\nNominal: Rp${deposit.amount.toLocaleString('id-ID')}`,
                                { parse_mode: 'Markdown' }
                            ).catch(() => {});
                        }
                    }
                }
                return res.status(200).json({ success: true });
            }

            // 🔴 Tangani Event Order Cancel/Failed (dari API timeout 20 menit atau error)
            if (body.category === 'callback.order_cancel' || body.category === 'callback.order_failed') {
                const orderId = body.id;
                // Claim transaksi canceled secara atomic dulu untuk mencegah double refund.
                const claimedTransaction = await Transaction.findOneAndUpdate(
                    { orderId, status: 'pending', refundedAt: null },
                    {
                        status: 'canceled',
                        refundedAt: new Date(),
                        refundedBy: 'api'
                    },
                    { returnDocument: 'after' }
                );

                if (claimedTransaction) {
                    const dbUser = await User.findByIdAndUpdate(
                        claimedTransaction.user,
                        { $inc: { balance: claimedTransaction.price } },
                        { returnDocument: 'after' }
                    );

                    if (dbUser) {

                    // Notifikasi ke User
                        bot.telegram.sendMessage(
                            dbUser.telegramId,
                            `⚠️ *PESANAN OTOMATIS DIBATALKAN*\n\n🆔 Order ID: \`${orderId}\`\n📌 Alasan: OTP tidak terkirim dalam 20 menit\n\n💸 *Refund:* Rp${claimedTransaction.price.toLocaleString('id-ID')}\n💰 *Saldo Terbaru:* Rp${dbUser.balance.toLocaleString('id-ID')}`,
                            { parse_mode: 'Markdown' }
                        ).catch(() => {});

                    // Notifikasi ke Owner
                        if (process.env.OWNER_ID) {
                            bot.telegram.sendMessage(
                                process.env.OWNER_ID,
                                `⚠️ *Auto-Refund Order Timeout*\nUser: ${dbUser.fullName}\nOrder ID: ${orderId}\nRefund: Rp${claimedTransaction.price.toLocaleString('id-ID')}`,
                                { parse_mode: 'Markdown' }
                            ).catch(() => {});
                        }
                    }

                    console.log(`✅ Order ${orderId} automatically refunded due to timeout`);
                }
                return res.status(200).json({ success: true });
            }
            
            // Jawab 200 OK ke kategori yang mungkin tidak terhandle agar tidak retry
            res.status(200).json({ success: true, message: 'Event ignored' });

        } catch (error) {
            console.error('Webhook Error:', error);
            // Tetap berikan status 200 supaya RumahOTP tidak melakukan banned/retry tanpa henti
            res.status(200).json({ success: false, message: 'Error processing webhook' });
        }
    });

    app.listen(port, () => {
        console.log(`🌐 Webhook server berjalan di port ${port}`);
    });
};
