// src/services/RumahOtpService.ts
import axios, { AxiosInstance } from 'axios';

export interface IOtpService {
    service_code: string | number;
    service_name: string;
}

export class RumahOtpService {
    private api: AxiosInstance;
    
    // In-Memory Cache dengan TTL (menggantikan cache permanen)
    private cacheServices: { data: IOtpService[], expiresAt: number } = { data: [], expiresAt: 0 }; 
    private cacheCountries: Record<string, { data: any[], expiresAt: number }> = {};
    private cacheH2hProducts: { data: any[], expiresAt: number } = { data: [], expiresAt: 0 };

    constructor() {
        const apiKey = process.env.RUMAHOTP_API_KEY;
        if (!apiKey) throw new Error("RUMAHOTP_API_KEY belum disetting di .env!");

        this.api = axios.create({
            baseURL: 'https://www.rumahotp.io/api/v2',
            headers: { 
                'x-apikey': apiKey,
                'Accept': 'application/json'
            },
            timeout: 10000 
        });
    }

    async getServices(): Promise<IOtpService[]> {
        try {
            // Cek apakah cache ada dan belum kadaluarsa (TTL 5 menit)
            if (this.cacheServices.expiresAt > Date.now()) return this.cacheServices.data;

            const response = await this.api.get('/services');
            if (response.data?.success && Array.isArray(response.data?.data)) {
                this.cacheServices = {
                    data: response.data.data,
                    expiresAt: Date.now() + 5 * 60 * 1000 // 5 menit
                }; 
                return this.cacheServices.data;
            }
            throw new Error("Format respons API tidak valid");
        } catch (error: any) {
            console.error("❌ RumahOtpService Error (getServices):", error.message);
            throw error;
        }
    }

    async getCountries(serviceId: string): Promise<any[]> {
        try {
            // Evaluasi cache spesifik per layanan, TTL 1 menit agar stok terupdate
            if (this.cacheCountries[serviceId] && this.cacheCountries[serviceId].expiresAt > Date.now()) {
                return this.cacheCountries[serviceId].data;
            }

            const response = await this.api.get(`/countries?service_id=${serviceId}`);
            if (response.data?.success && Array.isArray(response.data?.data)) {
                // Filter hanya yang ada stok dan simpan ke cache
                const available = response.data.data.filter((c: any) => c.stock_total > 0);
                this.cacheCountries[serviceId] = {
                    data: available,
                    expiresAt: Date.now() + 60 * 1000 // 1 menit (karena stok cepat berubah)
                };
                return available;
            }
            throw new Error("Gagal mengambil data negara");
        } catch (error: any) {
            console.error("❌ RumahOtpService Error (getCountries):", error.message);
            throw error;
        }
    }

    async orderNumber(numberId: string, providerId: string, operatorId: string = 'any') {
        try {
            // Endpoint untuk membeli nomor
            const response = await this.api.get(`/orders?number_id=${numberId}&provider_id=${providerId}&operator_id=${operatorId}`);
            if (response.data?.success) return response.data.data;
            throw new Error(response.data?.message || "Gagal melakukan pemesanan dari server.");
        } catch (error: any) {
            throw new Error(error.response?.data?.message || error.message);
        }
    }

    // 2. Cek Status / SMS OTP
    async checkStatus(orderId: string) {
        try {
            const response = await this.api.get(`/orders/get_status?order_id=${orderId}`);
            if (response.data?.success) return response.data.data;
            throw new Error("Gagal mengecek status pesanan.");
        } catch (error: any) {
            throw new Error(error.message);
        }
    }

    // 3. Batalkan Pesanan
    async cancelOrder(orderId: string) {
        try {
            const response = await this.api.get(`/orders/set_status?order_id=${orderId}&status=cancel`);
            if (response.data?.success) return response.data;
            throw new Error(response.data?.message || "Gagal membatalkan pesanan.");
        } catch (error: any) {
            throw new Error(error.message);
        }
    }

    // ================== DEPOSIT API ==================
    async createDeposit(amount: number) {
        try {
            const response = await this.api.get(`/deposit/create?amount=${amount}&payment_id=qris`);
            if (response.data?.success) return response.data.data;
            throw new Error(response.data?.message || "Gagal membuat QRIS.");
        } catch (error: any) {
            throw new Error(error.response?.data?.message || error.message);
        }
    }

    async checkDepositStatus(depositId: string) {
        try {
            const response = await this.api.get(`/deposit/get_status?deposit_id=${depositId}`);
            if (response.data?.success) return response.data.data;
            throw new Error(response.data?.message || "Gagal mengecek status deposit.");
        } catch (error: any) {
            throw new Error(error.message);
        }
    }

    async cancelDeposit(depositId: string) {
        try {
            const response = await axios.get(`https://www.rumahotp.io/api/v1/deposit/cancel?deposit_id=${depositId}`, {
                headers: { 'x-apikey': process.env.RUMAHOTP_API_KEY }
            });
            if (response.data?.success) return response.data.data;
            throw new Error(response.data?.message || "Gagal membatalkan deposit.");
        } catch (error: any) {
            throw new Error(error.message);
        }
    }

    async getH2hProducts() {
        try {
            if (this.cacheH2hProducts.expiresAt > Date.now()) return this.cacheH2hProducts.data;

            const response = await this.api.get('https://www.rumahotp.io/api/v1/h2h/product');
            if (response.data?.success) {
                // Urutkan otomatis dari termurah ke termahal
                const sorted = response.data.data.sort((a: any, b: any) => a.price - b.price);
                this.cacheH2hProducts = {
                    data: sorted,
                    expiresAt: Date.now() + 5 * 60 * 1000 // 5 menit
                };
                return sorted;
            }
            throw new Error("Gagal mengambil produk H2H.");
        } catch (error: any) {
            throw new Error(error.message);
        }
    }

    async createH2hTransaction(code: string, target: string) {
        try {
            const response = await this.api.get(`https://www.rumahotp.io/api/v1/h2h/transaksi/create?id=${code}&target=${target}`);
            if (response.data?.success) return response.data.data;
            throw new Error(response.data?.message || "Gagal membuat transaksi H2H.");
        } catch (error: any) {
            throw new Error(error.response?.data?.message || error.message);
        }
    }

    async checkH2hStatus(transactionId: string) {
        try {
            const response = await this.api.get(`https://www.rumahotp.io/api/v1/h2h/transaksi/status?transaksi_id=${transactionId}`);
            if (response.data?.success) return response.data.data;
            throw new Error("Gagal mengecek status H2H.");
        } catch (error: any) {
            throw new Error(error.message);
        }
    }
}