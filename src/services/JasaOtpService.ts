import axios, { AxiosInstance } from 'axios';

export interface IOtpCountry {
    id_negara: number;
    nama_negara: string;
}

export interface IOtpOperator {
    negara: number;
    operator: string;
}

export interface IOtpServicePrice {
    negara: number;
    layanan_code: string;
    layanan_name: string;
    harga: number;
    stok: number;
}

interface CachedValue<T> {
    data: T;
    expiresAt: number;
}

type LayananApiMap = Record<string, { harga: number; stok: number; layanan: string }>;

export class JasaOtpService {
    private api: AxiosInstance;
    private apiKey: string;

    private cacheCountries: CachedValue<IOtpCountry[]> = { data: [], expiresAt: 0 };
    private cacheOperators: Record<number, CachedValue<IOtpOperator[]>> = {};
    private cacheServices: Record<number, CachedValue<IOtpServicePrice[]>> = {};

    constructor() {
        const apiKey = process.env.JASAOTP_API_KEY;
        if (!apiKey) throw new Error('JASAOTP_API_KEY belum disetting di .env!');

        this.apiKey = apiKey;
        this.api = axios.create({
            baseURL: 'https://api.jasaotp.id/v2',
            timeout: 15000,
            headers: {
                Accept: 'application/json'
            }
        });
    }

    private async get(path: string, params: Record<string, string | number>, useApiKey = true) {
        const response = await this.api.get(path, {
            params: {
                ...(useApiKey ? { api_key: this.apiKey } : {}),
                ...params
            }
        });

        return response.data;
    }

    async getCountries(): Promise<IOtpCountry[]> {
        if (this.cacheCountries.expiresAt > Date.now()) return this.cacheCountries.data;

        const data = await this.get('/negara.php', {}, false);
        if (!data?.success || !Array.isArray(data?.data)) {
            throw new Error(data?.message || 'Gagal mengambil daftar negara dari Jasa OTP.');
        }

        const countries = data.data
            .map((item: any) => ({
                id_negara: Number(item.id_negara),
                nama_negara: String(item.nama_negara || '').trim()
            }))
            .filter((item: IOtpCountry) => Number.isFinite(item.id_negara) && item.nama_negara);

        this.cacheCountries = {
            data: countries,
            expiresAt: Date.now() + 10 * 60 * 1000
        };

        return countries;
    }

    async getOperators(countryId: number): Promise<IOtpOperator[]> {
        const cached = this.cacheOperators[countryId];
        if (cached && cached.expiresAt > Date.now()) return cached.data;

        const data = await this.get('/operator.php', { negara: countryId }, false);
        const operators = data?.data?.[String(countryId)];

        if (!Array.isArray(operators)) {
            throw new Error(data?.message || 'Gagal mengambil daftar operator.');
        }

        const normalized = operators
            .map((operator: any) => String(operator || '').trim().toLowerCase())
            .filter((operator: string) => !!operator)
            .map((operator: string) => ({ negara: countryId, operator }));

        this.cacheOperators[countryId] = {
            data: normalized,
            expiresAt: Date.now() + 2 * 60 * 1000
        };

        return normalized;
    }

    async getServices(countryId: number): Promise<IOtpServicePrice[]> {
        const cached = this.cacheServices[countryId];
        if (cached && cached.expiresAt > Date.now()) return cached.data;

        const data = await this.get('/layanan.php', { negara: countryId }, false);
        const map: LayananApiMap | undefined = data?.[String(countryId)];

        if (!map || typeof map !== 'object') {
            throw new Error('Gagal mengambil daftar layanan.');
        }

        const rows = Object.entries(map)
            .map(([code, value]) => ({
                negara: countryId,
                layanan_code: String(code),
                layanan_name: String(value?.layanan || code).trim(),
                harga: Number(value?.harga || 0),
                stok: Number(value?.stok || 0)
            }))
            .filter((row) => row.harga > 0 && row.stok > 0)
            .sort((a, b) => a.harga - b.harga);

        this.cacheServices[countryId] = {
            data: rows,
            expiresAt: Date.now() + 30 * 1000
        };

        return rows;
    }

    async orderNumber(countryId: number, serviceCode: string, operator: string) {
        const data = await this.get('/order.php', {
            negara: countryId,
            layanan: serviceCode,
            operator
        });

        if (!data?.success || !data?.data?.order_id) {
            throw new Error(data?.message || 'Gagal melakukan order nomor OTP.');
        }

        return {
            order_id: String(data.data.order_id),
            phone_number: String(data.data.number || ''),
            raw: data.data
        };
    }

    async checkStatus(orderId: string) {
        const data = await this.get('/sms.php', { id: orderId });
        const otp = String(data?.data?.otp || '').trim();

        if (data?.success && otp) {
            return { status: 'success', otp_code: otp };
        }

        const message = String(data?.message || '').toLowerCase();
        if (message.includes('batal') || message.includes('cancel')) {
            return { status: 'canceled', otp_code: '-' };
        }

        return { status: 'pending', otp_code: '-' };
    }

    async cancelOrder(orderId: string) {
        const data = await this.get('/cancel.php', { id: orderId });
        if (!data?.success) {
            throw new Error(data?.message || 'Gagal membatalkan pesanan.');
        }

        return data?.data;
    }

    isDepositSupported() {
        return false;
    }

    async createDeposit(_amount: number): Promise<any> {
        throw new Error('Fitur deposit otomatis tidak didukung oleh provider Jasa OTP.');
    }

    async checkDepositStatus(_depositId: string): Promise<any> {
        throw new Error('Fitur deposit otomatis tidak didukung oleh provider Jasa OTP.');
    }

    async cancelDeposit(_depositId: string): Promise<any> {
        throw new Error('Fitur deposit otomatis tidak didukung oleh provider Jasa OTP.');
    }
}
