# Folder Assets

Folder ini digunakan untuk menyimpan gambar dan file lokal yang digunakan oleh bot.

## File yang Diperlukan

### `menu-image.jpg`
Gambar menu utama yang akan ditampilkan di:
- `/ownermenu` (Admin Panel)
- `/start` (User Menu)

**Ukuran yang direkomendasikan:** 800x600 px

Untuk menggunakan gambar lokal:
1. Letakkan file gambar dengan nama `menu-image.jpg` di folder ini
2. Bot akan otomatis membacanya dari `./assets/menu-image.jpg`

Jika file tidak ada, bot akan fallback ke URL default (online) untuk mencegah error.
