// src/core/bot.ts
import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';

// Load env variables
dotenv.config();

const token = process.env.BOT_TOKEN;
if (!token) {
    throw new Error('BOT_TOKEN tidak ditemukan di file .env');
}

export const bot = new Telegraf(token);

// Middleware sederhana untuk log setiap pesan yang masuk
bot.use(async (ctx, next) => {
    const start = new Date().getTime();
    try {
        await next();
        const ms = new Date().getTime() - start;
        printLog(ctx, ms, true);
    } catch (err) {
        const ms = new Date().getTime() - start;
        printLog(ctx, ms, false, err);
        throw err;
    }
});

function printLog(ctx: any, ms: number, success: boolean, err?: any) {
    const user = ctx.from?.username ? `@${ctx.from.username}` : (ctx.from?.first_name || ctx.from?.id || 'Unknown');
    let action = 'Event';
    let detail = ctx.updateType;

    if (ctx.message && 'text' in ctx.message) {
        action = ctx.message.text.startsWith('/') ? 'Command' : 'Message';
        detail = ctx.message.text;
    } else if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
        action = 'Callback';
        detail = ctx.callbackQuery.data;
    }

    if (detail.length > 20) {
        detail = detail.substring(0, 17) + '...';
    }

    const time = new Date().toLocaleTimeString('id-ID', { 
        timeZone: 'Asia/Jakarta', 
        hour12: false 
    });

    const cyan = '\x1b[36m';
    const green = '\x1b[32m';
    const yellow = '\x1b[33m';
    const red = '\x1b[31m';
    const reset = '\x1b[0m';
    const bold = '\x1b[1m';
    const dim = '\x1b[2m';

    const statusIcon = success ? '✅' : '❌';
    const statusText = success ? `${green}SUCCESS${reset}` : `${red}FAILED${reset}`;
    
    let errorMsg = '';
    if (!success && err) {
        let errMsg = err instanceof Error ? err.message : String(err);
        if (errMsg.length > 30) errMsg = errMsg.substring(0, 27) + '...';
        errorMsg = `\n${red}❗ Error    : ${errMsg}${reset}`;
    }

    const log = `\n🧑 ${bold}User${reset}     : ${green}${user}${reset}\n⚡ ${bold}${action.padEnd(8, ' ')}${reset} : ${yellow}${detail}${reset}\n⏰ ${bold}Time${reset}     : ${time}${errorMsg}\n${statusIcon} ${bold}Status${reset}   : ${statusText}\n⏱️ ${bold}Latency${reset}  : ${ms}ms\n${dim}──────────────────────────────${reset}`;

    console.log(log);
}