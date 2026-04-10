// src/models/Deposit.ts
import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IDeposit extends Document {
    user: Types.ObjectId;
    depositId: string;
    amount: number;
    fee: number;
    total: number;
    status: 'pending' | 'success' | 'canceled';
    qrMessageId?: number;
    channelSentAt?: Date | null;
    cancelledAt?: Date | null;    // Track kapan deposit di-cancel (timeout 5 menit)
    createdAt: Date;
}

const depositSchema = new Schema<IDeposit>({
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    depositId: { type: String, required: true, unique: true },
    amount: { type: Number, required: true },
    fee: { type: Number, required: true },
    total: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'success', 'canceled'], default: 'pending' },
    qrMessageId: { type: Number, required: false },
    channelSentAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now }
});

// Adding Compound Index to optimize frequent search
depositSchema.index({ user: 1, status: 1 });

export const Deposit = mongoose.model<IDeposit>('Deposit', depositSchema);