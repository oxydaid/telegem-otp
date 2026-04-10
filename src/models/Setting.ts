// src/models/Setting.ts (Tambahkan properti lastBackupAt)
import mongoose, { Schema, Document } from 'mongoose';

export interface ISetting extends Document {
    isMaintenance: boolean;
    isSelfMode: boolean;
    isGroupOnly: boolean;
    isJoinChannelRequired: boolean;
    globalCooldown: number;
    lastBackupAt: Date | null;
    backupLockUntil: Date | null;
}

const settingSchema = new Schema<ISetting>({
    isMaintenance: { type: Boolean, default: false },
    isSelfMode: { type: Boolean, default: false },
    isGroupOnly: { type: Boolean, default: false },
    isJoinChannelRequired: { type: Boolean, default: false },
    globalCooldown: { type: Number, default: 0 },
    lastBackupAt: { type: Date, default: null },
    backupLockUntil: { type: Date, default: null }
});

export const Setting = mongoose.model<ISetting>('Setting', settingSchema);
