// src/app.ts (Modifikasi bagian ini saja)
import { Telegraf, session } from 'telegraf';
import { bot } from './core/bot';
import { connectDB } from './infrastructure/mongodb';
import { loadModules } from './core/loader';
import { systemGuard } from './middlewares/guard';
import { BackupService } from './services/BackupService';
import { DepositChecker } from './services/DepositChecker';

const isExpiredCallbackQueryError = (error: unknown) => {
    if (!(error instanceof Error)) return false;
    const description = (error as Error & { response?: { description?: string } }).response?.description || error.message;
    const normalized = description.toLowerCase();
    return normalized.includes('query is too old')
        || normalized.includes('query id is invalid')
        || normalized.includes('response timeout expired');
};

const startApp = async () => {
    const cyan = '\x1b[36m';
    const bold = '\x1b[1m';
    const reset = '\x1b[0m';
    
    console.log(`\n${cyan}╭──────────────────────────────╮${reset}`);
    console.log(`${cyan}│${reset} 🚀 ${bold}TELEGRAM BOT STARTUP${reset}      ${cyan}│${reset}`);
    console.log(`${cyan}╰──────────────────────────────╯${reset}`);

    await connectDB();

    await bot.telegram.setMyCommands([
        { command: 'start', description: 'Tampilkan menu utama bot' },
        { command: 'ownermenu', description: 'Buka panel owner dan pengaturan bot' }
    ]).catch((error) => {
        console.warn('Gagal memperbarui daftar command Telegram:', error);
    });

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

    // Backup tetap berjalan di mode polling
    const backupService = new BackupService(bot);
    backupService.startAutoBackup(); 

    bot.launch(() => {
        console.log(`🤖 Bot berjalan mode: POLLING (@${bot.botInfo?.username})`);
        
        const depositChecker = new DepositChecker(bot);
        depositChecker.start();
        
        console.log(`\x1b[36m──────────────────────────────\x1b[0m\n`);
    });

    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
};

startApp();