// src/middlewares/guard.ts
import { Context } from 'telegraf';
import { User, IUser } from '../models/User';
import { Setting } from '../models/Setting';

// Modifikasi tipe Context agar mengenali `dbUser`
export interface SessionData {
    awaitingDeposit?: boolean;
    awaitingAdminUserSearch?: boolean;
    adminUserSearchKeyword?: string;
}

// 2. Tambahkan session ke MyContext
export interface MyContext extends Context {
    dbUser?: IUser;
    session?: SessionData; // 👈 Tambahkan baris ini!
}

// 1. Variabel Cache Global untuk Settings (TTL 15 Detik)
let cachedSettings: any = null;
let lastSettingsFetch = 0;

export const systemGuard = async (ctx: MyContext, next: () => Promise<void>) => {
    // Jika bukan dari user (misal update dari channel), lewati
    if (!ctx.from) return next();

    const OWNER_ID = Number(process.env.OWNER_ID);
    const isOwner = ctx.from.id === OWNER_ID;

    try {
        // Optimasi: Membaca Settings menggunakan Cache 15 Detik dan .lean()
        if (!cachedSettings || Date.now() - lastSettingsFetch > 15000) {
            let settings = await Setting.findOne().lean();
            if (!settings) settings = await Setting.create({});
            cachedSettings = settings;
            lastSettingsFetch = Date.now();
        }

        const settings = cachedSettings;

        // ==========================================
        // 🛑 EKSEKUSI PENGATURAN (GUARD)
        // ==========================================
        if (!isOwner) {
            // Jika bot diubah ke Self Mode (hanya owner yang bisa pakai)
            if (settings.isSelfMode) return; 

            // Jika bot sedang Maintenance
            if (settings.isMaintenance) {
                await ctx.reply('⚙️ *Bot sedang maintenance*. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
                return;
            }

            // Jika bot dikunci khusus Grup
            if (settings.isGroupOnly && ctx.chat?.type === 'private') {
                await ctx.reply('🚫 Bot hanya bisa digunakan di *grup* untuk sementara waktu.', { parse_mode: 'Markdown' });
                return;
            }

            // (Fitur Wajib Join Channel bisa Anda tambahkan logikanya di sini menggunakan ctx.telegram.getChatMember)
        }
    } catch (error) {
        console.error('Guard Error:', error);
    }

    const { id: telegramId, username, first_name, last_name } = ctx.from;
    const fullName = `${first_name || ''} ${last_name || ''}`.trim();

    try {
        // Cari user di database
        let user = await User.findOne({ telegramId });
        
        // Jika belum terdaftar, buat baru (Auto Save ID)
        if (!user) {
            user = await User.create({
                telegramId,
                username: username ? username : undefined,
                fullName,
                balance: 0
            });
            console.log(`👤 User baru terdaftar: ${fullName} (${telegramId})`);
        } else {
            // 🐛 FIX: Mencegah operasi Save/Update berulang-ulang tanpa henti (Infinite Write)
            const resolvedUsername = username || undefined;
            if (user.username !== resolvedUsername || user.fullName !== fullName) {
                user.username = resolvedUsername;
                user.fullName = fullName;
                await user.save();
            }
        }

        // 🛑 GUARD: Tolak jika di-blacklist
        if (user.isBlacklisted) {
            await ctx.reply('🚫 Akses Ditolak!\nAnda telah diblacklist dari penggunaan bot ini.');
            return; // Hentikan proses, jangan panggil next()
        }

        // Simpan data user ke dalam context agar bisa dibaca oleh modul lain (tanpa query DB lagi)
        ctx.dbUser = user;

        // Lolos dari satpam, lanjut ke fitur
        return next();
    } catch (error) {
        console.error('❌ Error di System Guard:', error);
        await ctx.reply('⚠️ Terjadi kesalahan pada sistem database kami.');
    }
};