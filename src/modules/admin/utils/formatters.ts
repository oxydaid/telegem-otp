// src/modules/admin/utils/formatters.ts
// ==========================================
// 🎨 FORMATTING UTILITIES FOR ADMIN
// ==========================================

/**
 * Format boolean to ON/OFF indicator
 */
export const formatToggle = (value: boolean): string => (value ? 'ON ✅' : 'OFF ❌');

/**
 * Format transaction status
 */
export const formatStatusLabel = (status: 'pending' | 'success' | 'canceled'): string => {
    if (status === 'success') return '✅ SUCCESS';
    if (status === 'canceled') return '❌ CANCELED';
    return '⏳ PENDING';
};

/**
 * Format date to Indonesia timezone (WIB)
 */
export const formatTimestamp = (date: Date): string => {
    return date.toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
};

/**
 * Format user display name
 */
export const formatUserLabel = (user: any): string => {
    if (!user) return 'User tidak ditemukan';
    if (user.username) return `@${user.username} (ID: ${user.telegramId})`;
    return `${user.fullName} (ID: ${user.telegramId})`;
};

/**
 * Format currency to IDR
 */
export const formatCurrency = (amount: number): string => {
    return `Rp${Number(amount).toLocaleString('id-ID')}`;
};
