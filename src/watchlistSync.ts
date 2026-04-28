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
            // Fetch public watchlist page and parse film slugs (no API key required)
            const response = await requestUrl({ url: `https://letterboxd.com/${account.username}/watchlist/`, method: "GET" });
            const html = response.text as string;
            const matches = [...(html.matchAll(/href="\/film\/([^\/"]+)\//g) as IterableIterator<RegExpMatchArray>)];
            const slugs = Array.from(new Set(matches.map(m => m[1])));

            const files = this.plugin.app.vault.getMarkdownFiles();
            let updatedCount = 0;

            // Helper to normalize strings for comparison
            const normalize = (s?: string) => (s || "").toString().toLowerCase().replace(/[^a-z0-9]/g, "");

            for (const slug of slugs) {
                const normSlug = normalize(slug);

                // Find matching files (may be multiple) to detect duplicates
                const matchedFiles = files.filter((f) => {
                    const cache = this.plugin.app.metadataCache.getFileCache(f);
                    const fm = (cache && cache.frontmatter) || {};

                    // 1) Exact frontmatter keys commonly used
                    if (fm && ((fm as any).letterboxd_id && normalize((fm as any).letterboxd_id) === normSlug)) return true;
                    if (fm && ((fm as any).letterboxd_slug && normalize((fm as any).letterboxd_slug) === normSlug)) return true;
                    if (fm && ((fm as any).tmdb_id && normalize((fm as any).tmdb_id) === normSlug)) return true;
                    if (fm && ((fm as any).imdb_id && normalize((fm as any).imdb_id) === normSlug)) return true;

                    // 2) Compare normalized title fields
                    const candidates = [ (fm && (fm as any).title) || f.basename, (fm && (fm as any).original_title) || "" ].map(normalize);
                    for (const c of candidates) {
                        if (c && (c.includes(normSlug) || normSlug.includes(c) || c === normSlug)) return true;
                    }

                    // 3) Check file path and basename
                    if (normalize(f.path).includes(normSlug)) return true;
                    if (normalize(f.basename).includes(normSlug)) return true;

                    return false;
                });
                const file = matchedFiles.length ? matchedFiles[0] : null;

                if (file) {
                    // Read the file content and update frontmatter safely
                    try {
                        const content = await this.plugin.app.vault.read(file);
                        const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?/);

                        if (fmMatch) {
                            let fmBody = fmMatch[1];

                            // Ensure letterboxd_slug present
                            if (!/(^|\n)letterboxd_slug\s*:/m.test(fmBody)) {
                                fmBody += `\nletterboxd_slug: "${slug}"`;
                            }

                            // Track which account(s) added this to their watchlist to avoid duplicate semantics
                            const ownerKey = 'letterboxd_watchlist_owners';
                            const ownerRegex = new RegExp(`(^|\\n)${ownerKey}\\s*:\\s*\[(.*?)\]`, 'm');
                            if (ownerRegex.test(fmBody)) {
                                // Append username if not present
                                fmBody = fmBody.replace(ownerRegex, (match, p1, list) => {
                                    const users = list.split(',').map(s => s.replace(/["'\s]/g, ''));
                                    if (!users.includes(account.username)) {
                                        users.push(account.username);
                                    }
                                    return `\n${ownerKey}: [${users.map(u => `"${u}"`).join(', ')}]`;
                                });
                            } else if (!new RegExp(`(^|\\n)${ownerKey}\\s*:`,'m').test(fmBody)) {
                                fmBody += `\n${ownerKey}: ["${account.username}"]`;
                            }

                            // Ensure status is set to to-watch (replace if exists)
                            if (/(^|\n)status\s*:/m.test(fmBody)) {
                                fmBody = fmBody.replace(/(^|\n)status\s*:\s*.*/m, '\nstatus: to-watch');
                            } else {
                                fmBody += `\nstatus: to-watch`;
                            }

                            const newContent = content.replace(/^---\n([\s\S]*?)\n---\n?/, `---\n${fmBody}\n---\n`);
                            await this.plugin.app.vault.modify(file, newContent);
                        } else {
                            // No frontmatter: prepend one
                            const newContent = `---\nletterboxd_slug: "${slug}"\nstatus: to-watch\n---\n\n${content}`;
                            await this.plugin.app.vault.modify(file, newContent);
                        }

                        updatedCount++;
                    } catch (e) {
                        console.error("Error updating file for slug", slug, e);
                    }
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
