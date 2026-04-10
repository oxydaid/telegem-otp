import { Telegraf } from 'telegraf';
import { MyContext } from '../../../middlewares/guard';
import { CommunityLink } from '../../../models/CommunityLink';

const getTypeLabel = (type: 'channel' | 'group') => (type === 'channel' ? 'Channel' : 'Group');
const getTypeIcon = (type: 'channel' | 'group') => (type === 'channel' ? '📢' : '👥');

const renderCommunityMenu = async (ctx: MyContext, isEdit = false) => {
    const communities = await CommunityLink.find({ isActive: true }).lean()
        .sort({ order: 1, createdAt: 1 })
        .limit(40);

    if (communities.length === 0) {
        const text = `<blockquote><b>📣 Channel & Group</b></blockquote>

Belum ada channel/group yang aktif saat ini.
Silakan coba lagi nanti atau hubungi admin.`;

        const reply_markup = {
            inline_keyboard: [[{ text: '⬅️ Kembali', callback_data: 'user_home' }]]
        };

        if (isEdit) {
            try {
                await ctx.editMessageCaption(text, { parse_mode: 'HTML', reply_markup });
            } catch {
                await ctx.reply(text, { parse_mode: 'HTML', reply_markup });
            }
            return;
        }

        await ctx.reply(text, { parse_mode: 'HTML', reply_markup });
        return;
    }

    let caption = `<blockquote><b>📣 Channel & Group Komunitas</b></blockquote>\n\n`;
    caption += `Temukan info terbaru dan diskusi komunitas melalui daftar berikut:\n`;

    for (const item of communities) {
        const icon = getTypeIcon(item.type);
        const typeLabel = getTypeLabel(item.type);
        const desc = item.description ? `\n<i>${item.description}</i>` : '';
        caption += `\n${icon} <b>${item.name}</b> <i>(${typeLabel})</i>${desc}\n`;
    }

    const listButtons = communities.map((item) => {
        const icon = getTypeIcon(item.type);
        if (item.link) {
            return [{ text: `${icon} ${item.name}`, url: item.link }];
        }
        return [{ text: `${icon} ${item.name} (tanpa link)`, callback_data: `user_community_nolink_${item._id}` }];
    });

    const reply_markup = {
        inline_keyboard: [
            ...listButtons,
            [
                { text: '⬅️ Kembali', callback_data: 'user_home' },
                { text: '🔄 Refresh', callback_data: 'user_community_menu' }
            ]
        ]
    };

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

export const registerCommunityUserHandlers = (bot: Telegraf<MyContext>) => {
    bot.action('user_community_menu', async (ctx) => {
        if (!ctx.dbUser) {
            await ctx.answerCbQuery('Silakan ulangi /start terlebih dahulu.', { show_alert: true });
            return;
        }

        await ctx.answerCbQuery();
        await renderCommunityMenu(ctx, true);
    });

    bot.action(/^user_community_nolink_(.+)$/, async (ctx) => {
        if (!ctx.dbUser) {
            await ctx.answerCbQuery('Silakan ulangi /start terlebih dahulu.', { show_alert: true });
            return;
        }

        await ctx.answerCbQuery('Link belum diatur oleh admin.', { show_alert: true });
    });

    bot.command('channel', async (ctx) => {
        if (!ctx.dbUser) return;
        await renderCommunityMenu(ctx, false);
    });
};