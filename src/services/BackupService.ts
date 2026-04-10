// src/services/BackupService.ts
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import moment from 'moment-timezone';
import { Telegraf } from 'telegraf';
import { Setting } from '../models/Setting';
import { User } from '../models/User';
import { Transaction } from '../models/Transaction';
import { Deposit } from '../models/Deposit';

export class BackupService {
    private bot: Telegraf<any>;
    private ownerId: number;
    private intervalMs: number;
    private autoBackupTimeout: NodeJS.Timeout | null = null;
    private isBackupRunning = false;

    constructor(bot: Telegraf<any>) {
        this.bot = bot;
        this.ownerId = Number(process.env.OWNER_ID);
        this.intervalMs = 12 * 60 * 60 * 1000; // Backup tiap 12 jam
    }

    async runBackup(isManual: boolean = false) {
        if (this.isBackupRunning) {
            if (isManual) {
                await this.bot.telegram.sendMessage(this.ownerId, '⏳ Backup masih berjalan. Coba lagi setelah proses saat ini selesai.').catch(() => {});
            }
            return;
        }

        this.isBackupRunning = true;
        const waktuMoment = moment().tz("Asia/Jakarta");
        const frames = [
            "🚀 Menyusun file misterius...",
            "🗂️ Mengekstrak data dari MongoDB...",
            "💾 Mengubah data menjadi ZIP ajaib...",
            "✨ Hampir selesai... teleport ke Telegram..."
        ];

        let msgAnim: any;
        let animInterval: NodeJS.Timeout | undefined;

        if (isManual) {
            let i = 0;
            msgAnim = await this.bot.telegram.sendMessage(this.ownerId, frames[i]);
            animInterval = setInterval(() => {
                i = (i + 1) % frames.length;
                this.bot.telegram.editMessageText(this.ownerId, msgAnim.message_id, undefined, frames[i]).catch(() => {});
            }, 900);
        }

        try {
            const formattedTime = waktuMoment.format("DD-MM-YYYY-HH.mm.ss");
            const zipName = `DB-BACKUP-${formattedTime}.zip`;
            const zipPath = path.join(process.cwd(), zipName);

            // 1. Ekstrak data dari MongoDB
            const users = await User.find();
            const transactions = await Transaction.find();
            const deposits = await Deposit.find();

            // 2. Tulis sementara ke format JSON di RAM / File lokal
            const backupData = {
                metadata: { date: waktuMoment.format(), totalUsers: users.length },
                users: users,
                transactions: transactions,
                deposits: deposits
            };

            // 3. Proses Zipping menggunakan Archiver
            await new Promise<void>((resolve, reject) => {
                const output = fs.createWriteStream(zipPath);
                const archive = archiver('zip', { zlib: { level: 9 } });

                output.on('close', () => resolve());
                archive.on('error', (err) => reject(err));

                archive.pipe(output);
                
                // Masukkan data JSON MongoDB ke dalam ZIP
                archive.append(JSON.stringify(backupData, null, 2), { name: 'database_dump.json' });
                
                // Opsional: Backup juga file config (.env) jika ada
                if (fs.existsSync(path.join(process.cwd(), '.env'))) {
                    archive.file(path.join(process.cwd(), '.env'), { name: '.env.backup' });
                }

                archive.finalize();
            });

            // 4. Hentikan animasi
            if (animInterval && msgAnim) {
                clearInterval(animInterval);
                await this.bot.telegram.editMessageText(this.ownerId, msgAnim.message_id, undefined, "✅ Kompresi database selesai!\n🚀 Mengirim ke Telegram…");
            }

            // 5. Kirim file ZIP ke Telegram
            const stats = fs.statSync(zipPath);
            const fileSize = stats.size > 1024 * 1024 
                ? (stats.size / (1024 * 1024)).toFixed(2) + " MB" 
                : (stats.size / 1024).toFixed(2) + " KB";

            const botInfo = await this.bot.telegram.getMe();
            const captionText = `📦 *Auto Backup Database*\n\n📅 *Tanggal:* ${waktuMoment.format("DD-MM-YYYY | HH.mm.ss")}\n📁 *File:* ${zipName}\n📊 *Ukuran:* ${fileSize}\n👥 *Total User:* ${users.length}\n🤖 *Bot:* @${botInfo.username}\n\n✅ *Backup berhasil!*`;

            await this.bot.telegram.sendDocument(this.ownerId, { source: zipPath }, { caption: captionText, parse_mode: "Markdown" });

            // 6. Simpan waktu backup ke DB
            await Setting.updateOne({}, { lastBackupAt: new Date() }, { upsert: true });

            // 7. Bersihkan file ZIP lokal
            fs.unlinkSync(zipPath);

            if (isManual && msgAnim) {
                await this.bot.telegram.deleteMessage(this.ownerId, msgAnim.message_id).catch(() => {});
            }

        } catch (error: any) {
            if (animInterval && msgAnim) {
                clearInterval(animInterval);
                const safeError = error.message.slice(0, 3800);
                await this.bot.telegram.editMessageText(this.ownerId, msgAnim.message_id, undefined, `⚠️ Backup gagal!\n\nDetail:\n${safeError}`);
            }
            console.error('Backup Error:', error);
        } finally {
            this.isBackupRunning = false;

            if (animInterval) {
                clearInterval(animInterval);
            }
        }
    }

    private scheduleNextAutoBackup(delayMs: number) {
        if (this.autoBackupTimeout) {
            clearTimeout(this.autoBackupTimeout);
        }

        this.autoBackupTimeout = setTimeout(async () => {
            await this.runBackup(false);
            this.scheduleNextAutoBackup(this.intervalMs);
        }, delayMs);
    }

    async startAutoBackup() {
        let settings = await Setting.findOne();
        if (!settings) settings = await Setting.create({});

        const lastBackup = settings.lastBackupAt ? settings.lastBackupAt.getTime() : null;
        const now = Date.now();
        const firstDelay = lastBackup ? Math.max(0, this.intervalMs - (now - lastBackup)) : 0;

        this.scheduleNextAutoBackup(firstDelay);

        const nextTime = moment(now + firstDelay).tz("Asia/Jakarta").format("DD-MM-YYYY HH:mm:ss");
        await this.bot.telegram.sendMessage(this.ownerId, `🔄 Bot menyala!\n⏳ Auto-backup berjalan setiap 12 jam.\n🗓️ Eksekusi berikutnya: *${nextTime}*`, { parse_mode: 'Markdown' }).catch(() => {});
    }
}