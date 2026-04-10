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
bot.use((ctx, next) => {
    const start = new Date().getTime();
    return next().then(() => {
        const ms = new Date().getTime() - start;
        console.log(`[${ctx.updateType}] Response time: ${ms}ms`);
    });
});