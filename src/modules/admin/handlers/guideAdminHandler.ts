// src/modules/admin/handlers/guideAdminHandler.ts
// ==========================================
// 📖 ADMIN GUIDE MANAGEMENT HANDLER
// ==========================================
// Fitur: Tambah, hapus, toggle aktif/nonaktif, atur urutan panduan

import { Telegraf, Markup } from 'telegraf';
import { MyContext } from '../../../middlewares/guard';
import { Guide, IGuide, GuideMediaType } from '../../../models/Guide';
import {
    safeAnswerCbQuery,
    ensureOwnerAction,
    adminGuard
} from '../utils/helpers';
import { ADMIN_CONFIG } from '../utils/constants';

// ==========================================
// 🔧 SESSION STATE (untuk wizard tambah panduan)
// ==========================================
// Step tambah panduan:
// 0 = idle
// 1 = menunggu judul
// 2 = menunggu emoji
// 3 = menunggu isi konten
// 4 = menunggu media (atau skip)
// 5 = menunggu lokasi teks (atau skip)
// 6 = menunggu konfirmasi simpan

interface GuideWizardState {
    step: number;
    guideId?: string;        // Kalau sedang edit
    title?: string;
    emoji?: string;
    content?: string;
    mediaType?: GuideMediaType;
    mediaFileId?: string;
    mediaCaption?: string;
    location?: string;
    locationLat?: number;
    locationLon?: number;
}

// Map untuk menyimpan wizard state per user
const wizardStates = new Map<number, GuideWizardState>();

// ==========================================
// 🛠️ HELPER: BUILD GUIDE LIST KEYBOARD
// ==========================================
const buildGuideListKeyboard = (guides: IGuide[], page: number, totalPages: number) => {
    const keyboard: Array<Array<{ text: string; callback_data: string }>> = [];

    // Baris panduan (max 5 per halaman)
    for (const g of guides) {
        const statusIcon = g.isActive ? '✅' : '❌';
        keyboard.push([
            { text: `${statusIcon} ${g.emoji} ${g.title}`, callback_data: `guide_admin_detail_${g._id}` }
        ]);
    }

    // Pagination
    const paginationRow: Array<{ text: string; callback_data: string }> = [];
    if (page > 1) paginationRow.push({ text: '⬅️ Prev', callback_data: `guide_admin_list_${page - 1}` });
    paginationRow.push({ text: `${page}/${totalPages}`, callback_data: 'owner_noop' });
    if (page < totalPages) paginationRow.push({ text: 'Next ➡️', callback_data: `guide_admin_list_${page + 1}` });
    if (paginationRow.length > 0) keyboard.push(paginationRow);

    // Actions
    keyboard.push([
        { text: '➕ Tambah Panduan', callback_data: 'guide_admin_add' },
        { text: '⬅️ Kembali', callback_data: 'owner_home' }
    ]);

    return { inline_keyboard: keyboard };
};

// ==========================================
// 🛠️ HELPER: BUILD GUIDE DETAIL KEYBOARD
// ==========================================
const buildGuideDetailKeyboard = (guide: IGuide) => {
    const toggleText = guide.isActive ? '🔴 Nonaktifkan' : '🟢 Aktifkan';
    return {
        inline_keyboard: [
            [
                { text: toggleText, callback_data: `guide_admin_toggle_${guide._id}` },
                { text: '🗑️ Hapus', callback_data: `guide_admin_delete_${guide._id}` }
            ],
            [
                { text: '⬆️ Naikan Urutan', callback_data: `guide_admin_up_${guide._id}` },
                { text: '⬇️ Turunkan Urutan', callback_data: `guide_admin_down_${guide._id}` }
            ],
            [
                { text: '⬅️ Kembali ke Daftar', callback_data: 'guide_admin_list_1' }
            ]
        ]
    };
};

// ==========================================
// 🛠️ HELPER: FORMAT GUIDE DETAIL TEXT
// ==========================================
const formatGuideDetail = (guide: IGuide): string => {
    const statusText = guide.isActive ? '✅ Aktif' : '❌ Nonaktif';
    const mediaText = guide.mediaType !== 'none'
        ? `📎 Media: <b>${guide.mediaType}</b> (tersimpan)\n`
        : '';
    const locationText = guide.location
        ? `📍 Lokasi: <b>${guide.location}</b>\n`
        : '';

    return `<blockquote><b>${guide.emoji} ${guide.title}</b></blockquote>

📌 Status: <b>${statusText}</b>
🔢 Urutan: <b>${guide.order}</b>
${mediaText}${locationText}
<b>Isi Panduan:</b>
${guide.content}`;
};

// ==========================================
// 📋 RENDER GUIDE LIST
// ==========================================
const renderGuideAdminList = async (ctx: MyContext, page = 1, isEdit = false) => {
    const PER_PAGE = 5;
    const total = await Guide.countDocuments();
    const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
    const currentPage = Math.min(Math.max(1, page), totalPages);

    const guides = await Guide.find()
        .sort({ order: 1, createdAt: 1 })
        .skip((currentPage - 1) * PER_PAGE)
        .limit(PER_PAGE);

    const statusSummary = `✅ Aktif: ${await Guide.countDocuments({ isActive: true })}  ❌ Nonaktif: ${await Guide.countDocuments({ isActive: false })}`;

    const caption = `<blockquote><b>📖 Manajemen Panduan</b></blockquote>

Total panduan: <b>${total}</b>
${statusSummary}

Pilih panduan untuk melihat detail, atau tambah baru.`;

    const reply_markup = buildGuideListKeyboard(guides, currentPage, totalPages);

    if (isEdit) {
        try {
            await ctx.editMessageCaption(caption, { parse_mode: 'HTML', reply_markup });
        } catch {
            await ctx.reply(caption, { parse_mode: 'HTML', reply_markup });
        }
        return;
    }

    await ctx.reply(caption, { parse_mode: 'HTML', reply_markup });
};

// ==========================================
// 🔧 WIZARD: KIRIM PROMPT KE ADMIN
// ==========================================
const sendWizardPrompt = async (ctx: MyContext, state: GuideWizardState) => {
    const cancelKeyboard = Markup.inlineKeyboard([
        [Markup.button.callback('❌ Batalkan', 'guide_admin_cancel')]
    ]);

    switch (state.step) {
        case 1:
            await ctx.reply(
                `<b>📖 Tambah Panduan Baru</b>\n\nLangkah 1/5: Kirim <b>judul panduan</b> (maks 50 karakter).\nContoh: <i>Cara Deposit QRIS</i>`,
                { parse_mode: 'HTML', ...cancelKeyboard }
            );
            break;
        case 2:
            await ctx.reply(
                `✅ Judul: <b>${state.title}</b>\n\nLangkah 2/5: Kirim <b>emoji</b> untuk button panduan ini.\nContoh: <i>💳</i>\n\nKirim /skip untuk pakai emoji default 📖`,
                { parse_mode: 'HTML', ...cancelKeyboard }
            );
            break;
        case 3:
            await ctx.reply(
                `✅ Emoji: <b>${state.emoji}</b>\n\nLangkah 3/5: Kirim <b>isi konten panduan</b>.\nBisa menggunakan HTML seperti <code>&lt;b&gt;</code>, <code>&lt;i&gt;</code>, <code>&lt;code&gt;</code>.\n\nContoh:\n<i>1. Buka aplikasi\n2. Pilih QRIS\n3. Scan</i>`,
                { parse_mode: 'HTML', ...cancelKeyboard }
            );
            break;
        case 4:
            await ctx.reply(
                `✅ Konten tersimpan.\n\nLangkah 4/5: <b>Lampirkan media</b> (foto, video, dokumen, gif) jika ada.\n\n📌 Kirim file/foto/video langsung, ATAU kirim /skip untuk tanpa media.`,
                { parse_mode: 'HTML', ...cancelKeyboard }
            );
            break;
        case 5:
            await ctx.reply(
                `✅ Media ${state.mediaType !== 'none' ? `tersimpan (${state.mediaType})` : 'dilewati'}.\n\nLangkah 5/5 (Opsional): Kirim <b>informasi lokasi</b>.\nBisa kirim:\n• Teks alamat (contoh: Jl. Contoh No. 1, Jakarta)\n• Atau Share Location dari Telegram\n\nKirim /skip untuk tanpa lokasi.`,
                { parse_mode: 'HTML', ...cancelKeyboard }
            );
            break;
        case 6:
            await sendWizardPreview(ctx, state);
            break;
    }
};

// ==========================================
// 🔧 WIZARD: PREVIEW SEBELUM SIMPAN
// ==========================================
const sendWizardPreview = async (ctx: MyContext, state: GuideWizardState) => {
    const mediaText = state.mediaType !== 'none' ? `📎 Media: ${state.mediaType}\n` : '';
    const locationText = state.location ? `📍 Lokasi: ${state.location}\n` : '';

    const preview = `<blockquote><b>🔍 Preview Panduan</b></blockquote>

${state.emoji} <b>${state.title}</b>
${mediaText}${locationText}
${state.content}

---
Apakah sudah benar? Klik <b>Simpan</b> untuk menyimpan.`;

    const keyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback('✅ Simpan', 'guide_admin_wizard_save'),
            Markup.button.callback('❌ Batalkan', 'guide_admin_cancel')
        ]
    ]);

    await ctx.reply(preview, { parse_mode: 'HTML', ...keyboard });
};

// ==========================================
// 🔧 WIZARD: PROSES INPUT TEXT/MEDIA/LOCATION
// ==========================================
const processWizardInput = async (ctx: MyContext): Promise<boolean> => {
    const userId = ctx.from?.id;
    if (!userId) return false;

    const state = wizardStates.get(userId);
    if (!state || state.step === 0) return false;

    // Handle location sharing (Telegram Location)
    if ('location' in (ctx.message || {}) && state.step === 5) {
        const locMsg = ctx.message as any;
        state.locationLat = locMsg.location.latitude;
        state.locationLon = locMsg.location.longitude;
        state.location = `📍 ${locMsg.location.latitude.toFixed(4)}, ${locMsg.location.longitude.toFixed(4)}`;
        state.step = 6;
        wizardStates.set(userId, state);
        await sendWizardPrompt(ctx, state);
        return true;
    }

    // Handle media
    const msg = ctx.message as any;
    if (state.step === 4) {
        if (msg?.photo) {
            state.mediaType = 'photo';
            state.mediaFileId = msg.photo[msg.photo.length - 1].file_id;
            state.mediaCaption = msg.caption || undefined;
            state.step = 5;
            wizardStates.set(userId, state);
            await sendWizardPrompt(ctx, state);
            return true;
        }
        if (msg?.video) {
            state.mediaType = 'video';
            state.mediaFileId = msg.video.file_id;
            state.mediaCaption = msg.caption || undefined;
            state.step = 5;
            wizardStates.set(userId, state);
            await sendWizardPrompt(ctx, state);
            return true;
        }
        if (msg?.document) {
            state.mediaType = 'document';
            state.mediaFileId = msg.document.file_id;
            state.mediaCaption = msg.caption || undefined;
            state.step = 5;
            wizardStates.set(userId, state);
            await sendWizardPrompt(ctx, state);
            return true;
        }
        if (msg?.animation) {
            state.mediaType = 'animation';
            state.mediaFileId = msg.animation.file_id;
            state.step = 5;
            wizardStates.set(userId, state);
            await sendWizardPrompt(ctx, state);
            return true;
        }
        if (msg?.audio) {
            state.mediaType = 'audio';
            state.mediaFileId = msg.audio.file_id;
            state.step = 5;
            wizardStates.set(userId, state);
            await sendWizardPrompt(ctx, state);
            return true;
        }
    }

    // Handle text input
    if (!msg?.text) return false;
    const text = msg.text.trim();

    switch (state.step) {
        case 1: {
            if (text.length > 50) {
                await ctx.reply('❌ Judul terlalu panjang (maks 50 karakter). Kirim ulang.');
                return true;
            }
            state.title = text;
            state.step = 2;
            wizardStates.set(userId, state);
            await sendWizardPrompt(ctx, state);
            return true;
        }
        case 2: {
            state.emoji = text === '/skip' ? '📖' : text;
            state.step = 3;
            wizardStates.set(userId, state);
            await sendWizardPrompt(ctx, state);
            return true;
        }
        case 3: {
            if (text.length > 3000) {
                await ctx.reply('❌ Konten terlalu panjang (maks 3000 karakter). Kirim ulang.');
                return true;
            }
            state.content = text;
            state.step = 4;
            wizardStates.set(userId, state);
            await sendWizardPrompt(ctx, state);
            return true;
        }
        case 4: {
            if (text === '/skip') {
                state.mediaType = 'none';
                state.step = 5;
                wizardStates.set(userId, state);
                await sendWizardPrompt(ctx, state);
                return true;
            }
            await ctx.reply('📌 Harap kirim file/foto/video langsung, atau /skip untuk melewati.');
            return true;
        }
        case 5: {
            if (text === '/skip') {
                state.location = undefined;
            } else {
                state.location = text;
            }
            state.step = 6;
            wizardStates.set(userId, state);
            await sendWizardPrompt(ctx, state);
            return true;
        }
    }

    return false;
};

// ==========================================
// 📝 MAIN REGISTER FUNCTION
// ==========================================
export const registerGuideAdminHandlers = (bot: Telegraf<MyContext>) => {
    // ==========================================
    // 📋 COMMAND: /panduan_admin
    // ==========================================
    bot.command('panduan_admin', adminGuard, async (ctx) => {
        await renderGuideAdminList(ctx, 1, false);
    });

    // ==========================================
    // 📋 ACTION: List panduan (paginasi)
    // ==========================================
    bot.action(/^guide_admin_list_(\d+)$/, async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;
        await safeAnswerCbQuery(ctx);
        const page = parseInt((ctx.match as RegExpMatchArray)[1], 10);
        await renderGuideAdminList(ctx, page, true);
    });

    // Button dari admin home menu
    bot.action('guide_admin_menu', async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;
        await safeAnswerCbQuery(ctx);
        await renderGuideAdminList(ctx, 1, true);
    });

    // ==========================================
    // 📋 ACTION: Detail panduan
    // ==========================================
    bot.action(/^guide_admin_detail_(.+)$/, async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;
        await safeAnswerCbQuery(ctx);

        const guideId = (ctx.match as RegExpMatchArray)[1];
        const guide = await Guide.findById(guideId);
        if (!guide) {
            await safeAnswerCbQuery(ctx, '❌ Panduan tidak ditemukan.', { show_alert: true });
            return;
        }

        const caption = formatGuideDetail(guide);
        const reply_markup = buildGuideDetailKeyboard(guide);

        try {
            await ctx.editMessageCaption(caption, { parse_mode: 'HTML', reply_markup });
        } catch {
            await ctx.reply(caption, { parse_mode: 'HTML', reply_markup });
        }
    });

    // ==========================================
    // 🔄 ACTION: Toggle aktif/nonaktif panduan
    // ==========================================
    bot.action(/^guide_admin_toggle_(.+)$/, async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;

        const guideId = (ctx.match as RegExpMatchArray)[1];
        const guide = await Guide.findById(guideId);
        if (!guide) {
            await safeAnswerCbQuery(ctx, '❌ Panduan tidak ditemukan.', { show_alert: true });
            return;
        }

        guide.isActive = !guide.isActive;
        await guide.save();

        await safeAnswerCbQuery(ctx, `Panduan "${guide.title}" ${guide.isActive ? 'diaktifkan' : 'dinonaktifkan'}.`);

        const caption = formatGuideDetail(guide);
        const reply_markup = buildGuideDetailKeyboard(guide);
        try {
            await ctx.editMessageCaption(caption, { parse_mode: 'HTML', reply_markup });
        } catch {}
    });

    // ==========================================
    // 🗑️ ACTION: Hapus panduan (konfirmasi dulu)
    // ==========================================
    bot.action(/^guide_admin_delete_(.+)$/, async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;
        await safeAnswerCbQuery(ctx);

        const guideId = (ctx.match as RegExpMatchArray)[1];
        const guide = await Guide.findById(guideId);
        if (!guide) {
            await safeAnswerCbQuery(ctx, '❌ Panduan tidak ditemukan.', { show_alert: true });
            return;
        }

        const confirmKeyboard = {
            inline_keyboard: [
                [
                    { text: '✅ Ya, Hapus!', callback_data: `guide_admin_confirm_delete_${guideId}` },
                    { text: '❌ Batal', callback_data: `guide_admin_detail_${guideId}` }
                ]
            ]
        };

        try {
            await ctx.editMessageCaption(
                `⚠️ <b>Konfirmasi Hapus</b>\n\nApakah kamu yakin ingin menghapus panduan:\n<b>${guide.emoji} ${guide.title}</b>?\n\n❗ Tindakan ini tidak bisa dibatalkan.`,
                { parse_mode: 'HTML', reply_markup: confirmKeyboard }
            );
        } catch {
            await ctx.reply(
                `⚠️ Yakin hapus panduan <b>${guide.title}</b>?`,
                { parse_mode: 'HTML', reply_markup: confirmKeyboard }
            );
        }
    });

    bot.action(/^guide_admin_confirm_delete_(.+)$/, async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;

        const guideId = (ctx.match as RegExpMatchArray)[1];
        const guide = await Guide.findByIdAndDelete(guideId);
        if (!guide) {
            await safeAnswerCbQuery(ctx, '❌ Panduan tidak ditemukan.', { show_alert: true });
            return;
        }

        await safeAnswerCbQuery(ctx, `✅ Panduan "${guide.title}" berhasil dihapus.`);
        await renderGuideAdminList(ctx, 1, true);
    });

    // ==========================================
    // 🔢 ACTION: Naik/Turun urutan
    // ==========================================
    bot.action(/^guide_admin_up_(.+)$/, async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;

        const guideId = (ctx.match as RegExpMatchArray)[1];
        const guide = await Guide.findById(guideId);
        if (!guide) { await safeAnswerCbQuery(ctx, '❌ Tidak ditemukan.', { show_alert: true }); return; }

        if (guide.order > 0) {
            // Tukar dengan yang lebih tinggi (order lebih kecil)
            const prev = await Guide.findOne({ order: { $lt: guide.order } }).sort({ order: -1 });
            if (prev) {
                const temp = prev.order;
                prev.order = guide.order;
                guide.order = temp;
                await Promise.all([prev.save(), guide.save()]);
            } else {
                guide.order = Math.max(0, guide.order - 1);
                await guide.save();
            }
        }

        await safeAnswerCbQuery(ctx, '⬆️ Urutan dinaikkan.');
        const updated = await Guide.findById(guideId);
        if (updated) {
            try { await ctx.editMessageCaption(formatGuideDetail(updated), { parse_mode: 'HTML', reply_markup: buildGuideDetailKeyboard(updated) }); } catch {}
        }
    });

    bot.action(/^guide_admin_down_(.+)$/, async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;

        const guideId = (ctx.match as RegExpMatchArray)[1];
        const guide = await Guide.findById(guideId);
        if (!guide) { await safeAnswerCbQuery(ctx, '❌ Tidak ditemukan.', { show_alert: true }); return; }

        // Tukar dengan yang lebih rendah (order lebih besar)
        const next = await Guide.findOne({ order: { $gt: guide.order } }).sort({ order: 1 });
        if (next) {
            const temp = next.order;
            next.order = guide.order;
            guide.order = temp;
            await Promise.all([next.save(), guide.save()]);
        } else {
            guide.order = guide.order + 1;
            await guide.save();
        }

        await safeAnswerCbQuery(ctx, '⬇️ Urutan diturunkan.');
        const updated = await Guide.findById(guideId);
        if (updated) {
            try { await ctx.editMessageCaption(formatGuideDetail(updated), { parse_mode: 'HTML', reply_markup: buildGuideDetailKeyboard(updated) }); } catch {}
        }
    });

    // ==========================================
    // ➕ ACTION: Mulai wizard tambah panduan
    // ==========================================
    bot.action('guide_admin_add', async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;
        await safeAnswerCbQuery(ctx);

        const userId = ctx.from!.id;
        // Count existing untuk order
        const count = await Guide.countDocuments();
        wizardStates.set(userId, {
            step: 1,
            mediaType: 'none',
            order: count
        } as GuideWizardState & { order: number });

        await sendWizardPrompt(ctx, wizardStates.get(userId)!);
    });

    // ==========================================
    // ❌ ACTION: Batalkan wizard
    // ==========================================
    bot.action('guide_admin_cancel', async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;
        const userId = ctx.from!.id;
        wizardStates.delete(userId);
        await safeAnswerCbQuery(ctx, '❌ Pembuatan panduan dibatalkan.');
        await renderGuideAdminList(ctx, 1, false);
    });

    // ==========================================
    // ✅ ACTION: Simpan panduan dari wizard
    // ==========================================
    bot.action('guide_admin_wizard_save', async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;

        const userId = ctx.from!.id;
        const state = wizardStates.get(userId);
        if (!state || !state.title || !state.content) {
            await safeAnswerCbQuery(ctx, '❌ Data tidak lengkap. Ulangi dari /panduan_admin.', { show_alert: true });
            return;
        }

        try {
            const count = await Guide.countDocuments();
            await Guide.create({
                title: state.title,
                emoji: state.emoji || '📖',
                content: state.content,
                mediaType: state.mediaType || 'none',
                mediaFileId: state.mediaFileId,
                mediaCaption: state.mediaCaption,
                location: state.location,
                locationLat: state.locationLat,
                locationLon: state.locationLon,
                order: count,
                isActive: true,
                createdBy: userId
            });

            wizardStates.delete(userId);
            await safeAnswerCbQuery(ctx, `✅ Panduan "${state.title}" berhasil disimpan!`);
            await renderGuideAdminList(ctx, 1, false);
        } catch (error: any) {
            console.error('Guide save error:', error);
            await safeAnswerCbQuery(ctx, '❌ Gagal menyimpan panduan. Coba lagi.', { show_alert: true });
        }
    });

    // ==========================================
    // 💬 MESSAGE HANDLER: Wizard input processing
    // ==========================================
    // Tangkap semua pesan dari admin saat dalam wizard mode
    bot.on('message', async (ctx, next) => {
        // Hanya proses jika admin dan dalam wizard state
        if (ctx.from?.id !== ADMIN_CONFIG.OWNER_ID) return next();
        const userId = ctx.from.id;
        const state = wizardStates.get(userId);
        if (!state || state.step === 0) return next();

        const handled = await processWizardInput(ctx);
        if (!handled) return next();
    });
};
