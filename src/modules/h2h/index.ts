// src/modules/h2h/index.ts
import { Telegraf, Markup } from 'telegraf';
import { MyContext } from '../../middlewares/guard';
import { RumahOtpService } from '../../services/RumahOtpService';

export default (bot: Telegraf<MyContext>) => {
    const otpService = new RumahOtpService();
    const OWNER_ID = Number(process.env.OWNER_ID);

    // Middleware khusus Admin
    const adminGuard = async (ctx: MyContext, next: () => Promise<void>) => {
        if (ctx.from?.id !== OWNER_ID) return; 
        return next();
    };

    // ==========================================
    // 1. CARI PRODUK H2H (/listh2h <keyword>)
    // ==========================================
    bot.command('listh2h', adminGuard, async (ctx) => {
        const keyword = ctx.message.text.split(' ').slice(1).join(' ').toLowerCase();

        if (!keyword) {
            return ctx.reply('❗ *Cara pakai:*\n`/listh2h <kata kunci>`\n\nContoh:\n• `/listh2h dana`\n• `/listh2h mlbb`', { parse_mode: 'Markdown' });
        }

        const loading = await ctx.reply('⏳ *Mencari produk...*', { parse_mode: 'Markdown' });

        try {
            const products = await otpService.getH2hProducts();
            const results = products.filter((p: any) => 
                p.name.toLowerCase().includes(keyword) || 
                p.brand.toLowerCase().includes(keyword) || 
                p.code.toLowerCase().includes(keyword)
            );

            if (results.length === 0) {
                return ctx.telegram.editMessageText(ctx.chat.id, loading.message_id, undefined, `⚠️ Tidak ada produk untuk kata kunci *${keyword}*`, { parse_mode: 'Markdown' });
            }

            // Simpan hasil ke Session untuk keperluan Pagination!
            if (ctx.session) ctx.session.h2hSearch = { keyword, results };

            // Panggil fungsi render halaman (Halaman 1)
            await renderH2hPage(ctx, loading.message_id, 1);

        } catch (error: any) {
            await ctx.telegram.editMessageText(ctx.chat.id, loading.message_id, undefined, `❌ Gagal: ${error.message}`);
        }
    });

    // Tangkap Action Pagination (H2H)
    bot.action(/^h2hp_(\d+)$/, async (ctx) => {
        const page = Number(ctx.match[1]);
        if (!ctx.session?.h2hSearch) {
            return ctx.answerCbQuery('⚠️ Sesi pencarian kedaluwarsa. Silakan ketik ulang /listh2h.', { show_alert: true });
        }
        await renderH2hPage(ctx, ctx.callbackQuery.message?.message_id, page, true);
    });

    // Fungsi Render Halaman
    const renderH2hPage = async (ctx: MyContext, msgId: number | undefined, page: number, isAction = false) => {
        if (!ctx.chat) return; // 👈 TAMBAHKAN BARIS INI
        
        const searchData = ctx.session?.h2hSearch;
        if (!searchData) return;

        const PER_PAGE = 5;
        const totalPages = Math.ceil(searchData.results.length / PER_PAGE);
        const start = (page - 1) * PER_PAGE;
        const sliced = searchData.results.slice(start, start + PER_PAGE);

        let text = `📦 *Hasil Pencarian H2H*\n🔍 Keyword: *${searchData.keyword}*\n📄 Halaman: *${page}/${totalPages}* (${searchData.results.length} Item)\n━━━━━━━━━━━━━━━━━━\n`;

        sliced.forEach((p: any) => {
            text += `💠 *${p.name}*\n🧩 Code: \`${p.code}\`\n🏷️ Brand: *${p.brand}*\n💰 Harga: Rp${p.price.toLocaleString('id-ID')}\n━━━━━━━━━━━━━━\n`;
        });

        const buttons = [];
        if (page > 1) buttons.push(Markup.button.callback('⬅️ Prev', `h2hp_${page - 1}`));
        buttons.push(Markup.button.callback(`Hal ${page}/${totalPages}`, 'noop'));
        if (page < totalPages) buttons.push(Markup.button.callback('Next ➡️', `h2hp_${page + 1}`));

        const opts = { parse_mode: 'Markdown' as const, reply_markup: { inline_keyboard: [buttons] } };

        if (isAction) {
            await ctx.editMessageText(text, opts).catch(() => {});
        } else if (msgId) {
            // Karena kita sudah cek di atas, TypeScript tidak akan protes lagi soal ctx.chat.id
            await ctx.telegram.editMessageText(ctx.chat.id, msgId, undefined, text, opts);
        }
    };


    // ==========================================
    // 2. ORDER MANUAL & AUTO CEK STATUS (/orderh2h)
    // ==========================================
    bot.command('orderh2h', adminGuard, async (ctx) => {
        const args = ctx.message.text.split(' ');
        const code = args[1];
        const target = args[2];

        if (!code || !target) {
            return ctx.reply('❗ *Format salah!*\nGunakan: `/orderh2h <kode> <target>`\nContoh: `/orderh2h pln20 12345678`', { parse_mode: 'Markdown' });
        }

        await processH2hTransaction(ctx, code, target);
    });

    // ==========================================
    // 3. AUTO CAIRKAN E-WALLET (/cairkan)
    // ==========================================
    bot.command('cairkan', adminGuard, async (ctx) => {
        const nominal = Number(ctx.message.text.split(' ')[1]);

        if (!nominal || isNaN(nominal) || nominal % 1000 !== 0) {
            return ctx.reply('❗ *Format salah!*\nGunakan: `/cairkan <nominal_kelipatan_1000>`\nContoh: `/cairkan 5000`', { parse_mode: 'Markdown' });
        }

        const ewalletType = process.env.EWALLET_TYPE?.toLowerCase() || 'dana';
        const ewalletNumber = process.env.EWALLET_NUMBER;

        if (!ewalletNumber) return ctx.reply('⚠️ Nomor EWALLET_NUMBER belum disetting di .env!');

        const prefixMap: Record<string, string> = { dana: "D", gopay: "GPY", ovo: "OVO", shopeepay: "SHOPE", linkaja: "LINK" };
        const prefix = prefixMap[ewalletType];

        if (!prefix) return ctx.reply(`❌ E-wallet *${ewalletType}* tidak didukung.`, { parse_mode: 'Markdown' });

        const loading = await ctx.reply('⏳ *Mencari produk pencairan yang cocok...*', { parse_mode: 'Markdown' });

        try {
            const products = await otpService.getH2hProducts();
            
            // Cari produk yang sesuai Prefix E-wallet dan Nominalnya cocok dengan harga/nama
            const matchedProduct = products.find((p: any) => {
                if (!p.code.startsWith(prefix)) return false;
                const angkaDiNama = Number(String(p.name).replace(/\D/g, ""));
                return angkaDiNama === nominal || Number(p.price) === nominal; // Estimasi termudah mencari produk
            });

            if (!matchedProduct) {
                return ctx.telegram.editMessageText(ctx.chat.id, loading.message_id, undefined, `❌ Tidak ada produk H2H yang cocok untuk *${ewalletType} Rp${nominal}*.\nSilakan gunakan /listh2h dan /orderh2h secara manual.`, { parse_mode: 'Markdown' });
            }

            // Hapus pesan loading pencarian, ganti dengan proses transaksi
            await ctx.telegram.deleteMessage(ctx.chat.id, loading.message_id).catch(() => {});
            await processH2hTransaction(ctx, matchedProduct.code, ewalletNumber);

        } catch (error: any) {
            await ctx.telegram.editMessageText(ctx.chat.id, loading.message_id, undefined, `❌ Gagal: ${error.message}`);
        }
    });

    // ==========================================
    // 💡 FUNGSI INTI TRANSAKSI & POLLING H2H
    // ==========================================
    const processH2hTransaction = async (ctx: MyContext, code: string, target: string) => {
        if (!ctx.chat) return; // 👈 TAMBAHKAN BARIS INI

        const loadingMsg = await ctx.reply('⏳ *Membuat transaksi ke server...*', { parse_mode: 'Markdown' });

        try {
            const trx = await otpService.createH2hTransaction(code, target);
            
            let text = `✅ *Transaksi Berhasil Dibuat!*\n\n🛒 Produk: *${trx.product?.name || code}*\n🎯 Tujuan: \`${trx.tujuan}\`\n🆔 ID Trx: \`${trx.id}\`\n📌 Status: *${trx.status}*\n\n⏳ _Sistem memantau status secara otomatis..._`;
            
            // Tambahkan tanda seru (!) di ctx.chat!.id jika TS masih cerewet, 
            // tapi dengan if (!ctx.chat) di atas, harusnya TS sudah aman.
            await ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, text, { parse_mode: 'Markdown' });

            // POLLING AUTO CHECKER SETIAP 5 DETIK
            let checks = 0;
            const maxChecks = 60; // 5 Menit maksimal
            
            const interval = setInterval(async () => {
                checks++;
                try {
                    const statusData = await otpService.checkH2hStatus(trx.id);

                    if (statusData.status === 'success') {
                        clearInterval(interval);
                        const successText = `🎉 *TRANSAKSI BERHASIL!*\n\n🆔 ID: \`${statusData.id}\`\n🎯 Tujuan: \`${statusData.tujuan}\`\n📦 Produk: ${statusData.product?.name}\n💰 Harga: Rp${statusData.price.toLocaleString('id-ID')}\n🔐 SN: \`${statusData.response?.sn || '-'}\`\n\n✅ Selesai.`;
                        await ctx.telegram.editMessageText(ctx.chat!.id, loadingMsg.message_id, undefined, successText, { parse_mode: 'Markdown' });
                    } 
                    else if (statusData.status === 'failed' || statusData.status === 'canceled') {
                        clearInterval(interval);
                        const failText = `❌ *TRANSAKSI GAGAL!*\n\n🆔 ID: \`${statusData.id}\`\n🎯 Tujuan: \`${statusData.tujuan}\`\n📦 Status: *${statusData.status.toUpperCase()}*\n💬 Pesan: ${statusData.response?.status || '-'}\n🔁 Refund: ${statusData.refund ? "✔️ Iya" : "❌ Tidak"}`;
                        await ctx.telegram.editMessageText(ctx.chat!.id, loadingMsg.message_id, undefined, failText, { parse_mode: 'Markdown' });
                    }
                    else if (checks >= maxChecks) {
                        clearInterval(interval);
                        await ctx.telegram.editMessageText(ctx.chat!.id, loadingMsg.message_id, undefined, `⌛ *Waktu pantau habis.*\nStatus transaksi \`${trx.id}\` masih PENDING. Silakan cek manual di dashboard RumahOTP.`, { parse_mode: 'Markdown' });
                    }
                } catch (e) {
                    console.log("H2H Polling Error:", e);
                }
            }, 5000);

        } catch (error: any) {
            await ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, `❌ *Transaksi Gagal!*\nPesan: ${error.message}`, { parse_mode: 'Markdown' });
        }
    };
};