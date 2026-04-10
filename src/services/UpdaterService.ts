// src/services/UpdaterService.ts
import axios from 'axios';
import { execFile } from 'child_process';
import { createWriteStream, promises as fs } from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import util from 'util';

const execFileAsync = util.promisify(execFile);

type UpdateCheckResult = {
    hasUpdate: boolean;
    message: string;
};

type RemoteVersionPayload = {
    version: string;
    updateZipUrl?: string;
    changelogUrl?: string;
};

export class UpdaterService {
    private readonly manifestUrl = 'https://file.oxyda.id/bototp.json';
    private readonly requestTimeoutMs = 15000;
    private readonly updaterUserAgent = 'TeleGem-Otp-Updater';

    private readonly currentVersion = this.readCurrentVersion();
    private cachedUpdateZipUrl: string | null = null;

    private extractVersionSection(changelogText: string, version: string): string | null {
        const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const sectionPattern = new RegExp(`(^|\\n)##\\s*v?${escapedVersion}[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s*v?\\d|$)`, 'i');
        const matched = changelogText.match(sectionPattern);

        if (!matched) return null;

        const heading = matched[0]
            .trim()
            .replace(/^\n+/, '');

        return heading || null;
    }

    private normalizeVersion(version: string): string {
        return version.trim().replace(/^v/i, '');
    }

    private parseVersionNumbers(version: string): number[] {
        return this.normalizeVersion(version)
            .split('.')
            .map((segment) => Number(segment.replace(/[^0-9].*$/, '')))
            .map((value) => (Number.isFinite(value) ? value : 0));
    }

    private isNewerVersion(latest: string, current: string): boolean {
        const latestParts = this.parseVersionNumbers(latest);
        const currentParts = this.parseVersionNumbers(current);
        const maxLength = Math.max(latestParts.length, currentParts.length);

        for (let i = 0; i < maxLength; i++) {
            const latestPart = latestParts[i] ?? 0;
            const currentPart = currentParts[i] ?? 0;

            if (latestPart > currentPart) return true;
            if (latestPart < currentPart) return false;
        }

        return false;
    }

    private readCurrentVersion(): string {
        const packageJsonPath = path.join(process.cwd(), 'package.json');

        try {
            const raw = require(packageJsonPath) as { version?: unknown };
            if (typeof raw.version === 'string' && raw.version.trim()) {
                return this.normalizeVersion(raw.version);
            }
        } catch {
            // Fall back ke default jika package.json tidak bisa dibaca.
        }

        return '0.0.0';
    }

    private sanitizeChangelogForCodeBlock(changelogText: string): string {
        return changelogText.replace(/```/g, "'''");
    }

    private shortenForTelegram(text: string, maxLength = 1000): string {
        if (text.length <= maxLength) return text;
        return `${text.slice(0, maxLength)}\n\n... (Baca selengkapnya di terminal)`;
    }

    private resolveAbsoluteUrl(input: string): string | undefined {
        const trimmed = input.trim();
        if (!trimmed) return undefined;

        try {
            return new URL(trimmed, this.manifestUrl).toString();
        } catch {
            return undefined;
        }
    }

    private resolveUpdateZipUrl(payload: Record<string, unknown>): string | undefined {
        const directUrl = payload.updateZipUrl;
        if (typeof directUrl !== 'string') return undefined;
        return this.resolveAbsoluteUrl(directUrl);
    }

    private parseRemoteVersionPayload(data: unknown): RemoteVersionPayload {
        if (!data || typeof data !== 'object') {
            throw new Error('Payload update tidak valid.');
        }

        const payload = data as Record<string, unknown>;
        const version = payload.version;

        if (typeof version !== 'string' || !version.trim()) {
            throw new Error('Versi terbaru tidak ditemukan di server update.');
        }

        const changelogUrl =
            typeof payload.changelogUrl === 'string'
                ? this.resolveAbsoluteUrl(payload.changelogUrl)
                : undefined;

        return {
            version: this.normalizeVersion(version),
            updateZipUrl: this.resolveUpdateZipUrl(payload),
            changelogUrl
        };
    }

    private async fetchRemoteVersionPayload(): Promise<RemoteVersionPayload> {
        const response = await axios.get(this.manifestUrl, {
            timeout: this.requestTimeoutMs,
            responseType: 'json',
            headers: {
                'User-Agent': this.updaterUserAgent
            }
        });

        return this.parseRemoteVersionPayload(response.data);
    }

    private async fetchChangelog(url: string): Promise<string> {
        try {
            const response = await axios.get(url, {
                timeout: this.requestTimeoutMs,
                responseType: 'text',
                headers: {
                    'User-Agent': this.updaterUserAgent
                }
            });

            return String(response.data || '').trim() || 'Tidak ada catatan rilis.';
        } catch {
            console.log('⚠️ Gagal menarik changelog.md, mengabaikan catatan rilis.');
            return 'Tidak ada catatan rilis.';
        }
    }

    private async readLocalChangelog(): Promise<string | null> {
        const changelogPath = path.join(process.cwd(), 'changelog.md');

        try {
            const text = await fs.readFile(changelogPath, 'utf8');
            return text.trim() || null;
        } catch {
            return null;
        }
    }

    async getCurrentVersionChangelogMessage(): Promise<string> {
        const currentVersion = this.currentVersion;
        const localChangelog = await this.readLocalChangelog();

        if (localChangelog) {
            const section = this.extractVersionSection(localChangelog, currentVersion);
            if (section) {
                const safeSection = this.sanitizeChangelogForCodeBlock(this.shortenForTelegram(section, 1500));
                return `📝 *Changelog Versi Saat Ini*\n\nVersi: *v${currentVersion}*\nSumber: *Local File*\n\n\`\`\`markdown\n${safeSection}\n\`\`\``;
            }
        }

        const remote = await this.fetchRemoteVersionPayload().catch(() => null);
        if (!remote?.changelogUrl) {
            return `⚠️ Changelog untuk versi *v${currentVersion}* tidak ditemukan.`;
        }

        const remoteText = await this.fetchChangelog(remote.changelogUrl);
        const remoteSection = this.extractVersionSection(remoteText, currentVersion);
        if (remoteSection) {
            const safeSection = this.sanitizeChangelogForCodeBlock(this.shortenForTelegram(remoteSection, 1500));
            return `📝 *Changelog Versi Saat Ini*\n\nVersi: *v${currentVersion}*\nSumber: *Remote*\n\n\`\`\`markdown\n${safeSection}\n\`\`\``;
        }

        return `⚠️ Changelog untuk versi *v${currentVersion}* tidak ditemukan.`;
    }

    async checkUpdate(): Promise<UpdateCheckResult> {
        try {
            const remote = await this.fetchRemoteVersionPayload();

            if (!this.isNewerVersion(remote.version, this.currentVersion)) {
                this.cachedUpdateZipUrl = null;
                return { hasUpdate: false, message: '✅ Bot Anda sudah berada di versi terbaru.' };
            }

            this.cachedUpdateZipUrl = remote.updateZipUrl || null;
            const changelogText = remote.changelogUrl
                ? await this.fetchChangelog(remote.changelogUrl)
                : 'Tidak ada catatan rilis.';

            console.log('\n=========================================');
            console.log(`🚀 UPDATE TERSEDIA: v${remote.version}`);
            console.log('=========================================');
            console.log(changelogText);
            console.log('=========================================\n');

            const safeChangelog = this.sanitizeChangelogForCodeBlock(this.shortenForTelegram(changelogText));
            const installHint = this.cachedUpdateZipUrl
                ? 'Ketik /update untuk menginstal.'
                : 'File update belum tersedia di server.';

            return {
                hasUpdate: true,
                message: `🚀 *Pembaruan Tersedia!*\n\nVersi Baru: *v${remote.version}*\nVersi Kamu: *v${this.currentVersion}*\n\n📝 *Changelog:*\n\`\`\`markdown\n${safeChangelog}\n\`\`\`\n\n${installHint}`
            };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Gagal terhubung ke server pembaruan: ${message}`);
        }
    }

    async runUpdate(): Promise<string> {
        let zipPath = '';

        try {
            let updateZipUrl = this.cachedUpdateZipUrl;

            if (!updateZipUrl) {
                const remote = await this.fetchRemoteVersionPayload();
                updateZipUrl = remote.updateZipUrl ?? null;
            }

            if (!updateZipUrl) {
                throw new Error('URL file update belum tersedia di server.');
            }

            zipPath = path.join(process.cwd(), `update-${Date.now()}.zip`);
            const response = await axios.get(updateZipUrl, {
                timeout: this.requestTimeoutMs,
                responseType: 'stream',
                headers: {
                    'User-Agent': this.updaterUserAgent
                }
            });

            await pipeline(response.data, createWriteStream(zipPath));
            await execFileAsync('unzip', ['-o', zipPath, '-d', process.cwd()]);

            this.cachedUpdateZipUrl = null;
            return '✅ *Update berhasil diinstal!* Jalankan restart service (PM2/systemd) agar versi baru aktif.';
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Gagal melakukan pembaruan: ${message}`);
        } finally {
            if (zipPath) {
                await fs.unlink(zipPath).catch(() => undefined);
            }
        }
    }
}