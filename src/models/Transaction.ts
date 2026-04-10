// src/models/Transaction.ts
import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ITransaction extends Document {
    user: Types.ObjectId; // Relasi ke ID di tabel User
    orderId: string;      // ID Order dari RumahOTP
    serviceName: string;
    countryName: string;
    phoneNumber: string;
    price: number;
    status: 'pending' | 'success' | 'canceled';
    otpCode?: string;
    channelSentAt?: Date | null;
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
    createdAt: { type: Date, default: Date.now }
});

export const Transaction = mongoose.model<ITransaction>('Transaction', transactionSchema);