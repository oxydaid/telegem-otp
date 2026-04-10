// src/modules/admin/index.ts
// ==========================================
// 📋 ADMIN MODULE - MAIN ENTRY POINT
// ==========================================
// Mengatur semua handler untuk admin panel

import { Telegraf } from 'telegraf';
import { MyContext } from '../../middlewares/guard';

// Import handlers
import { registerMenuHandlers } from './handlers/menuHandler';
import { registerUserHandlers } from './handlers/userHandler';
import { registerHistoryHandlers } from './handlers/historyHandler';
import { registerAllToolsHandlers } from './handlers/toolsHandler';
import { registerChannelHandlers } from './handlers/channelHandler';
import { registerGuideAdminHandlers } from './handlers/guideAdminHandler';

export default (bot: Telegraf<MyContext>) => {
    // ==========================================
    // 📋 REGISTER ALL ADMIN HANDLERS
    // ==========================================
    
    // Menu Handlers (Home, Mode, Stats, Balance, Tools, Toggle settings)
    registerMenuHandlers(bot);

    // User Management Handlers (List, Search, Pagination, Balance check)
    registerUserHandlers(bot);

    // Transaction History Handlers (Service & Deposit history with pagination)
    registerHistoryHandlers(bot);

    // Tools & Commands (Saldo management, Broadcast, Backup, Blacklist, etc)
    registerAllToolsHandlers(bot);

    // Community Management Handlers (Channel/Group dynamic list)
    registerChannelHandlers(bot);

    // Guide Management Handlers (CRUD, reorder, wizard)
    registerGuideAdminHandlers(bot);

    // ==========================================
    // ✅ Admin module fully initialized
    // ==========================================
};
