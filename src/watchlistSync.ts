import { Notice, requestUrl } from "obsidian";
import type LetterboxdPlugin from "./main";
import type { LetterboxdAccount } from "./types";

interface WatchlistFilm {
    id: string; // LID
    name: string;
}

interface WatchlistResponse {
    items: WatchlistFilm[];
}

export class WatchlistSync {
    constructor(private plugin: LetterboxdPlugin) {}

    public async syncWatchlist(account: LetterboxdAccount): Promise<void> {
        new Notice(`Syncing watchlist for ${account.name}...`);
        
        try {
            const apiKey = await this.plugin.app.vault.getSecret(`letterboxd-api-key-${account.username}`);
            if (!apiKey) {
                new Notice(`No API key found for ${account.name}. Please add it in the settings.`);
                return;
            }

            const memberId = await this.getMemberId(account.username);
            if (!memberId) {
                new Notice(`Could not find member ID for ${account.username}.`);
                return;
            }
            
            const response = await requestUrl({
                url: `https://api.letterboxd.com/api/v0/member/${memberId}/watchlist`,
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
            });
            
            const watchlist = response.json as WatchlistResponse;

            const files = this.plugin.app.vault.getMarkdownFiles();
            let updatedCount = 0;

            for (const film of watchlist.items) {
                const file = files.find(f => {
                    const cache = this.plugin.app.metadataCache.getFileCache(f);
                    return cache?.frontmatter?.letterboxd_id === film.id; // Assuming `letterboxd_id` in frontmatter
                });

                if (file) {
                    await this.plugin.app.vault.process(file, (data) => {
                        return data.replace(/status: .*/, "status: to-watch");
                    });
                    updatedCount++;
                }
            }
            
            new Notice(`Watchlist for ${account.name} synced. Updated ${updatedCount} films.`);

        } catch (error) {
            new Notice(`Failed to sync watchlist for ${account.name}.`);
            console.error(error);
        }
    }

    private async getMemberId(username: string): Promise<string | null> {
        try {
            const response = await requestUrl({
                url: `https://letterboxd.com/${username}/`,
                method: "HEAD",
            });
            return response.headers["x-letterboxd-identifier"] || null;
        } catch (error) {
            console.error(`Could not get member ID for ${username}`, error);
            return null;
        }
    }
}

export function createWatchlistSync(plugin: LetterboxdPlugin): WatchlistSync {
    return new WatchlistSync(plugin);
}
