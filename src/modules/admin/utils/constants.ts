// src/modules/admin/utils/constants.ts
// ==========================================
// 📋 ADMIN MODULE CONSTANTS & CONFIG
// ==========================================

export const ADMIN_CONFIG = {
    OWNER_ID: Number(process.env.OWNER_ID),
    BOT_NAME: process.env.BOT_NAME || 'Auto Order Nokos - Botz',
    BOT_DESCRIPTION: process.env.BOT_DESCRIPTION || 'Layanan automatis order nomor virtual 24/7',
    BOT_VERSION: process.env.BOT_VERSION || 'V4.0 (MongoDB Edition)',
    BOT_OWNER_NAME: process.env.BOT_OWNER_NAME || '@oxydastore',
    MENU_IMAGE_PATH: process.env.MENU_IMAGE_PATH || './assets/menu-image.jpg',
    FALLBACK_IMAGE_URL: process.env.FALLBACK_IMAGE_URL || 'https://files.catbox.moe/89uvdg.webp'
};

export const PAGINATION_CONFIG = {
    ADMIN_HISTORY_PER_PAGE: 5,
    ADMIN_USER_PER_PAGE: 5
};

export const USER_SEARCH_STATE_KEYS = {
    AWAITING_SEARCH: 'awaitingAdminUserSearch',
    SEARCH_KEYWORD: 'adminUserSearchKeyword'
};
