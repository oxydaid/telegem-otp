// src/app.ts (Modifikasi bagian ini saja)
import { Telegraf, session } from 'telegraf';
import { bot } from './core/bot';
import { connectDB } from './infrastructure/mongodb';
import { loadModules } from './core/loader';
import { systemGuard } from './middlewares/guard';
import { BackupService } from './services/BackupService';

const isExpiredCallbackQueryError = (error: unknown) => {
    if (!(error instanceof Error)) return false;
    const description = (error as Error & { response?: { description?: string } }).response?.description || error.message;
    const normalized = description.toLowerCase();
    return normalized.includes('query is too old')
        || normalized.includes('query id is invalid')
        || normalized.includes('response timeout expired');
};

const startApp = async () => {
    await connectDB();

    bot.use(session());
    bot.use(systemGuard as any);
    loadModules(bot);

    bot.catch((error, ctx) => {
        if (isExpiredCallbackQueryError(error)) {
            console.warn('Ignored expired callback query:', {
                updateId: ctx.update.update_id,
                updateType: ctx.updateType
            });
            return;
        }

        console.error('Unhandled error while processing update:', {
            updateId: ctx.update.update_id,
            updateType: ctx.updateType,
            error
        });
    });

    bot.launch(() => {
        console.log(`🤖 Bot @${bot.botInfo?.username} sedang berjalan...`);

        const backupService = new BackupService(bot);
        backupService.startAutoBackup(); 
    });

    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
};

startApp();