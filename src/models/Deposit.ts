// src/models/Deposit.ts
import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IDeposit extends Document {
    user: Types.ObjectId;
    depositId: string;
    amount: number;
    fee: number;
    total: number;
    status: 'pending' | 'success' | 'canceled';
    channelSentAt?: Date | null;
    createdAt: Date;
}

const depositSchema = new Schema<IDeposit>({
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    depositId: { type: String, required: true, unique: true },
    amount: { type: Number, required: true },
    fee: { type: Number, required: true },
    total: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'success', 'canceled'], default: 'pending' },
    channelSentAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now }
});

export const Deposit = mongoose.model<IDeposit>('Deposit', depositSchema);