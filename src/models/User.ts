// src/models/User.ts
import mongoose, { Schema, Document } from 'mongoose';

// Interface OOP untuk TypeScript
export interface IUser extends Document {
    telegramId: number;
    username?: string;
    fullName: string;
    balance: number;
    isBlacklisted: boolean;
    joinedAt: Date;
}

// Skema Database
const userSchema = new Schema<IUser>({
    telegramId: { type: Number, required: true, unique: true },
    username: { type: String, default: null },
    fullName: { type: String, required: true },
    balance: { type: Number, default: 0 },
    isBlacklisted: { type: Boolean, default: false },
    joinedAt: { type: Date, default: Date.now }
});

export const User = mongoose.model<IUser>('User', userSchema);