import { Telegraf } from 'telegraf';
import { UpdaterService } from './UpdaterService';

export class UpdateMonitorService {
    private readonly updaterService = new UpdaterService();
    private readonly ownerId = Number(process.env.OWNER_ID);
    private readonly intervalMs = this.resolveIntervalMs();

    private timer: NodeJS.Timeout | null = null;
    private isChecking = false;
    private lastNotifiedVersion: string | null = null;

    constructor(private readonly bot: Telegraf) {}

    private resolveIntervalMs(): number {
        const raw = Number(process.env.UPDATE_CHECK_INTERVAL_MINUTES ?? 30);
        const minutes = Number.isFinite(raw) && raw > 0 ? raw : 30;
        return Math.max(1, Math.floor(minutes)) * 60_000;
    }

    private extractLatestVersion(updateMessage: string): string | null {
        const match = updateMessage.match(/Versi Baru:\s*\*v?([^*\n]+)\*/i);
        return match?.[1]?.trim() || null;
    }

    private async notifyOwner(message: string, source: 'startup' | 'interval'): Promise<void> {
        if (!Number.isFinite(this.ownerId) || this.ownerId <= 0) {
            return;
        }

        const sourceText = source === 'startup' ? 'Saat Startup' : 'Pengecekan Berkala';
        const finalMessage = `🔔 *Auto Check Update* (${sourceText})\n\n${message}`;
        await this.bot.telegram.sendMessage(this.ownerId, finalMessage, { parse_mode: 'Markdown' });
    }

    private async checkAndNotify(source: 'startup' | 'interval'): Promise<void> {
        if (this.isChecking) {
            return;
        }

        this.isChecking = true;

        try {
            const result = await this.updaterService.checkUpdate();

            if (result.hasUpdate) {
                const latestVersion = this.extractLatestVersion(result.message);
                const alreadyNotified = latestVersion && this.lastNotifiedVersion === latestVersion;

                if (!alreadyNotified) {
                    await this.notifyOwner(result.message, source);
                    this.lastNotifiedVersion = latestVersion || this.lastNotifiedVersion;
                }

                const loggedVersion = latestVersion ? ` v${latestVersion}` : '';
                console.log(`📣 Auto update check menemukan update${loggedVersion}.`);
            } else {
                console.log('✅ Auto update check: bot sudah versi terbaru.');
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error(`❌ Auto update check gagal (${source}): ${message}`);
        } finally {
            this.isChecking = false;
        }
    }

    start(): void {
        console.log(`🕒 Auto update check aktif tiap ${Math.floor(this.intervalMs / 60_000)} menit.`);
        void this.checkAndNotify('startup');

        this.timer = setInterval(() => {
            void this.checkAndNotify('interval');
        }, this.intervalMs);
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
}
