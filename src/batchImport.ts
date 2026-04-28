import { Notice, normalizePath } from "obsidian";
import { ensureFolderExists } from "./utils/vault";
import type LetterboxdPlugin from "./main";
import { fetchTMDBMovie } from "./tmdb/api";
import { buildImageUrl } from "./tmdb/api";
import { renderTMDBTemplate } from "./tmdb/template";

interface ImportResult {
    title: string;
    created?: boolean;
    path?: string;
    error?: string;
}

/**
 * Simple batch import: given list of film titles (one per line), create film notes.
 * If TMDB API key available, attempts to enrich using TMDB search + details.
 * Falls back to minimal frontmatter when enrichment not available.
 */
export async function batchImportFilms(plugin: LetterboxdPlugin, lines: string[], template?: string): Promise<ImportResult[]> {
    const results: ImportResult[] = [];
    const apiKey = await plugin.getTmdbApiKey();
    const folder = normalizePath(plugin.settings.tmdbFolderPath || "Films");

    // Ensure folder exists (use shared helper)
    try {
        await ensureFolderExists(plugin, folder);
    } catch (e) {
        // If ensureFolderExists throws, log and continue — caller will see failures on create
        console.error(`Failed to ensure folder ${folder}:`, e);
    }

    for (const raw of lines) {
        const ratingMax = plugin.settings.ratingScaleMax || 10;
        const title = raw.trim();
        if (!title) continue;
        const safeName = title.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
        const filename = `${safeName}.md`;
        const filePath = `${folder}/${filename}`;

        try {
            let content = "";
            // If user chose 'minimal' template, skip TMDB enrichment entirely
            const batchChoice = (plugin.settings as any).batchImportTemplate || "tmdb";
            if (batchChoice === "minimal") {
                content = buildMinimalFrontmatter(title);
            } else if (apiKey) {
                try {
                    // Use TMDB search endpoint via plugin helper
                    const tmdbId = await (plugin as any).searchTmdbIdForTitle?.(title, apiKey, plugin.settings.tmdbLanguage);
                    if (tmdbId) {
                        const movie = await fetchTMDBMovie(tmdbId, apiKey, plugin.settings.tmdbLanguage, true);

                        // Template rendering preference: 'tmdb' or 'custom'
                        const templateChoice = (plugin.settings as any).batchImportTemplate || "tmdb";
                        const customTemplate = (plugin.settings as any).batchCustomTemplate;
                        let rendered = "";

                        if (templateChoice === "tmdb") {
                            try {
                                rendered = renderTMDBTemplate(plugin.settings.tmdbNoteTemplate, movie, { allowUnsafe: !!(plugin.settings as any).trustedTemplates });
                            } catch (e) {
                                console.warn("TMDB template render failed", e);
                                // Fall back to minimal frontmatter when template rendering fails
                                rendered = "";
                            }
                        } else if (templateChoice === "custom" && customTemplate) {
                            try {
                                rendered = renderTMDBTemplate(customTemplate, movie, { allowUnsafe: !!(plugin.settings as any).trustedTemplates });
                            } catch (e) {
                                console.warn("Custom template render failed", e);
                                rendered = "";
                            }
                        }

                        if (rendered && rendered.trim().length > 0) {
                            content = rendered;
                        } else {
                            // Build frontmatter fallback
                            const fmLines: string[] = [];
                            fmLines.push("---");
                            fmLines.push(`type: movie`);
                            fmLines.push(`status: to-watch`);
                            fmLines.push(`title_original: '${movie.originalTitle || movie.title}'`);
                            fmLines.push(`title_en: '${movie.title}'`);
                            fmLines.push(`year: ${movie.year || ""}`);
                            fmLines.push(`genres: [${movie.genres.map((g) => `'${g}'`).join(", ")} ]`);
                            fmLines.push(`countries: [${movie.productionCompanies.map((c) => `'${c}'`).join(", ")}]`);
                            fmLines.push(`languages: [${movie.spokenLanguages.map((l) => `'${l}'`).join(", ")}]`);
                            fmLines.push(`duration_minutes: ${movie.runtime || ""}`);
                            fmLines.push(`imdb_id: '${movie.imdbId || ""}'`);
                            fmLines.push(`tmdb_id: ${movie.tmdbId}`);
                            fmLines.push(`tmdb_url: '${movie.tmdbUrl}'`);
                            fmLines.push(`poster: '${movie.posterUrlM || ""}'`);
                            fmLines.push(`Imported-from-TMDB: true`);
                            // Add default rating fields with configured max
                            const ratingMax = plugin.settings.ratingScaleMax || 10;
                            fmLines.push(`rating: 0`);
                            fmLines.push(`rating_story: 0`);
                            fmLines.push(`rating_characters: 0`);
                            fmLines.push(`rating_visuals: 0`);
                            fmLines.push(`rating_soundtrack: 0`);
                            fmLines.push(`rating_emotion: 0`);
                            fmLines.push(`rating_scale_max: ${ratingMax}`);
                            fmLines.push("---\n");

                            // Basic body
                            content = fmLines.join("\n") + `# ${movie.title} (${movie.year})\n\n`;
                            if (movie.overview) {
                                content += `${movie.overview}\n\n`;
                            }

                            // Append cast list
                            if (movie.cast && movie.cast.length > 0) {
                                content += "## Cast\n\n";
                                for (let i = 0; i < Math.min(10, movie.cast.length); i++) {
                                    const actor = movie.cast[i];
                                    const role = movie.characters[i] || "";
                                    content += `- ${actor}${role ? ` as ${role}` : ""}\n`;
                                }
                                content += "\n";
                            }
                        }
                    } else {
                        // No TMDB match, fallback to minimal
                        content = buildMinimalFrontmatter(title);
                    }
                } catch (e: any) {
                    console.warn("TMDB enrichment failed for", title, e);
                    content = buildMinimalFrontmatter(title);
                }
            } else {
                content = buildMinimalFrontmatter(title);
            }

            // Create file (auto-increment filename on collision)
            const baseName = filename.replace(/\.md$/i, "");
            let targetPath = filePath;
            let counter = 1;
            while (plugin.app.vault.getAbstractFileByPath(targetPath)) {
                targetPath = `${folder}/${baseName} (${counter}).md`;
                counter++;
                if (counter > 100) break; // safety
            }

            const file = await plugin.app.vault.create(targetPath, content);
            results.push({ title, created: true, path: targetPath });
        } catch (e: any) {
            console.error("Failed to create film note for", title, e);
            results.push({ title, error: String(e) });
        }
    }

    new Notice(`Imported ${results.filter((r) => r.created).length} films`);
    return results;
}

function buildMinimalFrontmatter(title: string): string {
    return buildMinimalFrontmatterWithOptions(title, undefined, 10);
}

function buildMinimalFrontmatterWithOptions(title: string, item?: {rating?:number, status?:string, tags?:string[]}, ratingMax = 10): string {
    const safeTitle = title.replace(/'/g, "\\'");
    const r = Math.max(0, Math.min(ratingMax, item?.rating || 0));
    const status = item?.status || 'to-watch';
    const tagsLine = item && item.tags && item.tags.length > 0 ? `tags: [${item.tags.map(t => `'${t}'`).join(", ")}]\n` : `tags: ['movie']\n`;

    const fm = `---\n` +
        `type: movie\n` +
        `status: ${status}\n` +
        `title_original: '${safeTitle}'\n` +
        `title_en: '${safeTitle}'\n` +
        `year: \n` +
        `genres: []\n` +
        `countries: []\n` +
        `languages: []\n` +
        `duration_minutes: \n` +
        `poster: ''\n` +
        `rating: ${r}\n` +
        `rating_story: ${r}\n` +
        `rating_characters: ${r}\n` +
        `rating_visuals: ${r}\n` +
        `rating_soundtrack: ${r}\n` +
        `rating_emotion: ${r}\n` +
        `rating_scale_max: ${ratingMax}\n` +
        `${tagsLine}` +
        `Imported-from-Letterboxd: false\n` +
        `---\n\n` +
        `# ${safeTitle}\n\n`;
    return fm;
}

export async function batchImportFilmsFromItems(plugin: LetterboxdPlugin, items: Array<{title:string, rating?:number, status?:string, tags?:string[]}>, template?: string): Promise<ImportResult[]> {
    const results: ImportResult[] = [];
    const apiKey = await plugin.getTmdbApiKey();
    const folder = normalizePath(plugin.settings.tmdbFolderPath || "Films");

    // Ensure folder exists (use shared helper)
    try {
        await ensureFolderExists(plugin, folder);
    } catch (e) {
        console.error(`Failed to ensure folder ${folder}:`, e);
    }

    for (const item of items) {
        const title = (item.title || "").trim();
        if (!title) continue;
        const safeName = title.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
        const filename = `${safeName}.md`;
        const filePath = `${folder}/${filename}`;

        try {
            let content = "";
            const ratingMax = plugin.settings.ratingScaleMax || 10;
            // Respect 'minimal' template choice: skip TMDB enrichment if selected
            const batchChoice = (plugin.settings as any).batchImportTemplate || "tmdb";
            if (batchChoice === "minimal") {
                content = buildMinimalFrontmatterWithOptions(title, item, ratingMax);
            } else if (apiKey) {
                try {
                    const tmdbId = await (plugin as any).searchTmdbIdForTitle?.(title, apiKey, plugin.settings.tmdbLanguage);
                    if (tmdbId) {
                        const movie = await fetchTMDBMovie(tmdbId, apiKey, plugin.settings.tmdbLanguage, true);

                        // Template rendering preference: 'tmdb' or 'custom'
                        const templateChoice = (plugin.settings as any).batchImportTemplate || "tmdb";
                        const customTemplate = (plugin.settings as any).batchCustomTemplate;
                        let rendered = "";

                        if (templateChoice === "tmdb") {
                            try {
                                rendered = renderTMDBTemplate(plugin.settings.tmdbNoteTemplate, movie);
                            } catch (e) {
                                console.warn("TMDB template render failed", e);
                                rendered = "";
                            }
                        } else if (templateChoice === "custom" && customTemplate) {
                            try {
                                rendered = renderTMDBTemplate(customTemplate, movie);
                            } catch (e) {
                                console.warn("Custom template render failed", e);
                                rendered = "";
                            }
                        }

                        if (rendered && rendered.trim().length > 0) {
                            content = rendered;
                        } else {
                            // Build frontmatter fallback
                            const fmLines: string[] = [];
                            fmLines.push("---");
                            fmLines.push(`type: movie`);
                            fmLines.push(`status: ${item.status || 'to-watch'}`);
                            fmLines.push(`title_original: '${movie.originalTitle || movie.title}'`);
                            fmLines.push(`title_en: '${movie.title}'`);
                            fmLines.push(`year: ${movie.year || ""}`);
                            fmLines.push(`genres: [${movie.genres.map((g) => `'${g}'`).join(", ")} ]`);
                            fmLines.push(`countries: [${movie.productionCompanies.map((c) => `'${c}'`).join(", ")}]`);
                            fmLines.push(`languages: [${movie.spokenLanguages.map((l) => `'${l}'`).join(", ")}]`);
                            fmLines.push(`duration_minutes: ${movie.runtime || ""}`);
                            fmLines.push(`imdb_id: '${movie.imdbId || ""}'`);
                            fmLines.push(`tmdb_id: ${movie.tmdbId}`);
                            fmLines.push(`tmdb_url: '${movie.tmdbUrl}'`);
                            fmLines.push(`poster: '${movie.posterUrlM || ""}'`);
                            // Ratings
                            const r = Math.max(0, Math.min(ratingMax, item.rating || 0));
                            fmLines.push(`rating: ${r}`);
                            fmLines.push(`rating_story: ${r}`);
                            fmLines.push(`rating_characters: ${r}`);
                            fmLines.push(`rating_visuals: ${r}`);
                            fmLines.push(`rating_soundtrack: ${r}`);
                            fmLines.push(`rating_emotion: ${r}`);
                            fmLines.push(`rating_scale_max: ${ratingMax}`);
                            // Tags
                            if (item.tags && item.tags.length > 0) {
                                fmLines.push(`tags: [${item.tags.map(t => `'${t}'`).join(", ")} ]`);
                            } else {
                                fmLines.push(`tags: ['movie']`);
                            }
                            fmLines.push(`Imported-from-TMDB: true`);
                            fmLines.push("---\n");

                            // Basic body
                            content = fmLines.join("\n") + `# ${movie.title} (${movie.year})\n\n`;
                            if (movie.overview) {
                                content += `${movie.overview}\n\n`;
                            }

                            // Append cast list
                            if (movie.cast && movie.cast.length > 0) {
                                content += "## Cast\n\n";
                                for (let i = 0; i < Math.min(10, movie.cast.length); i++) {
                                    const actor = movie.cast[i];
                                    const role = movie.characters[i] || "";
                                    content += `- ${actor}${role ? ` as ${role}` : ""}\n`;
                                }
                                content += "\n";
                            }
                        }
                    } else {
                        // No TMDB match, fallback to minimal
                        content = buildMinimalFrontmatterWithOptions(title, item, ratingMax);
                    }
                } catch (e: any) {
                    console.warn("TMDB enrichment failed for", title, e);
                    content = buildMinimalFrontmatterWithOptions(title, item, ratingMax);
                }
            } else {
                content = buildMinimalFrontmatterWithOptions(title, item, ratingMax);
            }

            // Create file (auto-increment filename on collision)
            const baseName = filename.replace(/\.md$/i, "");
            let targetPath = filePath;
            let counter = 1;
            while (plugin.app.vault.getAbstractFileByPath(targetPath)) {
                targetPath = `${folder}/${baseName} (${counter}).md`;
                counter++;
                if (counter > 100) break; // safety
            }

            const file = await plugin.app.vault.create(targetPath, content);
            results.push({ title, created: true, path: targetPath });
        } catch (e: any) {
            console.error("Failed to create film note for", title, e);
            results.push({ title, error: String(e) });
        }
    }

    new Notice(`Imported ${results.filter((r) => r.created).length} films`);
    return results;
}

