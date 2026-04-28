import { Notice, requestUrl } from "obsidian";
import type LetterboxdPlugin from "./main";
import type { LetterboxdAccount } from "./types";

interface WatchlistFilm {
    id: string;
    name: string;
}

export class WatchlistSyncV2 {
    constructor(private plugin: LetterboxdPlugin) {}

    public async syncWatchlist(account: LetterboxdAccount): Promise<void> {
        new Notice(`Syncing watchlist for ${account.name}...`);

        try {
            const response = await requestUrl({ url: `https://letterboxd.com/${account.username}/watchlist/`, method: "GET" });
            const html = response.text as string;
            const matches = [...(html.matchAll(/href="\/film\/([^\/\"]+)\//g) as IterableIterator<RegExpMatchArray>)];
            const slugs = Array.from(new Set(matches.map(m => m[1])));

            const files = this.plugin.app.vault.getMarkdownFiles();
            let updatedCount = 0;

            const normalize = (s?: string) => (s || "").toString().toLowerCase().replace(/[^a-z0-9]/g, "");

            for (const slug of slugs) {
                const normSlug = normalize(slug);

                // Find all matching files
                const matchedFiles = files.filter((f) => {
                    const cache = this.plugin.app.metadataCache.getFileCache(f);
                    const fm = (cache && cache.frontmatter) || {};

                    if (fm && ((fm as any).letterboxd_id && normalize((fm as any).letterboxd_id) === normSlug)) return true;
                    if (fm && ((fm as any).letterboxd_slug && normalize((fm as any).letterboxd_slug) === normSlug)) return true;
                    if (fm && ((fm as any).tmdb_id && normalize((fm as any).tmdb_id) === normSlug)) return true;
                    if (fm && ((fm as any).imdb_id && normalize((fm as any).imdb_id) === normSlug)) return true;

                    const candidates = [ (fm && (fm as any).title) || f.basename, (fm && (fm as any).original_title) || "" ].map(normalize);
                    for (const c of candidates) {
                        if (c && (c.includes(normSlug) || normSlug.includes(c) || c === normSlug)) return true;
                    }

                    if (normalize(f.path).includes(normSlug)) return true;
                    if (normalize(f.basename).includes(normSlug)) return true;

                    return false;
                });

                if (matchedFiles.length === 0) continue;

                // If duplicates, merge
                if (matchedFiles.length > 1) {
                    // choose canonical
                    let canonical = matchedFiles.find((f) => {
                        const cache = this.plugin.app.metadataCache.getFileCache(f);
                        const fm = (cache && cache.frontmatter) || {};
                        return fm && ((fm as any).letterboxd_slug || (fm as any).tmdb_id);
                    }) || matchedFiles[0];

                    for (const dup of matchedFiles) {
                        if (dup.path === canonical.path) continue;
                        try {
                            const dupContent = await this.plugin.app.vault.read(dup);
                            const canContent = await this.plugin.app.vault.read(canonical);

                            const dupFmMatch = dupContent.match(/^---\n([\s\S]*?)\n---\n?/);
                            const canFmMatch = canContent.match(/^---\n([\s\S]*?)\n---\n?/);

                            const dupFm = dupFmMatch ? dupFmMatch[1] : "";
                            const canFm = canFmMatch ? canFmMatch[1] : "";

                            const parseFm = (s: string) => {
                                const obj: any = {};
                                s.split(/\n/).forEach(line => {
                                    const m = line.match(/^\s*([^:]+)\s*:\s*(.*)$/);
                                    if (m) {
                                        const key = m[1].trim();
                                        let val: any = m[2].trim();
                                        if (/^\[.*\]$/.test(val)) {
                                            val = val.slice(1, -1).split(',').map((x: string) => x.replace(/["'\\s]/g, '')).filter(Boolean);
                                        } else {
                                            val = val.replace(/^['\"]|['\"]$/g, '');
                                        }
                                        obj[key] = val;
                                    }
                                });
                                return obj;
                            };

                            const dupObj = parseFm(dupFm);
                            const canObj = parseFm(canFm);

                            for (const [k, v] of Object.entries(dupObj)) {
                                if (!canObj[k] || canObj[k] === "") {
                                    canObj[k] = v;
                                } else {
                                    if (Array.isArray(canObj[k]) || Array.isArray(v)) {
                                        const a = ([] as any[]).concat(canObj[k] || []);
                                        const b = ([] as any[]).concat(v || []);
                                        canObj[k] = Array.from(new Set(a.concat(b)));
                                    }
                                }
                            }

                            const ownerKey = 'letterboxd_watchlist_owners';
                            const owners = new Set((canObj[ownerKey] || []).concat(dupObj[ownerKey] || []));
                            owners.add(account.username);
                            canObj[ownerKey] = Array.from(owners);

                            const buildFm = (obj: any) => {
                                let s = '';
                                for (const [key, val] of Object.entries(obj)) {
                                    if (Array.isArray(val)) {
                                        s += `${key}: [${(val as any[]).map(x => `"${x}"`).join(', ')}]\n`;
                                    } else {
                                        s += `${key}: "${String(val).replace(/"/g, '')}"\n`;
                                    }
                                }
                                return s;
                            };

                            const canBody = canContent.replace(/^---\n([\s\S]*?)\n---\n?/, '');
                            const dupBody = dupContent.replace(/^---\n([\s\S]*?)\n---\n?/, '');

                            let mergedBody = canBody;
                            if (dupBody && dupBody.trim()) {
                                mergedBody += `\n\n---\nMerged from ${dup.path}\n---\n\n${dupBody}`;
                            }

                            const newContent = `---\n${buildFm(canObj)}---\n${mergedBody}`;
                            await this.plugin.app.vault.modify(canonical, newContent);

                            // Archive duplicate
                            const archiveFolder = '.letterboxd-duplicates';
                            try { await this.plugin.app.vault.createFolder(archiveFolder); } catch (e) { /* ignore */ }
                            const timestamp = Date.now();
                            const safeName = dup.path.replace(/[\\/:]/g, '-');
                            const destPath = `${archiveFolder}/${timestamp}-${safeName}`;
                            try {
                                await (this.plugin.app.vault as any).rename(dup, destPath);
                            } catch (e) {
                                console.warn('[Letterboxd Plugin] Could not archive duplicate', dup.path, e);
                            }

                        } catch (e) {
                            console.error('Error merging duplicate file', dup.path, e);
                        }
                    }

                    // finalize canonical
                    try {
                        const content = await this.plugin.app.vault.read(canonical);
                        const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?/);
                        let fmBody = fmMatch ? fmMatch[1] : '';

                        if (!/(^|\n)letterboxd_slug\s*:/m.test(fmBody)) {
                            fmBody += `\nletterboxd_slug: "${slug}"`;
                        }

                        const ownerKey = 'letterboxd_watchlist_owners';
                        const ownerRegex = new RegExp(`(^|\\n)${ownerKey}\\s*:\\s*\[(.*?)\]`, 'm');
                        if (ownerRegex.test(fmBody)) {
                            fmBody = fmBody.replace(ownerRegex, (match, p1, list) => {
                                const users = list.split(',').map(s => s.replace(/["'\\s]/g, ''));
                                if (!users.includes(account.username)) users.push(account.username);
                                return `\n${ownerKey}: [${users.map(u => `"${u}"`).join(', ')}]`;
                            });
                        } else if (!new RegExp(`(^|\\n)${ownerKey}\\s*:`, 'm').test(fmBody)) {
                            fmBody += `\n${ownerKey}: ["${account.username}"]`;
                        }

                        if (/(^|\n)status\s*:/m.test(fmBody)) {
                            fmBody = fmBody.replace(/(^|\n)status\s*:\s*.*/m, '\nstatus: to-watch');
                        } else {
                            fmBody += `\nstatus: to-watch`;
                        }

                        const newContent = content.replace(/^---\n([\s\S]*?)\n---\n?/, `---\n${fmBody}\n---\n`);
                        await this.plugin.app.vault.modify(canonical, newContent);

                        updatedCount++;
                    } catch (e) {
                        console.error('Error finalizing canonical file for slug', slug, e);
                    }

                } else {
                    // single file
                    const file = matchedFiles[0];
                    try {
                        const content = await this.plugin.app.vault.read(file);
                        const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?/);

                        if (fmMatch) {
                            let fmBody = fmMatch[1];

                            if (!/(^|\n)letterboxd_slug\s*:/m.test(fmBody)) {
                                fmBody += `\nletterboxd_slug: "${slug}"`;
                            }

                            const ownerKey = 'letterboxd_watchlist_owners';
                            const ownerRegex = new RegExp(`(^|\\n)${ownerKey}\\s*:\\s*\[(.*?)\]`, 'm');
                            if (ownerRegex.test(fmBody)) {
                                fmBody = fmBody.replace(ownerRegex, (match, p1, list) => {
                                    const users = list.split(',').map(s => s.replace(/["'\\s]/g, ''));
                                    if (!users.includes(account.username)) users.push(account.username);
                                    return `\n${ownerKey}: [${users.map(u => `"${u}"`).join(', ')}]`;
                                });
                            } else if (!new RegExp(`(^|\\n)${ownerKey}\\s*:`, 'm').test(fmBody)) {
                                fmBody += `\n${ownerKey}: ["${account.username}"]`;
                            }

                            if (/(^|\n)status\s*:/m.test(fmBody)) {
                                fmBody = fmBody.replace(/(^|\n)status\s*:\s*.*/m, '\nstatus: to-watch');
                            } else {
                                fmBody += `\nstatus: to-watch`;
                            }

                            const newContent = content.replace(/^---\n([\s\S]*?)\n---\n?/, `---\n${fmBody}\n---\n`);
                            await this.plugin.app.vault.modify(file, newContent);
                        } else {
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
}

export function createWatchlistSync(plugin: LetterboxdPlugin): WatchlistSyncV2 {
    return new WatchlistSyncV2(plugin);
}
