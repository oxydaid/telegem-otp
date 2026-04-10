// src/modules/otp/index.ts
import { Telegraf, Markup } from 'telegraf';
import { MyContext } from '../../middlewares/guard';
import { RumahOtpService } from '../../services/RumahOtpService';
import { Transaction } from '../../models/Transaction';
import { User } from '../../models/User';
import { ChannelService } from '../../services/ChannelService';

// Fungsi bantuan untuk membuat tombol navigasi halaman
const makePaginationButtons = (prefix: string, currentPage: number, totalPages: number, extraArgs: string = '') => {
    const buttons = [];
    if (currentPage > 1) {
        buttons.push(Markup.button.callback('⬅️ Prev', `${prefix}_${currentPage - 1}${extraArgs}`));
    }
    buttons.push(Markup.button.callback(`📖 Hal ${currentPage}/${totalPages}`, 'noop'));
    if (currentPage < totalPages) {
        buttons.push(Markup.button.callback('Next ➡️', `${prefix}_${currentPage + 1}${extraArgs}`));
    }
    return buttons;
};

export default (bot: Telegraf<MyContext>) => {
    const otpService = new RumahOtpService();
    const channelService = new ChannelService(bot);
    const PER_PAGE = 10; // Jumlah item per halaman

    // ==========================================
    // 1. MENU LAYANAN (SERVICES)
    // Format Callback: srv_p_<page>
    // ==========================================
    bot.action(['choose_service', /^srv_p_(\d+)$/], async (ctx) => {
        try {
            // Deteksi apakah ini klik awal atau pindah halaman
            const isPaging = ctx.match && ctx.match[0].startsWith('srv_p_');
            const page = isPaging ? parseInt(ctx.match[1]) : 1;

            if (!isPaging) await ctx.editMessageCaption('⏳ *Memuat daftar aplikasi OTP...*', { parse_mode: 'Markdown' });

            const services = await otpService.getServices();
            const totalPages = Math.ceil(services.length / PER_PAGE);
            const start = (page - 1) * PER_PAGE;
            const listToShow = services.slice(start, start + PER_PAGE);

            // Buat tombol list layanan
            const keyboard = listToShow.map((srv) => [
                // Saat layanan diklik, arahkan ke halaman 1 negara (cty_p_1_<serviceId>)
                Markup.button.callback(`${srv.service_name} | ID ${srv.service_code}`, `cty_p_1_${srv.service_code}`)
            ]);

            // Tambahkan navigasi dan tombol kembali
            keyboard.push(makePaginationButtons('srv_p', page, totalPages));
            keyboard.push([Markup.button.callback('🏠 Kembali Ke Menu Utama', 'back_home')]);

            const caption = `📲 *Daftar Aplikasi OTP*\n\nSilakan pilih salah satu aplikasi.\n💡 Total layanan: *${services.length}*`;

            await ctx.editMessageCaption(caption, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });
        } catch (error) {
            await ctx.editMessageCaption('❌ *Gagal memuat daftar layanan.*');
        }
    });

    // ==========================================
    // 2. MENU NEGARA (COUNTRIES)
    // Format Callback: cty_p_<page>_<serviceId>
    // ==========================================
    bot.action(/^cty_p_(\d+)_(\d+)$/, async (ctx) => {
        try {
            const page = parseInt(ctx.match[1]);
            const serviceId = ctx.match[2];

            const countries = await otpService.getCountries(serviceId);
            
            if (countries.length === 0) {
                return ctx.editMessageCaption('⚠️ *Maaf, stok untuk layanan ini sedang kosong di semua negara.*', {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[Markup.button.callback('⬅️ Kembali', 'choose_service')]] }
                });
            }

            const totalPages = Math.ceil(countries.length / PER_PAGE);
            const start = (page - 1) * PER_PAGE;
            const listToShow = countries.slice(start, start + PER_PAGE);

            const keyboard = listToShow.map((c: any) => [
                // Saat negara diklik, arahkan ke halaman 1 harga (prc_p_1_<serviceId>_<iso>_<numId>)
                Markup.button.callback(
                    `${c.name} (${c.prefix}) | Stok: ${c.stock_total}`, 
                    `prc_p_1_${serviceId}_${c.iso_code}_${c.number_id}`
                )
            ]);

            keyboard.push(makePaginationButtons('cty_p', page, totalPages, `_${serviceId}`));
            keyboard.push([Markup.button.callback('⬅️ Kembali ke Layanan', 'choose_service')]);

            const caption = `🌍 *Pilih Negara*\nLayanan ID: *${serviceId}*\n🌏 Total Negara: *${countries.length}*\n\nSilakan pilih negara:`;

            await ctx.editMessageCaption(caption, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });
        } catch (error) {
            await ctx.editMessageCaption('❌ *Gagal memuat daftar negara.*');
        }
    });

    // ==========================================
    // 3. MENU HARGA / PROVIDER (PRICES)
    // Format Callback: prc_p_<page>_<serviceId>_<isoCode>_<numberId>
    // ==========================================
    bot.action(/^prc_p_(\d+)_(\d+)_([a-zA-Z0-9]+)_(\d+)$/, async (ctx) => {
        try {
            const page = parseInt(ctx.match[1]);
            const serviceId = ctx.match[2];
            const isoCode = ctx.match[3];
            const numberId = ctx.match[4];

            const countries = await otpService.getCountries(serviceId);
            const country = countries.find((c: any) => String(c.number_id) === String(numberId));

            if (!country || !country.pricelist || country.pricelist.length === 0) {
                return ctx.editMessageCaption('⚠️ *Data harga tidak ditemukan atau stok kosong.*', {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[Markup.button.callback('⬅️ Kembali', `cty_p_1_${serviceId}`)]] }
                });
            }

            const untungNokos = Number(process.env.UNTUNG_NOKOS) || 1000;
            
            // Ambil provider yang tersedia dan punya stok
            const availableProviders = country.pricelist.filter((p: any) => p.available && p.stock > 0);
            
            const totalPages = Math.ceil(availableProviders.length / PER_PAGE);
            const start = (page - 1) * PER_PAGE;
            const listToShow = availableProviders.slice(start, start + PER_PAGE);

            const keyboard = listToShow.map((p: any) => {
                const hargaFinal = Number(p.price) + untungNokos;
                return [
                    Markup.button.callback(
                        `Rp${hargaFinal.toLocaleString('id-ID')} 💰 (Stok: ${p.stock})`,
                        `buy_${numberId}_${p.provider_id}_${serviceId}` // Tombol eksekusi pembelian!
                    )
                ];
            });

            // Navigasi halaman harga
            keyboard.push(makePaginationButtons('prc_p', page, totalPages, `_${serviceId}_${isoCode}_${numberId}`));
            // Tombol kembali ke negara
            keyboard.push([Markup.button.callback('⬅️ Kembali ke Negara', `cty_p_1_${serviceId}`)]);

            const caption = `🌍 Negara: *${country.name} (${country.prefix})*\n📦 Layanan ID: *${serviceId}*\n📊 Total Pilihan Harga: *${availableProviders.length}*\n\n💵 *Pilih Harga:*`;

            await ctx.editMessageCaption(caption, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });

        } catch (error) {
            console.log(error);
            await ctx.editMessageCaption('❌ *Gagal memuat harga.*');
        }
    });

    bot.action(/^buy_(\d+)_(\d+)_(\d+)$/, async (ctx) => {
        const dbUser = ctx.dbUser;
        if (!dbUser) return;

        const numberId = ctx.match[1];
        const providerId = ctx.match[2];
        const serviceId = ctx.match[3];

        try {
            await ctx.editMessageCaption('⏳ *Memproses pesanan Anda...*', { parse_mode: 'Markdown' });

            const countries = await otpService.getCountries(serviceId);
            const country = countries.find((c: any) => String(c.number_id) === String(numberId));
            const providerData = country?.pricelist?.find((p: any) => String(p.provider_id) === String(providerId));

            if (!providerData) throw new Error("Data harga kedaluwarsa.");

            const untungNokos = Number(process.env.UNTUNG_NOKOS) || 1000;
            const hargaFinal = Number(providerData.price) + untungNokos;

            // Atomic update (Mencegah eksploitasi race condition via SPAM click)
            const updatedUser = await User.findOneAndUpdate(
                { _id: dbUser._id, balance: { $gte: hargaFinal } },
                { $inc: { balance: -hargaFinal } },
                { returnDocument: 'after' }
            );

            if (!updatedUser) {
                return ctx.editMessageCaption(`❌ *SALDO TIDAK CUKUP atau Transaksi Sedang Diproses!*\n\nSisa saldo Anda: *Rp${dbUser.balance.toLocaleString('id-ID')}*\nHarga layanan: *Rp${hargaFinal.toLocaleString('id-ID')}*`, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[Markup.button.callback('💰 Top Up Saldo', 'topup_nokos')]] }
                });
            }

            try {
                // Order ke RumahOTP
                const orderData = await otpService.orderNumber(numberId, providerId);

                // ✅ CATAT KE DATABASE TRANSAKSI
                await Transaction.create({
                    user: dbUser._id,
                    orderId: orderData.order_id,
                    serviceName: orderData.service,
                    countryName: orderData.country,
                    phoneNumber: orderData.phone_number,
                    price: hargaFinal,
                    status: 'pending'
                });

                const caption = `
✅ *PESANAN BERHASIL DIBUAT*

📱 *Layanan:* ${orderData.service}
🌍 *Negara:* ${orderData.country}
🆔 *Order ID:* \`${orderData.order_id}\`
📞 *Nomor:* \`${orderData.phone_number}\`
💵 *Harga:* Rp${hargaFinal.toLocaleString('id-ID')}

⏱️ *Status:* Menunggu OTP
⏳ *Kadaluarsa:* ${orderData.expires_in_minute} menit
💰 *Sisa Saldo:* Rp${dbUser.balance.toLocaleString('id-ID')}
`;
                await ctx.editMessageCaption(caption, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [Markup.button.callback('📩 Cek Status / Kode SMS', `checksms_${orderData.order_id}`)],
                            [Markup.button.callback('❌ Batalkan Pesanan', `cancelorder_${orderData.order_id}_${hargaFinal}`)]
                        ]
                    }
                });

            } catch (apiError: any) {
                // Rollback Saldo Atomic
                await User.updateOne({ _id: dbUser._id }, { $inc: { balance: hargaFinal } });
                await ctx.editMessageCaption(`❌ *Gagal Memesan Nomor*\nAlasan: ${apiError.message}\n\n💰 *Saldo dikembalikan.*`, { parse_mode: 'Markdown' });
            }
        } catch (error: any) {
            await ctx.editMessageCaption(`❌ Terjadi kesalahan: ${error.message}`);
        }
    });

    // ==========================================
    // 5. CEK SMS OTP (UPDATE STATUS DB) - DENGAN IDEMPOTENCY CHECK
    // ==========================================
    bot.action(/^checksms_(.+)$/, async (ctx) => {
        const orderId = ctx.match[1];
        const dbUser = ctx.dbUser;

        const normalizeStatus = (rawStatus: any): string => String(rawStatus || '').trim().toLowerCase();
        const isCanceledLike = (rawStatus: any): boolean => {
            const status = normalizeStatus(rawStatus);
            return ['canceled', 'cancelled', 'cancel', 'failed', 'expired'].includes(status);
        };
        
        try {
            await ctx.answerCbQuery('📡 Mengecek SMS dari server...', { show_alert: false });
            
            const data = await otpService.checkStatus(orderId);
            const otp = (data.otp_code && data.otp_code !== "-") ? data.otp_code : "Belum masuk";

            const transaction = await Transaction.findOne({ orderId }).lean();
            
            // ✅ CEK: Sudah success dan diproses
            if (transaction?.status === 'success' && transaction.channelSentAt) {
                await ctx.answerCbQuery('✅ OTP untuk pesanan ini sudah pernah diterima.', { show_alert: false });
                return;
            }

            // 🔴 CEK: Order sudah canceled (baik dari user maupun API/timeout)
            // Prevent double refund dengan check refundedAt
            if (isCanceledLike(transaction?.status) || isCanceledLike(data.status)) {
                if (transaction?.refundedAt) {
                    // Sudah di-refund sebelumnya, jangan refund lagi
                    await ctx.answerCbQuery('⚠️ Pesanan sudah dibatalkan dan di-refund sebelumnya.', { show_alert: true });
                    return;
                }

                // Claim transaksi canceled/pending secara atomic untuk mencegah refund dobel.
                const claimedTransaction = await Transaction.findOneAndUpdate(
                    { orderId, status: { $in: ['pending', 'canceled'] }, refundedAt: null },
                    {
                        status: 'canceled',
                        refundedAt: new Date(),
                        refundedBy: 'api'
                    },
                    { returnDocument: 'after' }
                );

                if (!claimedTransaction) {
                    await ctx.answerCbQuery('⚠️ Pesanan sudah diproses sebelumnya.', { show_alert: true });
                    return;
                }

                const result = await User.findOneAndUpdate(
                    { _id: claimedTransaction.user },
                    { $inc: { balance: claimedTransaction.price } },
                    { returnDocument: 'after' }
                );

                if (!result) {
                    await ctx.answerCbQuery('⚠️ Pesanan sudah dibatalkan.', { show_alert: true });
                    return;
                }

                await ctx.editMessageCaption(`✅ *PESANAN DIBATALKAN OTOMATIS*\n\n📋 Order ID: \`${orderId}\`\n⏱️ Alasan: OTP tidak terkirim dalam 20 menit\n\n💸 *Refund:* Rp${claimedTransaction.price.toLocaleString('id-ID')}\n💰 *Saldo Terbaru:* Rp${result.balance.toLocaleString('id-ID')}`, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[Markup.button.callback('🏠 Menu Utama', 'back_home')]] }
                });
                return;
            }

            if (otp === "Belum masuk") {
                const elapsedMs = transaction?.createdAt
                    ? Date.now() - new Date(transaction.createdAt).getTime()
                    : 0;
                const isTimedOut = elapsedMs >= 20 * 60 * 1000;

                if (isTimedOut) {
                    await otpService.cancelOrder(orderId).catch(() => {});

                    const claimedTransaction = await Transaction.findOneAndUpdate(
                        { orderId, status: { $in: ['pending', 'canceled'] }, refundedAt: null },
                        {
                            status: 'canceled',
                            refundedAt: new Date(),
                            refundedBy: 'timeout'
                        },
                        { returnDocument: 'after' }
                    );

                    if (!claimedTransaction) {
                        await ctx.answerCbQuery('⚠️ Pesanan sudah diproses sebelumnya.', { show_alert: true });
                        return;
                    }

                    const result = await User.findOneAndUpdate(
                        { _id: claimedTransaction.user },
                        { $inc: { balance: claimedTransaction.price } },
                        { returnDocument: 'after' }
                    );

                    if (!result) {
                        await ctx.answerCbQuery('⚠️ User tidak ditemukan saat proses refund.', { show_alert: true });
                        return;
                    }

                    await ctx.editMessageCaption(
                        `✅ *PESANAN DIBATALKAN OTOMATIS*\n\n📋 Order ID: \`${orderId}\`\n⏱️ Alasan: Tidak ada OTP setelah 20 menit\n\n💸 *Refund:* Rp${claimedTransaction.price.toLocaleString('id-ID')}\n💰 *Saldo Terbaru:* Rp${result.balance.toLocaleString('id-ID')}`,
                        {
                            parse_mode: 'Markdown',
                            reply_markup: { inline_keyboard: [[Markup.button.callback('🏠 Menu Utama', 'back_home')]] }
                        }
                    );
                    return;
                }

                await ctx.answerCbQuery('⏳ OTP Belum masuk, coba lagi nanti.', { show_alert: true });
                return;
            }

            // ✅ UPDATE DATABASE TRANSAKSI JADI SUCCESS
            const updatedTransaction = await Transaction.findOneAndUpdate(
                { orderId, status: 'pending' }, 
                { status: 'success', otpCode: otp },
                { returnDocument: 'after' }
            );

            if (updatedTransaction && !updatedTransaction.channelSentAt && dbUser) {
                try {
                    await channelService.sendOtpTesti({
                        user: {
                            telegramId: dbUser.telegramId,
                            fullName: dbUser.fullName,
                            username: dbUser.username
                        },
                        serviceName: data.service,
                        countryName: data.country,
                        operatorName: data.operator || data.operator_name || 'any',
                        orderId: data.order_id || orderId,
                        phoneNumber: data.phone_number,
                        otpCode: otp,
                        price: updatedTransaction.price,
                        createdAt: updatedTransaction.createdAt || new Date()
                    });

                    await Transaction.updateOne({ orderId }, { $set: { channelSentAt: new Date() } });
                } catch (sendError) {
                    console.error('Gagal kirim OTP testi ke channel:', sendError);
                }
            }

            const successCaption = `
🎉 *OTP BERHASIL DITERIMA!* 🎉

📱 *Layanan:* ${data.service}
📞 *Nomor:* \`${data.phone_number}\`
🔐 *Kode OTP:* \`${otp}\`

✅ Transaksi Selesai dan dicatat di Riwayat.`;

            await ctx.editMessageCaption(successCaption, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[Markup.button.callback('🏠 Menu Utama', 'back_home')]] }
            });

        } catch (error: any) {
            await ctx.answerCbQuery(`❌ Gagal cek SMS: ${error.message}`, { show_alert: true });
        }
    });

    // ==========================================
    // 6. BATALKAN PESANAN (REFUND & UPDATE DB) - DENGAN IDEMPOTENCY CHECK
    // ==========================================
    bot.action(/^cancelorder_(.+)_(\d+)$/, async (ctx) => {
        const dbUser = ctx.dbUser;
        if (!dbUser) return;

        const orderId = ctx.match[1];

        try {
            // ✅ CEK IDEMPOTENCY: Jika sudah di-refund sebelumnya, jangan refund lagi
            const transaction = await Transaction.findOne({ orderId }).lean();
            if (transaction?.refundedAt) {
                return ctx.editMessageCaption(`⚠️ *PESANAN SUDAH DIBATALKAN*\n\nPesanan ini sudah dibatalkan dan di-refund pada: ${transaction.refundedAt.toLocaleString('id-ID')}`, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[Markup.button.callback('🏠 Menu Utama', 'back_home')]] }
                });
            }

            await ctx.editMessageCaption('🗑️ *Sedang membatalkan pesanan...*', { parse_mode: 'Markdown' });

            await otpService.cancelOrder(orderId);

            // Claim transaksi canceled secara atomic dulu untuk mencegah double refund.
            const claimedTransaction = await Transaction.findOneAndUpdate(
                { orderId, status: 'pending', refundedAt: null },
                {
                    status: 'canceled',
                    refundedAt: new Date(),
                    refundedBy: 'user'
                },
                { returnDocument: 'after' }
            );

            if (!claimedTransaction) {
                return ctx.editMessageCaption('⚠️ *Pesanan sudah diproses sebelumnya.*', {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[Markup.button.callback('🏠 Menu Utama', 'back_home')]] }
                });
            }

            const updatedUser = await User.findOneAndUpdate(
                { _id: dbUser._id },
                { $inc: { balance: claimedTransaction.price } },
                { returnDocument: 'after' }
            );

            await ctx.editMessageCaption(`✅ *Pesanan Berhasil Dibatalkan!*\n\n💸 *Refund:* Rp${claimedTransaction.price.toLocaleString('id-ID')}\n💰 *Saldo Terbaru:* Rp${updatedUser?.balance.toLocaleString('id-ID')}`, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[Markup.button.callback('🏠 Menu Utama', 'back_home')]] }
            });

        } catch (error: any) {
            await ctx.editMessageCaption(`❌ Gagal membatalkan pesanan: ${error.message}`, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[Markup.button.callback('⬅️ Kembali ke Detail Order', `showorderdetail_${orderId}`)]] }
            });
        }
    });

    // ==========================================
    // 7. TAMPILKAN DETAIL ORDER (Tanpa auto-cek, hanya tampilkan data)
    // ==========================================
    bot.action(/^showorderdetail_(.+)$/, async (ctx) => {
        const orderId = ctx.match[1];

        try {
            const transaction = await Transaction.findOne({ orderId }).lean();
            if (!transaction) {
                await ctx.answerCbQuery('Pesanan tidak ditemukan.', { show_alert: true });
                return;
            }

            // Rebuild caption dari data transaction
            const caption = `
✅ *DETAIL PESANAN*

📱 *Layanan:* ${transaction.serviceName}
🌍 *Negara:* ${transaction.countryName}
🆔 *Order ID:* \`${transaction.orderId}\`
📞 *Nomor:* \`${transaction.phoneNumber}\`
💵 *Harga:* Rp${transaction.price.toLocaleString('id-ID')}

⏱️ *Status:* ${transaction.status === 'success' ? '✅ BERHASIL' : transaction.status === 'canceled' ? '❌ DIBATALKAN' : '⏳ PENDING'}
🔐 *OTP:* ${transaction.otpCode || 'Belum ada'}
`;

            await ctx.editMessageCaption(caption, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        transaction.status === 'pending' ? 
                            [
                                Markup.button.callback('📩 Cek Status / Kode SMS', `checksms_${orderId}`),
                                Markup.button.callback('❌ Batalkan', `cancelorder_${orderId}_${transaction.price}`)
                            ]
                        : 
                            [Markup.button.callback('🏠 Menu Utama', 'back_home')]
                    ]
                }
            });
        } catch (error: any) {
            await ctx.answerCbQuery(`Gagal memuat detail: ${error.message}`, { show_alert: true });
        }
    });

    // Menghindari error "Query is too old" ketika menekan tombol tengah (Info Halaman)
    bot.action('noop', async (ctx) => {
        await ctx.answerCbQuery();
    });
};