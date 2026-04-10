// src/models/Transaction.ts
import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ITransaction extends Document {
    user: Types.ObjectId; // Relasi ke ID di tabel User
    orderId: string;      // ID order dari provider OTP
    serviceName: string;
    countryName: string;
    phoneNumber: string;
    price: number;
    status: 'pending' | 'success' | 'canceled';
    otpCode?: string;
    channelSentAt?: Date | null;
    refundedAt?: Date | null;    // Track kapan refund terjadi (prevent double refund)
    refundedBy?: 'user' | 'api' | 'timeout'; // Track siapa yang trigger refund
    createdAt: Date;
}

const transactionSchema = new Schema<ITransaction>({
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    orderId: { type: String, required: true, unique: true },
    serviceName: { type: String, required: true },
    countryName: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    price: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'success', 'canceled'], default: 'pending' },
    otpCode: { type: String, default: null },
    channelSentAt: { type: Date, default: null },
    refundedAt: { type: Date, default: null },
    refundedBy: { type: String, enum: ['user', 'api', 'timeout'], default: null },
    createdAt: { type: Date, default: Date.now }
});

// Adding compound index to optimize finding user transactions efficiently
transactionSchema.index({ user: 1, status: 1 });

export const Transaction = mongoose.model<ITransaction>('Transaction', transactionSchema);