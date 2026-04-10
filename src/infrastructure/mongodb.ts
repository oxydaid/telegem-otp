// src/infrastructure/mongodb.ts
import mongoose from 'mongoose';

export const connectDB = async () => {
    try {
        const uri = process.env.MONGO_URI;
        if (!uri) throw new Error("MONGO_URI tidak ditemukan di file .env");

        await mongoose.connect(uri, {
            maxPoolSize: 100, // Membantu memproses update massal concurrent bersamaan (hingga 100 socket TCP koneksi mandiri paralel)
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });
        console.log('✅ MongoDB berhasil terhubung dengan Maximum Pool Size (100)!');
    } catch (error) {
        console.error('❌ Gagal terhubung ke MongoDB:', error);
        // Matikan proses jika database gagal konek, karena bot tidak bisa jalan tanpanya
        process.exit(1); 
    }
};