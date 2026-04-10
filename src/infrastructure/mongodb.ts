// src/infrastructure/mongodb.ts
import mongoose from 'mongoose';

export const connectDB = async () => {
    try {
        const uri = process.env.MONGO_URI;
        if (!uri) throw new Error("MONGO_URI tidak ditemukan di file .env");

        await mongoose.connect(uri);
        console.log('✅ MongoDB berhasil terhubung!');
    } catch (error) {
        console.error('❌ Gagal terhubung ke MongoDB:', error);
        // Matikan proses jika database gagal konek, karena bot tidak bisa jalan tanpanya
        process.exit(1); 
    }
};