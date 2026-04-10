// src/models/Guide.ts
import mongoose, { Schema, Document } from 'mongoose';

export type GuideMediaType = 'photo' | 'video' | 'document' | 'animation' | 'audio' | 'none';

export interface IGuide extends Document {
    title: string;           // Judul panduan (tampil sebagai label button)
    content: string;         // Isi teks panduan (HTML)
    emoji: string;           // Emoji untuk button
    mediaType: GuideMediaType; // Tipe media
    mediaFileId?: string;    // Telegram file_id untuk media
    mediaCaption?: string;   // Caption untuk media (opsional)
    location?: string;       // Lokasi (opsional), teks alamat
    locationLat?: number;    // Latitude (opsional)
    locationLon?: number;    // Longitude (opsional)
    order: number;           // Urutan tampil di menu
    isActive: boolean;       // Apakah ditampilkan ke user
    createdBy: number;       // Telegram ID admin yang buat
    createdAt: Date;
    updatedAt: Date;
}

const guideSchema = new Schema<IGuide>(
    {
        title: { type: String, required: true, trim: true },
        content: { type: String, required: true },
        emoji: { type: String, default: '📖' },
        mediaType: {
            type: String,
            enum: ['photo', 'video', 'document', 'animation', 'audio', 'none'],
            default: 'none'
        },
        mediaFileId: { type: String, default: null },
        mediaCaption: { type: String, default: null },
        location: { type: String, default: null },
        locationLat: { type: Number, default: null },
        locationLon: { type: Number, default: null },
        order: { type: Number, default: 0 },
        isActive: { type: Boolean, default: true },
        createdBy: { type: Number, required: true }
    },
    { timestamps: true }
);

// Index untuk sorting cepat
guideSchema.index({ order: 1, isActive: 1 });

export const Guide = mongoose.model<IGuide>('Guide', guideSchema);
