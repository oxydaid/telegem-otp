// src/modules/otp/index.ts
import { Telegraf, Markup } from 'telegraf';
import { MyContext } from '../../middlewares/guard';
import { JasaOtpService } from '../../services/JasaOtpService';
import { Transaction } from '../../models/Transaction';
import { User } from '../../models/User';
import { ChannelService } from '../../services/ChannelService';

const PER_PAGE = 8;

const makePaginationButtons = (prefix: string, currentPage: number, totalPages: number, extraArgs = '') => {
    const buttons = [];
    if (currentPage > 1) buttons.push(Markup.button.callback('⬅️ Prev', `${prefix}_${currentPage - 1}${extraArgs}`));
    buttons.push(Markup.button.callback(`📖 Hal ${currentPage}/${totalPages}`, 'noop'));
    if (currentPage < totalPages) buttons.push(Markup.button.callback('Next ➡️', `${prefix}_${currentPage + 1}${extraArgs}`));
    return buttons;
};

const encodeValue = (value: string) => encodeURIComponent(value);
const decodeValue = (value: string) => decodeURIComponent(value);

export default (bot: Telegraf<MyContext>) => {
    const otpService = new JasaOtpService();
    const channelService = new ChannelService(bot);

    bot.action(['choose_service', /^ctry_p_(\d+)$/], async (ctx) => {
        try {
            const isPaging = !!(ctx.match && ctx.match[0].startsWith('ctry_p_'));
            const page = isPaging ? Number(ctx.match[1]) : 1;

            if (!isPaging) {
                await ctx.editMessageCaption('⏳ *Memuat daftar negara...*', { parse_mode: 'Markdown' });
            }

            const countries = await otpService.getCountries();
            const totalPages = Math.max(1, Math.ceil(countries.length / PER_PAGE));
            const safePage = Math.min(Math.max(page, 1), totalPages);
            const start = (safePage - 1) * PER_PAGE;
            const rows = countries.slice(start, start + PER_PAGE);

            const keyboard = rows.map((country) => [
                Markup.button.callback(country.nama_negara.toUpperCase(), `opr_p_1_${country.id_negara}`)
            ]);

            keyboard.push(makePaginationButtons('ctry_p', safePage, totalPages));
            keyboard.push([Markup.button.callback('🏠 Kembali Ke Menu Utama', 'back_home')]);

            await ctx.editMessageCaption(`🌍 *Pilih Negara*\n\nTotal negara tersedia: *${countries.length}*`, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });
        } catch (error: any) {
            await ctx.editMessageCaption(`❌ *Gagal memuat negara:* ${error.message}`, { parse_mode: 'Markdown' });
        }
    });

    bot.action(/^opr_p_(\d+)_(\d+)$/, async (ctx) => {
        try {
            const page = Number(ctx.match[1]);
            const countryId = Number(ctx.match[2]);

            const operators = await otpService.getOperators(countryId);
            if (operators.length === 0) {
                return ctx.editMessageCaption('⚠️ *Operator tidak tersedia untuk negara ini.*', {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[Markup.button.callback('⬅️ Kembali', 'choose_service')]] }
                });
            }

            const totalPages = Math.max(1, Math.ceil(operators.length / PER_PAGE));
            const safePage = Math.min(Math.max(page, 1), totalPages);
            const start = (safePage - 1) * PER_PAGE;
            const rows = operators.slice(start, start + PER_PAGE);

            const keyboard = rows.map((row) => [
                Markup.button.callback(row.operator.toUpperCase(), `svc_p_1_${countryId}_${encodeValue(row.operator)}`)
            ]);

            keyboard.push(makePaginationButtons('opr_p', safePage, totalPages, `_${countryId}`));
            keyboard.push([Markup.button.callback('⬅️ Kembali ke Negara', 'choose_service')]);

            await ctx.editMessageCaption('📶 *Pilih Operator*\n\nSilakan pilih operator yang ingin dipakai.', {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });
        } catch (error: any) {
            await ctx.editMessageCaption(`❌ *Gagal memuat operator:* ${error.message}`, { parse_mode: 'Markdown' });
        }
    });

    bot.action(/^svc_p_(\d+)_(\d+)_([^_]+)$/, async (ctx) => {
        try {
            const page = Number(ctx.match[1]);
            const countryId = Number(ctx.match[2]);
            const operator = decodeValue(ctx.match[3]);

            const services = await otpService.getServices(countryId);
            if (services.length === 0) {
                return ctx.editMessageCaption('⚠️ *Stok layanan di negara ini sedang kosong.*', {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[Markup.button.callback('⬅️ Kembali', `opr_p_1_${countryId}`)]] }
                });
            }

            const untungNokos = Number(process.env.UNTUNG_NOKOS) || 1000;
            const totalPages = Math.max(1, Math.ceil(services.length / PER_PAGE));
            const safePage = Math.min(Math.max(page, 1), totalPages);
            const start = (safePage - 1) * PER_PAGE;
            const rows = services.slice(start, start + PER_PAGE);

            const keyboard = rows.map((row) => {
                const finalPrice = row.harga + untungNokos;
                return [
                    Markup.button.callback(
                        `${row.layanan_name} | Rp${finalPrice.toLocaleString('id-ID')} | Stok ${row.stok}`,
                        `buy_${countryId}_${row.layanan_code}_${encodeValue(operator)}`
                    )
                ];
            });

            keyboard.push(makePaginationButtons('svc_p', safePage, totalPages, `_${countryId}_${encodeValue(operator)}`));
            keyboard.push([Markup.button.callback('⬅️ Kembali ke Operator', `opr_p_1_${countryId}`)]);

            await ctx.editMessageCaption(`📲 *Pilih Layanan OTP*\n\nOperator: *${operator}*\nTotal layanan: *${services.length}*`, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });
        } catch (error: any) {
            await ctx.editMessageCaption(`❌ *Gagal memuat layanan:* ${error.message}`, { parse_mode: 'Markdown' });
        }
    });

    bot.action(/^buy_(\d+)_([a-zA-Z0-9]+)_([^_]+)$/, async (ctx) => {
        const dbUser = ctx.dbUser;
        if (!dbUser) return;

        const countryId = Number(ctx.match[1]);
        const serviceCode = ctx.match[2];
        const operator = decodeValue(ctx.match[3]);

        try {
            await ctx.editMessageCaption('⏳ *Memproses pesanan Anda...*', { parse_mode: 'Markdown' });

            const [services, countries] = await Promise.all([
                otpService.getServices(countryId),
                otpService.getCountries()
            ]);

            const service = services.find((item) => item.layanan_code === serviceCode);
            if (!service) throw new Error('Layanan tidak tersedia atau stok habis.');

            const country = countries.find((item) => item.id_negara === countryId);
            const untungNokos = Number(process.env.UNTUNG_NOKOS) || 1000;
            const hargaFinal = service.harga + untungNokos;

            const updatedUser = await User.findOneAndUpdate(
                { _id: dbUser._id, balance: { $gte: hargaFinal } },
                { $inc: { balance: -hargaFinal } },
                { returnDocument: 'after' }
            );

            if (!updatedUser) {
                return ctx.editMessageCaption(
                    `❌ *SALDO TIDAK CUKUP*\n\nSaldo Anda: *Rp${dbUser.balance.toLocaleString('id-ID')}*\nHarga layanan: *Rp${hargaFinal.toLocaleString('id-ID')}*`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: { inline_keyboard: [[Markup.button.callback('💰 Top Up Saldo', 'topup_nokos')]] }
                    }
                );
            }

            try {
                const orderData = await otpService.orderNumber(countryId, serviceCode, operator);

                await Transaction.create({
                    user: dbUser._id,
                    orderId: orderData.order_id,
                    serviceName: service.layanan_name,
                    countryName: country?.nama_negara || `Negara ${countryId}`,
                    phoneNumber: orderData.phone_number,
                    price: hargaFinal,
                    status: 'pending'
                });

                await ctx.editMessageCaption(
                    `✅ *PESANAN BERHASIL DIBUAT*\n\n📱 *Layanan:* ${service.layanan_name}\n🌍 *Negara:* ${country?.nama_negara || countryId}\n📶 *Operator:* ${operator}\n🆔 *Order ID:* \`${orderData.order_id}\`\n📞 *Nomor:* \`${orderData.phone_number}\`\n💵 *Harga:* Rp${hargaFinal.toLocaleString('id-ID')}\n\n⏱️ *Status:* Menunggu OTP\n💰 *Sisa Saldo:* Rp${updatedUser.balance.toLocaleString('id-ID')}`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [Markup.button.callback('📩 Cek Status / Kode SMS', `checksms_${orderData.order_id}`)],
                                [Markup.button.callback('❌ Batalkan Pesanan', `cancelorder_${orderData.order_id}_${hargaFinal}`)]
                            ]
                        }
                    }
                );
            } catch (apiError: any) {
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
        
        try {
            await ctx.answerCbQuery('📡 Mengecek SMS dari server...', { show_alert: false });
            
            const data = await otpService.checkStatus(orderId);
            const otp = data.otp_code && data.otp_code !== '-' ? data.otp_code : 'Belum masuk';

            const transaction = await Transaction.findOne({ orderId }).lean();
            
            // ✅ CEK: Sudah success dan diproses
            if (transaction?.status === 'success' && transaction.channelSentAt) {
                await ctx.answerCbQuery('✅ OTP untuk pesanan ini sudah pernah diterima.', { show_alert: false });
                return;
            }

            // 🔴 CEK: Order sudah canceled (baik dari user maupun API/timeout)
            // Prevent double refund dengan check refundedAt
            if (transaction?.status === 'canceled' || data.status === 'canceled') {
                if (transaction?.refundedAt) {
                    // Sudah di-refund sebelumnya, jangan refund lagi
                    await ctx.answerCbQuery('⚠️ Pesanan sudah dibatalkan dan di-refund sebelumnya.', { show_alert: true });
                    return;
                }

                // Refund hanya jika belum pernah di-refund (IDEMPOTENCY CHECK)
                if (dbUser && transaction?.status !== 'canceled') {
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

                    if (!claimedTransaction) {
                        await ctx.answerCbQuery('⚠️ Pesanan sudah diproses sebelumnya.', { show_alert: true });
                        return;
                    }

                    const result = await User.findOneAndUpdate(
                        { _id: dbUser._id },
                        { $inc: { balance: claimedTransaction.price } },
                        { returnDocument: 'after' }
                    );

                    await ctx.editMessageCaption(`✅ *PESANAN DIBATALKAN OTOMATIS*\n\n📋 Order ID: \`${orderId}\`\n⏱️ Alasan: OTP tidak terkirim dalam 20 menit\n\n💸 *Refund:* Rp${claimedTransaction.price.toLocaleString('id-ID')}\n💰 *Saldo Terbaru:* Rp${result?.balance.toLocaleString('id-ID')}`, {
                        parse_mode: 'Markdown',
                        reply_markup: { inline_keyboard: [[Markup.button.callback('🏠 Menu Utama', 'back_home')]] }
                    });
                    return;
                } else {
                    // Sudah di-refund atau transaksi tidak ditemukan
                    await ctx.answerCbQuery('⚠️ Pesanan sudah dibatalkan.', { show_alert: true });
                    return;
                }
            }

            if (otp === 'Belum masuk') {
                const elapsedMs = transaction?.createdAt
                    ? Date.now() - new Date(transaction.createdAt).getTime()
                    : 0;
                const isTimedOut = elapsedMs >= 20 * 60 * 1000;

                if (isTimedOut && dbUser) {
                    await otpService.cancelOrder(orderId).catch(() => {});

                    const claimedTransaction = await Transaction.findOneAndUpdate(
                        { orderId, status: 'pending', refundedAt: null },
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
                        { _id: dbUser._id },
                        { $inc: { balance: claimedTransaction.price } },
                        { returnDocument: 'after' }
                    );

                    await ctx.editMessageCaption(
                        `✅ *PESANAN DIBATALKAN OTOMATIS*\n\n📋 Order ID: \`${orderId}\`\n⏱️ Alasan: Tidak ada OTP setelah 20 menit\n\n💸 *Refund:* Rp${claimedTransaction.price.toLocaleString('id-ID')}\n💰 *Saldo Terbaru:* Rp${result?.balance.toLocaleString('id-ID')}`,
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
                await channelService.sendOtpTesti({
                    user: {
                        telegramId: dbUser.telegramId,
                        fullName: dbUser.fullName,
                        username: dbUser.username
                    },
                    serviceName: transaction?.serviceName || 'OTP',
                    countryName: transaction?.countryName || '-',
                    operatorName: 'any',
                    orderId,
                    phoneNumber: transaction?.phoneNumber || '-',
                    otpCode: otp,
                    price: updatedTransaction.price,
                    createdAt: updatedTransaction.createdAt || new Date()
                }).catch(() => {});

                await Transaction.updateOne({ orderId }, { $set: { channelSentAt: new Date() } });
            }

            const successCaption = `
🎉 *OTP BERHASIL DITERIMA!* 🎉

📱 *Layanan:* ${transaction?.serviceName || 'OTP'}
📞 *Nomor:* \`${transaction?.phoneNumber || '-'}\`
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