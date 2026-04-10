import { Telegraf } from 'telegraf';
import { Deposit } from '../models/Deposit';
import { User, IUser } from '../models/User';
import { RumahOtpService } from './RumahOtpService';
import { ChannelService } from './ChannelService';

export class DepositChecker {
    private bot: Telegraf<any>;
    private otpService: RumahOtpService;
    private channelService: ChannelService;
    private isRunning: boolean = false;

    constructor(bot: Telegraf<any>) {
        this.bot = bot;
        this.otpService = new RumahOtpService();
        this.channelService = new ChannelService(bot);
    }

    start() {
        // Berjalan secara global setiap 10 detik
        setInterval(() => this.checkPendingDeposits(), 10000);
        console.log('✅ Global Deposit Checker Service berjalan...');
    }

    private async checkPendingDeposits() {
        // Cegah overlapping eksekusi jika proses sebelumnya belum selesai
        if (this.isRunning) return; 
        this.isRunning = true;

        try {
            // Ambil semua deposit berstatus pending beserta data User-nya
            const pendings = await Deposit.find({ status: 'pending' }).populate<{ user: IUser }>('user');

            // Proses secara asinkron agar lebih cepat
            await Promise.all(pendings.map(async (deposit) => {
                const now = new Date();
                const diffTime = now.getTime() - deposit.createdAt.getTime();
                
                // Jika sudah > 5 Menit sejak dibuat, batalkan (Timeout)
                if (diffTime > 5 * 60 * 1000) {
                    // Jika sudah di-cancel sebelumnya, skip
                    if (deposit.cancelledAt) {
                        return;
                    }

                    await this.otpService.cancelDeposit(deposit.depositId).catch(() => {});
                    deposit.status = 'canceled';
                    deposit.cancelledAt = new Date();
                    await deposit.save();

                    if (deposit.user?.telegramId) {
                        // Hapus QR jika kita menyimpannya
                        if (deposit.qrMessageId) {
                            this.bot.telegram.deleteMessage(deposit.user.telegramId, deposit.qrMessageId).catch(() => {});
                        }
                        // Notifikasi kedaluwarsa
                        this.bot.telegram.sendMessage(
                            deposit.user.telegramId, 
                            `⌛ Waktu habis. Deposit \`${deposit.depositId}\` dibatalkan otomatis.`, 
                            { parse_mode: 'Markdown' }
                        ).catch(() => {});
                    }
                    return;
                }

                // Jika belum 5 menit, cek statusnya ke API
                try {
                    const statusData = await this.otpService.checkDepositStatus(deposit.depositId);
                    
                    if (statusData.status === 'success') {
                        let channelSent = false;
                        const dbUser = deposit.user;
                        if (dbUser) {
                            // Tambah saldo secara Atomic menggunakan $inc
                            const userToUpdate = await User.findByIdAndUpdate(
                                dbUser._id,
                                { $inc: { balance: deposit.amount } },
                                { returnDocument: 'after' }
                            );

                            // Hapus QR
                            if (deposit.qrMessageId) {
                                this.bot.telegram.deleteMessage(dbUser.telegramId, deposit.qrMessageId).catch(() => {});
                            }

                            // Notifikasi Sukses
                            this.bot.telegram.sendMessage(
                                dbUser.telegramId,
                                `✅ *DEPOSIT BERHASIL!*\n\nID: \`${deposit.depositId}\`\nSaldo Masuk: *Rp${deposit.amount.toLocaleString('id-ID')}*\n💰 Saldo Sekarang: *Rp${userToUpdate?.balance.toLocaleString('id-ID')}*`,
                                { parse_mode: 'Markdown' }
                            ).catch(() => {});

                            // Kirim Testi ke Channel
                            if (!deposit.channelSentAt) {
                                try {
                                    await this.channelService.sendDepositTesti({
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
                                        method: 'QRIS',
                                        createdAt: new Date()
                                    });
                                    channelSent = true;
                                } catch (sendError) {
                                    console.error('Gagal kirim deposit testi ke channel:', sendError);
                                }
                            }

                            // Notifikasi ke Owner Bot
                            if (process.env.OWNER_ID) {
                                this.bot.telegram.sendMessage(
                                    process.env.OWNER_ID,
                                    `💰 *Deposit Masuk!*\nUser: ${dbUser.fullName}\nNominal: Rp${deposit.amount.toLocaleString('id-ID')}`,
                                    { parse_mode: 'Markdown' }
                                ).catch(() => {});
                            }
                        }
                        
                        // Save the deposit changes all at once
                        deposit.status = 'success';
                        if (channelSent) {
                            deposit.channelSentAt = new Date();
                        }
                        await deposit.save();
                    }
                } catch (err) {
                    console.error(`Gagal mengecek deposit ID ${deposit.depositId} ke API:`, err);
                }
            }));
        } catch (error) {
            console.error("❌ Terjadi Error di Global Deposit Checker:", error);
        } finally {
            this.isRunning = false;
        }
    }
}
