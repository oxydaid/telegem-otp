// src/scripts/restore.ts
import fs from 'fs';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Import Model Database Anda
import { User } from '../models/User';
import { Transaction } from '../models/Transaction';
import { Deposit } from '../models/Deposit';
import { Setting } from '../models/Setting';

dotenv.config();

const restoreDatabase = async () => {
    // Ambil nama file dari argumen terminal
    const args = process.argv.slice(2);
    const filename = args[0];

    if (!filename) {
        console.error('❌ Mohon sertakan path file JSON! \nContoh: pnpm restore database_dump.json');
        process.exit(1);
    }

    const filePath = path.resolve(process.cwd(), filename);

    if (!fs.existsSync(filePath)) {
        console.error(`❌ File tidak ditemukan di: ${filePath}`);
        process.exit(1);
    }

    try {
        // 1. Konek ke Database
        const uri = process.env.MONGO_URI;
        if (!uri) throw new Error("MONGO_URI tidak disetting!");
        
        await mongoose.connect(uri);
        console.log('✅ Terhubung ke MongoDB. Memulai proses RESTORE...');

        // 2. Baca dan Parse File Backup JSON
        const rawData = fs.readFileSync(filePath, 'utf-8');
        const backupData = JSON.parse(rawData);

        // 3. Peringatan & Konfirmasi Sederhana
        console.log(`⚠️  PERINGATAN: Proses ini akan MENGHAPUS data saat ini dan menggantinya dengan data backup dari tanggal ${backupData.metadata?.date || 'Unknown'}`);
        console.log('⏳ Menyuntikkan data...');

        // 4. Eksekusi Restore: Hapus (Wipe) data lama -> Masukkan data backup
        if (backupData.users && backupData.users.length > 0) {
            await User.deleteMany({});
            await User.insertMany(backupData.users);
            console.log(`✅ [Users] Berhasil merestore ${backupData.users.length} data.`);
        }

        if (backupData.transactions && backupData.transactions.length > 0) {
            await Transaction.deleteMany({});
            await Transaction.insertMany(backupData.transactions);
            console.log(`✅ [Transactions] Berhasil merestore ${backupData.transactions.length} data.`);
        }

        if (backupData.deposits && backupData.deposits.length > 0) {
            await Deposit.deleteMany({});
            await Deposit.insertMany(backupData.deposits);
            console.log(`✅ [Deposits] Berhasil merestore ${backupData.deposits.length} data.`);
        }

        console.log('🎉 PROSES RESTORE SELESAI DENGAN SUKSES!');
        process.exit(0); // Matikan skrip dengan sukses
    } catch (error: any) {
        console.error('❌ Gagal melakukan restore:', error.message);
        process.exit(1); // Matikan skrip dengan pesan error
    }
};

restoreDatabase();