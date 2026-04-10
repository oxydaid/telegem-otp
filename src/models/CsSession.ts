// src/models/CsSession.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface ICsSession extends Document {
    userId: number;           // ID Telegram User
    isActive: boolean;        // Apakah sesi masih berjalan?
    startedAt: Date;
    lastMessageAt: Date;
}

const csSessionSchema = new Schema<ICsSession>({
    userId: { type: Number, required: true, unique: true },
    isActive: { type: Boolean, default: false },
    startedAt: { type: Date, default: Date.now },
    lastMessageAt: { type: Date, default: Date.now }
});

export const CsSession = mongoose.model<ICsSession>('CsSession', csSessionSchema);

// ---

// Model terpisah untuk melacak mapping Message ID agar Admin bisa membalas dengan Reply
export interface ICsMessageMap extends Document {
    adminMessageId: number; // ID Pesan di chat Admin
    userId: number;         // ID Telegram User pengirim aslinya
}

const csMessageMapSchema = new Schema<ICsMessageMap>({
    adminMessageId: { type: Number, required: true, unique: true },
    userId: { type: Number, required: true }
});

export const CsMessageMap = mongoose.model<ICsMessageMap>('CsMessageMap', csMessageMapSchema);