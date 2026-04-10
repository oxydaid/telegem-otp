
# Telegem OTP Bot

Sebuah bot Telegram yang menyediakan layanan one-time password (OTP) otomatis untuk keamanan komunikasi dan autentikasi.

## Fitur Utama

- 🔐 Generasi OTP acak dan aman
- ⚡ Pengiriman instan melalui Telegram
- ⏱️ Expirasi otomatis untuk setiap kode
- 📊 Riwayat transaksi OTP
- 🔔 Notifikasi real-time
- 🛡️ Enkripsi end-to-end

## Cara Penggunaan

### Perintah Dasar

```
/start       - Mulai bot
/getotp      - Minta kode OTP baru
/history     - Lihat riwayat OTP
/settings    - Konfigurasi preferensi
/help        - Bantuan lengkap
```

### Contoh Alur

1. Ketik `/start` untuk inisialisasi
2. Gunakan `/getotp` untuk mendapatkan kode 6 digit
3. Kode berlaku selama 5 menit
4. Gunakan `/history` untuk verifikasi transaksi sebelumnya

## Arsitektur Teknis

- **Runtime**: Node.js
- **Library Bot**: Telegraf
- **Database**: MongoDB
- **Keamanan**: JWT + bcrypt

## Konfigurasi

Sesuaikan file `config.env`:

```env
BOT_TOKEN=your_telegram_token
MONGODB_URI=your_mongodb_connection
OTP_EXPIRY=300
OTP_LENGTH=6
TESTI_CHANNEL_ID=@your_channel_or_chat_id
```

Jika ingin fitur auto-send testimoni ke channel aktif, bot harus menjadi admin channel dan `TESTI_CHANNEL_ID` harus diisi. Fitur ini akan mengirim post otomatis saat deposit berhasil dan saat OTP selesai.

## Dukungan

Hubungi: [@telegem_support](https://t.me/telegem_support)
