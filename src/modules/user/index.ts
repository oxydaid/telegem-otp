// src/modules/user/index.ts
// ==========================================
// 🧑 USER MODULE - MAIN ENTRY POINT
// ==========================================
// Mengatur semua handler untuk user panel

import { Telegraf } from 'telegraf';
import { MyContext } from '../../middlewares/guard';

// Import handlers
import { registerMenuHandlers } from './handlers/menuHandler';
import { registerGuideUserHandlers } from './handlers/guideUserHandler';
import { registerCommunityUserHandlers } from './handlers/communityHandler';

export default (bot: Telegraf<MyContext>) => {
    // ==========================================
    // 📋 REGISTER ALL USER HANDLERS
    // ==========================================

    // Menu Handlers (Home, Profile, History, Deposit, Leaderboard)
    registerMenuHandlers(bot);

    // Guide User Handlers (View guides, pagination)
    registerGuideUserHandlers(bot);

    // Community Handlers (Dynamic channel & group list)
    registerCommunityUserHandlers(bot);

    // ==========================================
    // ✅ User module fully initialized
    // ==========================================
};