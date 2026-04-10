import { Telegraf } from 'telegraf';

type ChannelUser = {
	telegramId: number;
	fullName: string;
	username?: string | null;
};

type OtpTestiPayload = {
	user: ChannelUser;
	serviceName: string;
	countryName: string;
	operatorName?: string;
	orderId: string;
	phoneNumber: string;
	otpCode: string;
	price: number;
	createdAt?: Date;
};

type DepositTestiPayload = {
	user: ChannelUser;
	depositId: string;
	nominal: number;
	fee: number;
	received: number;
	balanceAfter: number;
	total: number;
	method?: string;
	createdAt?: Date;
};

const escapeHtml = (value: string) =>
	value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');

const formatJakartaTime = (date: Date = new Date()) => {
	return new Intl.DateTimeFormat('id-ID', {
		timeZone: 'Asia/Jakarta',
		day: '2-digit',
		month: 'short',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	}).format(date);
};

export class ChannelService {
	private bot: Telegraf<any>;
	private channelId: string | undefined;

	constructor(bot: Telegraf<any>) {
		this.bot = bot;
		this.channelId = process.env.TESTI_CHANNEL_ID || process.env.CHANNEL_ID;
	}

	isEnabled() {
		return Boolean(this.channelId);
	}

	async sendOtpTesti(payload: OtpTestiPayload) {
		if (!this.channelId) return null;

		const displayName = payload.user.username ? `@${payload.user.username}` : payload.user.fullName;
		const caption = [
			`<blockquote><b>OkeOtp Testi</b></blockquote>`,
			`<b>📣 Transaksi OTP Selesai</b>`,
			'',
			`📱 <b>Layanan:</b> ${escapeHtml(payload.serviceName)}`,
			`🌍 <b>Negara:</b> ${escapeHtml(payload.countryName)}`,
			`📡 <b>Operator:</b> ${escapeHtml(payload.operatorName || 'any')}`,
			`🆔 <b>Order ID:</b> <code>${escapeHtml(payload.orderId)}</code>`,
			`📞 <b>Nomor:</b> <code>${escapeHtml(payload.phoneNumber)}</code>`,
			`🔐 <b>Kode OTP:</b> <code>${escapeHtml(payload.otpCode)}</code>`,
			`💵 <b>Harga:</b> Rp${payload.price.toLocaleString('id-ID')}`,
			`🗓️ <b>Tanggal:</b> ${escapeHtml(formatJakartaTime(payload.createdAt))}`,
			'',
			`<b>Pembeli:</b>`,
			`• Nama: ${escapeHtml(displayName)}`,
			`• Username: ${payload.user.username ? `@${escapeHtml(payload.user.username)}` : '-'}`,
			`• ID Telegram: <code>${payload.user.telegramId}</code>`,
			'',
			`<b>🤖 Sistem Auto 24/7</b>`,
			`✅ Proses cepat &amp; aman`,
			`✅ SMS langsung masuk`,
			`✅ Refund otomatis jika gagal`,
			`🚀 Order sekarang juga!`
		].join('\n');

		return this.bot.telegram.sendMessage(this.channelId, caption, {
			parse_mode: 'HTML'
		});
	}

	async sendDepositTesti(payload: DepositTestiPayload) {
		if (!this.channelId) return null;

		const displayName = payload.user.username ? `@${payload.user.username}` : payload.user.fullName;
		const caption = [
			`<blockquote><b>OkeOtp Testi</b></blockquote>`,
			`<b>💰 Deposit OTP Berhasil!</b>`,
			'',
			`🧾 <b>ID Pembayaran:</b> <code>${escapeHtml(payload.depositId)}</code>`,
			`👤 <b>User:</b> ${escapeHtml(displayName)} (<code>${payload.user.telegramId}</code>)`,
			`💰 <b>Nominal:</b> Rp${payload.total.toLocaleString('id-ID')}`,
			`💸 <b>Biaya Admin:</b> Rp${payload.fee.toLocaleString('id-ID')}`,
			`📥 <b>Diterima:</b> Rp${payload.received.toLocaleString('id-ID')}`,
			`💳 <b>Metode:</b> ${escapeHtml(payload.method || 'QRIS')}`,
			`🗓️ <b>Tanggal:</b> ${escapeHtml(formatJakartaTime(payload.createdAt))}`,
			'',
			`<b>Saldo kamu telah ditambah Rp${payload.received.toLocaleString('id-ID')} secara otomatis!</b>`,
			`💰 <b>Saldo Saat Ini:</b> Rp${payload.balanceAfter.toLocaleString('id-ID')}`
		].join('\n');

		return this.bot.telegram.sendMessage(this.channelId, caption, {
			parse_mode: 'HTML'
		});
	}
}