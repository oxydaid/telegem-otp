import { Telegraf } from 'telegraf';
import { MyContext } from '../../../middlewares/guard';
import { CommunityLink, CommunityType, ICommunityLink } from '../../../models/CommunityLink';
import { adminGuard, ensureOwnerAction, safeAnswerCbQuery } from '../utils/helpers';

interface ChannelWizardState {
    type: CommunityType;
}

const wizardStates = new Map<number, ChannelWizardState>();
const PER_PAGE = 8;

const getTypeIcon = (type: CommunityType) => (type === 'channel' ? '📢' : '👥');
const getTypeLabel = (type: CommunityType) => (type === 'channel' ? 'Channel' : 'Group');

const normalizeLink = (raw: string): string | null => {
    const value = raw.trim();
    if (!value || value === '-' || value.toLowerCase() === 'none') return null;
    if (value.startsWith('https://') || value.startsWith('http://')) return value;
    if (value.startsWith('t.me/')) return `https://${value}`;
    if (value.startsWith('@')) return `https://t.me/${value.slice(1)}`;
    if (/^[a-zA-Z0-9_]{5,}$/.test(value)) return `https://t.me/${value}`;
    return null;
};

const buildListKeyboard = (items: ICommunityLink[], page: number, totalPages: number) => {
    const keyboard: Array<Array<{ text: string; callback_data: string }>> = [];

    for (const item of items) {
        const status = item.isActive ? '✅' : '❌';
        const icon = getTypeIcon(item.type);
        keyboard.push([{ text: `${status} ${icon} ${item.name}`, callback_data: `owner_channel_detail_${item._id}` }]);
    }

    const pagination: Array<{ text: string; callback_data: string }> = [];
    if (page > 1) pagination.push({ text: '⬅️ Prev', callback_data: `owner_channel_list_${page - 1}` });
    pagination.push({ text: `${page}/${totalPages}`, callback_data: 'owner_noop' });
    if (page < totalPages) pagination.push({ text: 'Next ➡️', callback_data: `owner_channel_list_${page + 1}` });
    keyboard.push(pagination);

    keyboard.push([
        { text: '➕ Tambah Channel', callback_data: 'owner_channel_add_channel' },
        { text: '➕ Tambah Group', callback_data: 'owner_channel_add_group' }
    ]);
    keyboard.push([
        { text: '🔄 Refresh', callback_data: `owner_channel_list_${page}` },
        { text: '⬅️ Kembali', callback_data: 'owner_home' }
    ]);

    return { inline_keyboard: keyboard };
};

const buildDetailKeyboard = (item: ICommunityLink) => ({
    inline_keyboard: [
        [
            {
                text: item.isActive ? '🔴 Nonaktifkan' : '🟢 Aktifkan',
                callback_data: `owner_channel_toggle_${item._id}`
            },
            { text: '🗑️ Hapus', callback_data: `owner_channel_delete_${item._id}` }
        ],
        [
            { text: '⬅️ Kembali ke List', callback_data: 'owner_channel_list_1' },
            { text: '🏠 Admin Menu', callback_data: 'owner_home' }
        ]
    ]
});

const renderChannelList = async (ctx: MyContext, page = 1, isEdit = true) => {
    const total = await CommunityLink.countDocuments();
    const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
    const currentPage = Math.min(Math.max(1, page), totalPages);

    const [items, activeChannel, activeGroup] = await Promise.all([
        CommunityLink.find({}).lean()
            .sort({ order: 1, createdAt: 1 })
            .skip((currentPage - 1) * PER_PAGE)
            .limit(PER_PAGE),
        CommunityLink.countDocuments({ type: 'channel', isActive: true }),
        CommunityLink.countDocuments({ type: 'group', isActive: true })
    ]);

    const caption = `<blockquote><b>📣 Manajemen Channel & Group</b></blockquote>

Total data: <b>${total}</b>
📢 Channel aktif: <b>${activeChannel}</b>
👥 Group aktif: <b>${activeGroup}</b>

Pilih item untuk kelola, atau tambah data baru.`;

    const reply_markup = buildListKeyboard(items, currentPage, totalPages);

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

const renderChannelDetail = async (ctx: MyContext, item: ICommunityLink) => {
    const caption = `<blockquote><b>${getTypeIcon(item.type)} ${item.name}</b></blockquote>

Tipe: <b>${getTypeLabel(item.type)}</b>
Status: <b>${item.isActive ? '✅ Aktif' : '❌ Nonaktif'}</b>
Urutan: <b>${item.order}</b>
Link: ${item.link ? `<a href="${item.link}">${item.link}</a>` : '<i>Belum diatur</i>'}
Deskripsi: ${item.description || '<i>-</i>'}`;

    const reply_markup = buildDetailKeyboard(item);

    try {
        await ctx.editMessageCaption(caption, { parse_mode: 'HTML', reply_markup });
    } catch {
        await ctx.reply(caption, { parse_mode: 'HTML', reply_markup });
    }
};

const sendAddPrompt = async (ctx: MyContext, type: CommunityType) => {
    const icon = getTypeIcon(type);
    const label = getTypeLabel(type);
    await ctx.reply(
        `${icon} <b>Tambah ${label}</b>\n\n` +
        `Kirim format:\n` +
        `<code>Nama | Link Telegram | Deskripsi (opsional)</code>\n\n` +
        `Contoh:\n` +
        `<code>Channel Testi | ${process.env.TESTI_CHANNEL_URL || 'https://t.me/testi_bot'} | Bukti transaksi user</code>\n\n` +
        `Link boleh dikosongkan pakai '-' jika belum ada.\n` +
        `Kirim /batal_channel untuk membatalkan.`,
        { parse_mode: 'HTML' }
    );
};

const processWizardInput = async (ctx: MyContext): Promise<boolean> => {
    const userId = ctx.from?.id;
    if (!userId) return false;

    const state = wizardStates.get(userId);
    if (!state) return false;

    const msg = ctx.message as { text?: string };
    if (!msg?.text) return false;

    const text = msg.text.trim();

    if (text === '/batal_channel') {
        wizardStates.delete(userId);
        await ctx.reply('❎ Proses tambah channel/group dibatalkan.');
        return true;
    }

    const parts = text.split('|').map((part) => part.trim());
    if (parts.length < 2) {
        await ctx.reply('❌ Format tidak valid. Gunakan: Nama | Link Telegram | Deskripsi (opsional)');
        return true;
    }

    const name = parts[0];
    const normalizedLink = normalizeLink(parts[1]);
    const description = parts[2] || null;

    if (!name || name.length > 80) {
        await ctx.reply('❌ Nama wajib diisi dan maksimal 80 karakter.');
        return true;
    }

    if (parts[1] !== '-' && !normalizedLink) {
        await ctx.reply('❌ Link tidak valid. Gunakan URL, @username, username, atau "-".');
        return true;
    }

    const maxOrder = await CommunityLink.findOne({}).sort({ order: -1 }).select('order');

    await CommunityLink.create({
        name,
        type: state.type,
        link: normalizedLink,
        description,
        order: (maxOrder?.order || 0) + 1,
        isActive: true,
        createdBy: userId
    });

    wizardStates.delete(userId);

    await ctx.reply(`✅ ${getTypeLabel(state.type)} "${name}" berhasil ditambahkan.`);
    return true;
};

export const registerChannelHandlers = (bot: Telegraf<MyContext>) => {
    bot.command('channel_admin', adminGuard, async (ctx) => {
        await renderChannelList(ctx, 1, false);
    });

    bot.command('batal_channel', adminGuard, async (ctx) => {
        const ownerId = ctx.from?.id;
        if (!ownerId) return;
        wizardStates.delete(ownerId);
        await ctx.reply('❎ Wizard tambah channel/group dibatalkan.');
    });

    bot.action('owner_channel_menu', async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;
        await safeAnswerCbQuery(ctx);
        await renderChannelList(ctx, 1, true);
    });

    bot.action(/^owner_channel_list_(\d+)$/, async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;
        await safeAnswerCbQuery(ctx);
        const page = Number((ctx.match as RegExpMatchArray)[1]);
        await renderChannelList(ctx, page, true);
    });

    bot.action(/^owner_channel_detail_(.+)$/, async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;
        await safeAnswerCbQuery(ctx);

        const id = (ctx.match as RegExpMatchArray)[1];
        const item = await CommunityLink.findById(id);
        if (!item) {
            await safeAnswerCbQuery(ctx, 'Data tidak ditemukan.', { show_alert: true });
            await renderChannelList(ctx, 1, true);
            return;
        }

        await renderChannelDetail(ctx, item);
    });

    bot.action(/^owner_channel_toggle_(.+)$/, async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;

        const id = (ctx.match as RegExpMatchArray)[1];
        const item = await CommunityLink.findById(id);
        if (!item) {
            await safeAnswerCbQuery(ctx, 'Data tidak ditemukan.', { show_alert: true });
            return;
        }

        item.isActive = !item.isActive;
        await item.save();

        await safeAnswerCbQuery(ctx, `Status ${item.isActive ? 'aktif' : 'nonaktif'}`);
        await renderChannelDetail(ctx, item);
    });

    bot.action(/^owner_channel_delete_(.+)$/, async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;

        const id = (ctx.match as RegExpMatchArray)[1];
        const item = await CommunityLink.findById(id);
        if (!item) {
            await safeAnswerCbQuery(ctx, 'Data tidak ditemukan.', { show_alert: true });
            return;
        }

        await CommunityLink.deleteOne({ _id: item._id });
        await safeAnswerCbQuery(ctx, `${getTypeLabel(item.type)} dihapus.`);
        await renderChannelList(ctx, 1, true);
    });

    bot.action('owner_channel_add_channel', async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;
        const ownerId = ctx.from?.id;
        if (!ownerId) return;

        wizardStates.set(ownerId, { type: 'channel' });
        await safeAnswerCbQuery(ctx);
        await sendAddPrompt(ctx, 'channel');
    });

    bot.action('owner_channel_add_group', async (ctx) => {
        if (!(await ensureOwnerAction(ctx))) return;
        const ownerId = ctx.from?.id;
        if (!ownerId) return;

        wizardStates.set(ownerId, { type: 'group' });
        await safeAnswerCbQuery(ctx);
        await sendAddPrompt(ctx, 'group');
    });

    bot.on('text', async (ctx, next) => {
        if (ctx.from?.id !== Number(process.env.OWNER_ID)) return next();

        const consumed = await processWizardInput(ctx);
        if (!consumed) return next();
    });
};