// src/modules/support/index.ts
import { Telegraf, Markup } from 'telegraf';
import { MyContext } from '../../middlewares/guard';
import { CsSession, CsMessageMap } from '../../models/CsSession';

export default (bot: Telegraf<MyContext>) => {
    const OWNER_ID = Number(process.env.OWNER_ID);

    // ==========================================
    // 1. MULAI SESI CS (Tombol Diklik)
    // ==========================================
    bot.action('contact_admin', async (ctx) => {
        if (ctx.chat?.type !== 'private') {
            return ctx.answerCbQuery('❌ Hanya bisa digunakan di Private Chat!', { show_alert: true });
        }

        const userId = ctx.from?.id;
        if (!userId) return;

        if (userId === OWNER_ID) {
            return ctx.answerCbQuery('🧠 Kamu owner, tidak bisa kontak diri sendiri!', { show_alert: true });
        }

        try {
            // Aktifkan sesi di database
            await CsSession.findOneAndUpdate(
                { userId },
                { isActive: true, startedAt: new Date(), lastMessageAt: new Date() },
                { upsert: true, returnDocument: 'after' }
            );

            await ctx.editMessageCaption(
                '📨 *Sesi Customer Service Aktif*\n\nSilakan kirim keluhan, pertanyaan, atau bukti transfer Anda di sini.\nPesan Anda akan diteruskan ke Admin.\n\nKetik `/batal` untuk mengakhiri sesi.',
                { parse_mode: 'Markdown' }
            ).catch(() => {});

        } catch (error) {
            await ctx.answerCbQuery('❌ Gagal memulai sesi CS.', { show_alert: true });
        }
    });

    // ==========================================
    // 2. MENGAKHIRI SESI (/batal)
    // ==========================================
    bot.command('batal', async (ctx) => {
        const userId = ctx.from.id;
        const isOwner = userId === OWNER_ID;

        try {
            // JIKA USER YANG MEMBATALKAN
            if (!isOwner) {
                const session = await CsSession.findOne({ userId, isActive: true });
                if (!session) {
                    return ctx.reply('ℹ️ Anda tidak sedang dalam sesi chat dengan Admin.');
                }

                session.isActive = false;
                await session.save();

                await ctx.reply('✅ Sesi chat dengan Admin telah diakhiri.', { reply_markup: { remove_keyboard: true } });
                await bot.telegram.sendMessage(OWNER_ID, `❌ *Sesi Ditutup*\nUser \`${userId}\` telah mengakhiri obrolan.`, { parse_mode: 'Markdown' }).catch(() => {});
                return;
            }

            // JIKA ADMIN YANG MEMBATALKAN
            // Admin harus me-reply pesan user ATAU mengetik /batal <id_user>
            const args = ctx.message.text.split(' ');
            let targetUserId: number | null = null;

            if (args[1]) {
                targetUserId = Number(args[1]);
            } else if (ctx.message.reply_to_message) {
                // Cari ID user berdasarkan pesan yang di-reply Admin
                const map = await CsMessageMap.findOne({ adminMessageId: ctx.message.reply_to_message.message_id });
                if (map) targetUserId = map.userId;
            }

            if (!targetUserId) {
                return ctx.reply('❌ Format salah.\nGunakan: `/batal <id_user>`\nAtau *reply* pesan user yang ingin dibatalkan.', { parse_mode: 'Markdown' });
            }

            const session = await CsSession.findOne({ userId: targetUserId, isActive: true });
            if (!session) {
                return ctx.reply(`ℹ️ Tidak ada sesi aktif dengan User \`${targetUserId}\`.`, { parse_mode: 'Markdown' });
            }

            session.isActive = false;
            await session.save();

            await ctx.reply(`✅ Sesi chat dengan User \`${targetUserId}\` telah ditutup Admin.`);
            await bot.telegram.sendMessage(targetUserId, '❌ Sesi obrolan Anda telah ditutup oleh Admin.').catch(() => {});

        } catch (error) {
            console.error('Error Batal CS:', error);
        }
    });

    // ==========================================
    // 3. MENERUSKAN PESAN (ROUTING)
    // ==========================================
    bot.on('message', async (ctx, next) => {
        const userId = ctx.from.id;
        const isOwner = userId === OWNER_ID;
        const message = ctx.message as any; // Casting any agar mudah akses text/photo/document

        // Abaikan command (karena sudah dihandle fungsi lain)
        if (message.text && message.text.startsWith('/')) return next();

        try {
            // --- SKENARIO A: ADMIN MEMBALAS PESAN USER ---
            if (isOwner && message.reply_to_message) {
                // Cek apakah pesan yang di-reply Admin ada di database mapping
                const map = await CsMessageMap.findOne({ adminMessageId: message.reply_to_message.message_id });
                if (!map) return next(); // Bukan pesan dari CS System

                const targetUserId = map.userId;

                // Cek apakah sesi masih aktif
                const session = await CsSession.findOne({ userId: targetUserId, isActive: true });
                if (!session) {
                    return ctx.reply(`⚠️ Gagal mengirim balasan. Sesi chat dengan User \`${targetUserId}\` sudah ditutup.`, { parse_mode: 'Markdown' });
                }

                // Copy pesan admin dan kirim ke User (Mendukung Teks, Foto, Video, dll)
                await bot.telegram.copyMessage(targetUserId, ctx.chat.id, message.message_id);
                
                // Beri tanda kecil ke admin bahwa pesan terkirim
                await ctx.react('👍').catch(() => {}); 
                return; // Stop routing
            }


            // --- SKENARIO B: USER MENGIRIM PESAN KE ADMIN ---
            if (!isOwner && ctx.chat?.type === 'private') {
                const session = await CsSession.findOne({ userId, isActive: true });
                if (!session) return next(); // Jika tidak ada sesi aktif, biarkan sistem modul lain yang merespons (misal guard)

                // Update waktu terakhir
                session.lastMessageAt = new Date();
                await session.save();

                // Identitas pengirim
                const userInfo = `👤 *${ctx.from.first_name}* ${ctx.from.username ? `(@${ctx.from.username})` : ''}\n🆔 \`${userId}\``;

                let fwdMsg;

                // Jika berupa teks
                if (message.text) {
                    fwdMsg = await bot.telegram.sendMessage(
                        OWNER_ID, 
                        `📨 *Pesan CS Masuk*\n${userInfo}\n\n💬:\n${message.text}`, 
                        { parse_mode: 'Markdown' }
                    );
                } 
                // Jika berupa file/media (Gunakan copyMessage untuk mengirim ulang medianya)
                else {
                    await bot.telegram.sendMessage(OWNER_ID, `📨 *Pesan CS Masuk (Media/File)*\n${userInfo}`, { parse_mode: 'Markdown' });
                    fwdMsg = await bot.telegram.copyMessage(OWNER_ID, ctx.chat.id, message.message_id);
                }

                // Catat mapping agar Admin bisa me-reply pesan ini
                if (fwdMsg) {
                    await CsMessageMap.create({
                        adminMessageId: fwdMsg.message_id,
                        userId: userId
                    });
                }
                return; // Pesan sudah ditangkap CS, jangan teruskan ke modul lain
            }

            // Lanjut ke modul lain jika tidak masuk skenario CS
            return next();

        } catch (error) {
            console.error('CS Routing Error:', error);
            return next();
        }
    });
};