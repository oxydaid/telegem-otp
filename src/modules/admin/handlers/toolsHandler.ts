// src/modules/admin/handlers/toolsHandler.ts
// ==========================================
// 🛠️ ADMIN TOOLS & COMMANDS HANDLER
// ==========================================

import { Telegraf } from 'telegraf';
import { MyContext } from '../../../middlewares/guard';
import { User } from '../../../models/User';
import { Setting } from '../../../models/Setting';
import { ADMIN_CONFIG } from '../utils/constants';
import { adminGuard, parseToggle, getOrCreateSettings } from '../utils/helpers';
import { formatCurrency } from '../utils/formatters';
import { UpdaterService } from '../../../services/UpdaterService';

const backupExecutionLocks = new Set<number>();
let isUpdatingNow = false;

const normalizeChatTarget = (rawInput: string): string => {
    const input = rawInput.trim();

    if (!input) return '';

    if (input.startsWith('@')) return input;

    const match = input.match(/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([^\s/?#]+)/i);
    if (match?.[1]) {
        return `@${match[1].replace(/^@+/, '')}`;
    }

    return input;
};

/**
 * Register mode setting commands
 */
export const registerModeCommands = (bot: Telegraf<MyContext>) => {
    bot.command('self', adminGuard, async (ctx) => {
        await Setting.updateOne({}, { isSelfMode: true }, { upsert: true });
        await ctx.reply('🔒 Mode *Self* berhasil diaktifkan!\nSekarang hanya *owner* yang bisa menggunakan bot.', { parse_mode: 'Markdown' });
    });

    bot.command('public', adminGuard, async (ctx) => {
        await Setting.updateOne({}, { isSelfMode: false }, { upsert: true });
        await ctx.reply('🌍 Mode *Public* diaktifkan!\nSekarang semua user dapat menggunakan bot.', { parse_mode: 'Markdown' });
    });

    bot.command('maintenance', adminGuard, async (ctx) => {
        const isOn = parseToggle(ctx.message.text);
        await Setting.updateOne({}, { isMaintenance: isOn }, { upsert: true });
        await ctx.reply(`⚙️ Maintenance mode ${isOn ? '*aktif* ✅' : '*nonaktif* ❌'}!`, { parse_mode: 'Markdown' });
    });

    bot.command('grouponly', adminGuard, async (ctx) => {
        const isOn = parseToggle(ctx.message.text);
        await Setting.updateOne({}, { isGroupOnly: isOn }, { upsert: true });
        await ctx.reply(`👥 GroupOnly mode ${isOn ? '*aktif* ✅' : '*nonaktif* ❌'}!`, { parse_mode: 'Markdown' });
    });
};

/**
 * Backup database to JSON
 */
export const registerBackupCommand = (bot: Telegraf<MyContext>) => {
    bot.command('backup', adminGuard, async (ctx) => {
        const ownerId = ctx.from?.id;
        if (!ownerId) {
            return ctx.reply('❌ Gagal mengenali akun owner.');
        }

        if (backupExecutionLocks.has(ownerId)) {
            return;
        }

        backupExecutionLocks.add(ownerId);
        const processingMsg = await ctx.reply('🗂 Menyiapkan backup database...');

        try {
            const [users, settings, deposits, transactions] = await Promise.all([
                User.find({}).lean(),
                Setting.find({}).lean(),
                // Dynamic imports to avoid circular dependency
                (await import('../../../models/Deposit')).Deposit.find({}).lean(),
                (await import('../../../models/Transaction')).Transaction.find({}).lean()
            ]);

            const payload = {
                meta: {
                    generatedAt: new Date().toISOString(),
                    generatedBy: ctx.from?.id,
                    counts: {
                        users: users.length,
                        settings: settings.length,
                        deposits: deposits.length,
                        transactions: transactions.length
                    }
                },
                data: {
                    users,
                    settings,
                    deposits,
                    transactions
                }
            };

            const backupBuffer = Buffer.from(JSON.stringify(payload, null, 2), 'utf8');
            const maxTelegramDocSize = 45 * 1024 * 1024;

            if (backupBuffer.length > maxTelegramDocSize) {
                await ctx.reply('❌ Ukuran backup terlalu besar untuk dikirim via Telegram. Silakan lakukan backup via server.', { parse_mode: 'Markdown' });
                return;
            }

            const fileName = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

            await ctx.replyWithDocument(
                {
                    source: backupBuffer,
                    filename: fileName
                },
                {
                    caption: `✅ Backup selesai\n👥 User: ${users.length}\n⚙️ Setting: ${settings.length}\n💳 Deposit: ${deposits.length}\n🧾 Transaksi: ${transactions.length}`
                }
            );

            await bot.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id).catch(() => {});
        } catch (error: any) {
            await bot.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id).catch(() => {});
            await ctx.reply(`❌ Backup gagal: ${error.message}`);
        } finally {
            backupExecutionLocks.delete(ownerId);
        }
    });
};

/**
 * List top 20 user balance
 */
export const registerListSaldoCommand = (bot: Telegraf<MyContext>) => {
    bot.command('listsaldo', adminGuard, async (ctx) => {
        const users = await User.find({ balance: { $gt: 0 } }).lean().sort({ balance: -1 }).limit(20);
        
        if (users.length === 0) return ctx.reply('📭 Belum ada user yang memiliki saldo.');

        let text = `📋 *DAFTAR SALDO USER (Top 20)*\n\n`;
        users.forEach((u, i) => {
            const uname = u.username ? `@${u.username}` : u.fullName;
            text += `*${i+1}.* ${uname}\n🆔 \`${u.telegramId}\`\n💰 ${formatCurrency(u.balance)}\n\n`;
        });

        await ctx.reply(text, { parse_mode: 'Markdown' });
    });
};

/**
 * Add balance to user
 */
export const registerAddSaldoCommand = (bot: Telegraf<MyContext>) => {
    bot.command('addsaldo', adminGuard, async (ctx) => {
        const text = ctx.message.text;
        const args = text.split(' ');

        if (args.length < 3) {
            return ctx.reply('❗ *Format salah!*\nGunakan: `/addsaldo <id_user> <nominal>`\nContoh: `/addsaldo 123456789 5000`', { parse_mode: 'Markdown' });
        }

        const targetId = Number(args[1]);
        const amount = Number(args[2]);

        if (isNaN(targetId) || isNaN(amount) || amount <= 0) {
            return ctx.reply('❌ ID User dan Nominal harus berupa angka valid (lebih dari 0).');
        }

        try {
            const targetUser = await User.findOneAndUpdate(
                { telegramId: targetId },
                { $inc: { balance: amount } },
                { returnDocument: 'after' }
            );
            
            if (!targetUser) return ctx.reply(`❌ User dengan ID \`${targetId}\` tidak ditemukan di database.`, { parse_mode: 'Markdown' });

            const saldoAwal = targetUser.balance - amount;

            // Notifikasi ke Admin
            await ctx.reply(`✅ *Saldo Berhasil Ditambahkan!*\n\n👤 Target: \`${targetId}\`\n💵 Sebelumnya: ${formatCurrency(saldoAwal)}\n➕ Ditambah: ${formatCurrency(amount)}\n💼 Total: ${formatCurrency(targetUser.balance)}`, { parse_mode: 'Markdown' });

            // Notifikasi ke User
            await bot.telegram.sendMessage(targetId, `🎉 *Saldo Anda telah ditambahkan!*\n\n➕ Tambahan: *${formatCurrency(amount)}*\n💼 Total Sekarang: *${formatCurrency(targetUser.balance)}*`, { parse_mode: 'Markdown' }).catch(() => console.log('User memblokir bot'));

        } catch (error: any) {
            await ctx.reply(`❌ Gagal menambah saldo: ${error.message}`);
        }
    });
};

/**
 * Subtract balance from user
 */
export const registerDelSaldoCommand = (bot: Telegraf<MyContext>) => {
    bot.command('delsaldo', adminGuard, async (ctx) => {
        const args = ctx.message.text.split(' ');

        if (args.length < 3) {
            return ctx.reply('❗ *Format salah!*\nGunakan: `/delsaldo <id_user> <nominal>`', { parse_mode: 'Markdown' });
        }

        const targetId = Number(args[1]);
        const amount = Number(args[2]);

        try {
            const targetUser = await User.findOneAndUpdate(
                { telegramId: targetId, balance: { $gte: amount } },
                { $inc: { balance: -amount } },
                { returnDocument: 'after' }
            );

            if (!targetUser) {
                // Return descriptive error
                const userExists = await User.findOne({ telegramId: targetId });
                if (!userExists) return ctx.reply(`❌ User tidak ditemukan.`, { parse_mode: 'Markdown' });
                return ctx.reply(`❌ Saldo user tidak mencukupi!\nSaldo saat ini: *${formatCurrency(userExists.balance)}*`, { parse_mode: 'Markdown' });
            }

            const saldoAwal = targetUser.balance + amount;

            await ctx.reply(`✅ *Saldo Berhasil Dikurangi!*\n\n👤 Target: \`${targetId}\`\n💵 Sebelumnya: ${formatCurrency(saldoAwal)}\n➖ Dikurangi: ${formatCurrency(amount)}\n💼 Total: ${formatCurrency(targetUser.balance)}`, { parse_mode: 'Markdown' });

        } catch (error: any) {
            await ctx.reply(`❌ Gagal mengurangi saldo: ${error.message}`);
        }
    });
};

/**
 * Blacklist user
 */
export const registerBlacklistCommands = (bot: Telegraf<MyContext>) => {
    bot.command(['bluser', 'bl'], adminGuard, async (ctx) => {
        const args = ctx.message.text.split(' ');
        if (args.length < 2) return ctx.reply('❗ Format: `/bluser <id_user>`', { parse_mode: 'Markdown' });

        const targetId = Number(args[1]);

        try {
            const user = await User.findOneAndUpdate({ telegramId: targetId }, { isBlacklisted: true }, { returnDocument: 'after' });
            if (!user) return ctx.reply('❌ User tidak ditemukan.');

            await ctx.reply(`🚫 User \`${targetId}\` berhasil di-blacklist! Mereka tidak akan bisa menggunakan bot lagi.`, { parse_mode: 'Markdown' });
        } catch (error) {
            await ctx.reply('❌ Gagal melakukan blacklist.');
        }
    });

    bot.command(['unbluser', 'unbl'], adminGuard, async (ctx) => {
        const args = ctx.message.text.split(' ');
        if (args.length < 2) return ctx.reply('❗ Format: `/unbluser <id_user>`', { parse_mode: 'Markdown' });

        const targetId = Number(args[1]);

        try {
            const user = await User.findOneAndUpdate({ telegramId: targetId }, { isBlacklisted: false }, { returnDocument: 'after' });
            if (!user) return ctx.reply('❌ User tidak ditemukan.');

            await ctx.reply(`✅ User \`${targetId}\` telah dihapus dari daftar blacklist.`, { parse_mode: 'Markdown' });
        } catch (error) {
            await ctx.reply('❌ Gagal menghapus blacklist.');
        }
    });
};

/**
 * Broadcast message to all users
 */
export const registerBroadcastCommand = (bot: Telegraf<MyContext>) => {
    bot.command(['broadcast', 'bcbot'], adminGuard, async (ctx) => {
        const replyTo = ctx.message.reply_to_message;

        if (!replyTo) {
            return ctx.reply('❗ *Cara pakai:* Reply pesan yang ingin Anda broadcast, lalu ketik `/broadcast`.', { parse_mode: 'Markdown' });
        }

        const statusMsg = await ctx.reply('🚀 Memulai broadcast...');
        
        try {
            const users = await User.find({}, 'telegramId').lean();
            if (users.length === 0) return ctx.reply('⚠️ Tidak ada user terdaftar.');

            let success = 0;
            let failed = 0;

            for (let i = 0; i < users.length; i++) {
                try {
                    await bot.telegram.copyMessage(users[i].telegramId, ctx.chat.id, replyTo.message_id);
                    success++;
                } catch (err) {
                    failed++;
                }

                if ((i + 1) % 10 === 0 || i === users.length - 1) {
                    const percent = Math.floor(((i + 1) / users.length) * 100);
                    await bot.telegram.editMessageText(
                        ctx.chat.id, 
                        statusMsg.message_id, 
                        undefined, 
                        `📢 *Broadcast Berjalan...*\n🔄 Proses: *${percent}%*\n🟢 Berhasil: ${success}\n🔴 Gagal: ${failed}`, 
                        { parse_mode: 'Markdown' }
                    ).catch(() => {});
                }
                
                await new Promise(res => setTimeout(res, 50));
            }

            await ctx.reply(`✅ *Broadcast Selesai!*\n\n🟢 Berhasil: ${success}\n🔴 Gagal (Bot diblokir): ${failed}`, { parse_mode: 'Markdown' });

        } catch (error: any) {
            await ctx.reply(`❌ Terjadi kesalahan saat broadcast: ${error.message}`);
        }
    });
};

/**
 * Join group/channel by link or username
 */
export const registerJoinChatCommands = (bot: Telegraf<MyContext>) => {
    const executeJoin = async (ctx: MyContext, targetType: 'group' | 'channel') => {
        if (!ctx.message || !('text' in ctx.message)) {
            return ctx.reply('❌ Perintah hanya bisa dipakai lewat pesan teks.');
        }

        const args = ctx.message.text.split(' ').filter(Boolean);

        if (args.length < 2) {
            const commandName = targetType === 'group' ? '/joingrup' : '/joinch';
            return ctx.reply(
                `❗ *Format salah!*\nGunakan: \`${commandName} <link_atau_username>\`\nContoh: \`${commandName} https://t.me/namagrup\``,
                { parse_mode: 'Markdown' }
            );
        }

        const target = normalizeChatTarget(args[1]);
        if (!target) {
            return ctx.reply('❌ Link/username tujuan tidak valid.');
        }

        const waitingMsg = await ctx.reply('⏳ Bot sedang mencoba bergabung...');
        const chatId = ctx.chat?.id;

        try {
            const result = await (bot.telegram as any).callApi('joinChat', { chat_id: target }) as {
                id: number;
                title?: string;
                username?: string;
            };

            const title = result.title || result.username || target;
            await ctx.reply(
                `✅ Berhasil join ${targetType === 'group' ? 'grup' : 'channel'}: *${title}*\n🆔 Chat ID: \`${result.id}\``,
                { parse_mode: 'Markdown' }
            );
        } catch (error: any) {
            const reason = error?.response?.description || error?.message || 'Unknown error';
            await ctx.reply(
                `❌ Gagal join ${targetType === 'group' ? 'grup' : 'channel'}.\nAlasan: \`${reason}\`\n\nPastikan link valid dan bot diizinkan masuk.`,
                { parse_mode: 'Markdown' }
            );
        } finally {
            if (chatId) {
                await bot.telegram.deleteMessage(chatId, waitingMsg.message_id).catch(() => {});
            }
        }
    };

    bot.command(['joingrup', 'joigrup'], adminGuard, async (ctx) => {
        await executeJoin(ctx, 'group');
    });

    bot.command('joinch', adminGuard, async (ctx) => {
        await executeJoin(ctx, 'channel');
    });
};

/**
 * Check and run application update
 */
export const registerUpdaterCommands = (bot: Telegraf<MyContext>) => {
    const updaterService = new UpdaterService();

    bot.command('changelog', adminGuard, async (ctx) => {
        const loadingMsg = await ctx.reply('📘 Mengambil changelog versi saat ini...');

        try {
            const message = await updaterService.getCurrentVersionChangelogMessage();
            await ctx.reply(message, { parse_mode: 'Markdown' });
        } catch (error: any) {
            await ctx.reply(`❌ Gagal mengambil changelog: ${error.message}`);
        } finally {
            await bot.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id).catch(() => {});
        }
    });

    bot.command(['checkupdate', 'cekupdate'], adminGuard, async (ctx) => {
        const loadingMsg = await ctx.reply('🔎 Mengecek pembaruan...');

        try {
            const result = await updaterService.checkUpdate();
            await ctx.reply(result.message, { parse_mode: 'Markdown' });
        } catch (error: any) {
            await ctx.reply(`❌ Gagal mengecek pembaruan: ${error.message}`);
        } finally {
            await bot.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id).catch(() => {});
        }
    });

    bot.command('update', adminGuard, async (ctx) => {
        if (isUpdatingNow) {
            return ctx.reply('⏳ Proses update sedang berjalan. Tunggu sampai selesai.');
        }

        isUpdatingNow = true;
        const loadingMsg = await ctx.reply('⬇️ Mengunduh & menginstal update...');

        try {
            const resultMessage = await updaterService.runUpdate();
            await ctx.reply(resultMessage, { parse_mode: 'Markdown' });
        } catch (error: any) {
            await ctx.reply(`❌ Update gagal: ${error.message}`);
        } finally {
            isUpdatingNow = false;
            await bot.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id).catch(() => {});
        }
    });
};

/**
 * Register all tools handlers
 */
export const registerAllToolsHandlers = (bot: Telegraf<MyContext>) => {
    registerModeCommands(bot);
    registerBackupCommand(bot);
    registerListSaldoCommand(bot);
    registerAddSaldoCommand(bot);
    registerDelSaldoCommand(bot);
    registerBlacklistCommands(bot);
    registerBroadcastCommand(bot);
    registerJoinChatCommands(bot);
    registerUpdaterCommands(bot);
};
