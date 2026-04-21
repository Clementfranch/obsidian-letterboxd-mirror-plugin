import { App, TFolder, TFile, Notice } from "obsidian";
import { normalizePath } from "obsidian";

/** Film data parsed from frontmatter */
export interface FilmData {
	type?: string;
	title_original?: string;
	title_fr?: string;
	title_en?: string;
	year?: number;
	status?: "to-watch" | "watched" | "rewatching";
	favorite?: boolean;
	mood?: string;
	rating?: number;
	watch_date?: string;
	[key: string]: unknown;
}

export interface FilmDataWrapper {
    frontmatter: FilmData;
    file: TFile;
}

/** Options for generating collections */
export interface CollectionOptions {
	sortBy?: "rating" | "watch_date" | "title" | "mood";
	includeStats?: boolean;
	includeLinks?: boolean;
}

/** Collection generation result */
export interface CollectionResult {
	success: boolean;
	filePath: string;
	filmCount: number;
	message: string;
}

export class CollectionGenerator {
	private app: App;
	private accountFolder: string;

	constructor(app: App, accountFolder: string) {
		this.app = app;
		this.accountFolder = accountFolder;
	}

	/**
	 * Generate watchlist collection (all to-watch films)
	 */
	async generateWatchlist(): Promise<CollectionResult> {
		const filePath = normalizePath(`${this.accountFolder}/Watchlist.md`);
		const films = await this.getFilmsWithStatus("to-watch");

		// Sort by favorite, then by mood
		films.sort((a, b) => {
			if ((b.frontmatter.favorite ? 1 : 0) !== (a.frontmatter.favorite ? 1 : 0)) {
				return (b.frontmatter.favorite ? 1 : 0) - (a.frontmatter.favorite ? 1 : 0);
			}
			return String(a.frontmatter.mood || "").localeCompare(String(b.frontmatter.mood || ""));
		});

		const content = this.generateCollectionContent(
			"Watchlist",
			films,
			{ sortBy: "mood", includeStats: true, includeLinks: true }
		);

		await this.writeCollection(filePath, content);

		return {
			success: true,
			filePath,
			filmCount: films.length,
			message: `Generated watchlist with ${films.length} films`,
		};
	}

	/**
	 * Generate favorites collection (all favorite films)
	 */
	async generateFavorites(): Promise<CollectionResult> {
		const filePath = normalizePath(`${this.accountFolder}/Collections/Favorites.md`);
		const films = await this.getFilmsWithField("favorite", true);

		// Sort by rating descending
		films.sort((a, b) => (Number(b.frontmatter.rating) || 0) - (Number(a.frontmatter.rating) || 0));

		const content = this.generateCollectionContent(
			"Favorites",
			films,
			{ sortBy: "rating", includeStats: true, includeLinks: true }
		);

		await this.writeCollection(filePath, content);

		return {
			success: true,
			filePath,
			filmCount: films.length,
			message: `Generated favorites with ${films.length} films`,
		};
	}

	/**
	 * Generate top-rated collection (rating >= 8)
	 */
	async generateTopRated(threshold: number = 8): Promise<CollectionResult> {
		const filePath = normalizePath(`${this.accountFolder}/Collections/Top-Rated.md`);
		const films = await this.getFilmsWithMinRating(threshold);

		// Sort by rating descending
		films.sort((a, b) => (Number(b.frontmatter.rating) || 0) - (Number(a.frontmatter.rating) || 0));

		const content = this.generateCollectionContent(
			`Top-Rated (${threshold}+)`,
			films,
			{ sortBy: "rating", includeStats: true, includeLinks: true }
		);

		await this.writeCollection(filePath, content);

		return {
			success: true,
			filePath,
			filmCount: films.length,
			message: `Generated top-rated with ${films.length} films`,
		};
	}

	/**
	 * Generate rewatching collection (status: rewatching)
	 */
	async generateRewatching(): Promise<CollectionResult> {
		const filePath = normalizePath(`${this.accountFolder}/Collections/Rewatching.md`);
		const films = await this.getFilmsWithStatus("rewatching");

		const content = this.generateCollectionContent(
			"Rewatching",
			films,
			{ sortBy: "watch_date", includeStats: true, includeLinks: true }
		);

		await this.writeCollection(filePath, content);

		return {
			success: true,
			filePath,
			filmCount: films.length,
			message: `Generated rewatching with ${films.length} films`,
		};
	}

	/**
	 * Generate recently-watched collection (last 30 days)
	 */
	async generateRecentlyWatched(days: number = 30): Promise<CollectionResult> {
		const filePath = normalizePath(`${this.accountFolder}/Collections/Recently-Watched.md`);
		const films = await this.getFilmsFromLastDays(days);

		// Sort by watch_date descending (newest first)
		films.sort((a, b) => {
			const dateA = new Date(String(a.frontmatter.watch_date) || 0).getTime();
			const dateB = new Date(String(b.frontmatter.watch_date) || 0).getTime();
			return dateB - dateA;
		});

		const content = this.generateCollectionContent(
			`Recently Watched (${days} days)`,
			films,
			{ sortBy: "watch_date", includeStats: true, includeLinks: true }
		);

		await this.writeCollection(filePath, content);

		return {
			success: true,
			filePath,
			filmCount: films.length,
			message: `Generated recently watched with ${films.length} films`,
		};
	}

	/**
	 * Generate mood-based collections
	 */
	async generateMoodCollections(): Promise<CollectionResult[]> {
		const films = await this.getAllFilms();
		const moodGroups = new Map<string, FilmDataWrapper[]>();

		// Group films by mood
		for (const film of films) {
			const mood = String(film.frontmatter.mood || "Unknown");
			if (!moodGroups.has(mood)) {
				moodGroups.set(mood, []);
			}
			moodGroups.get(mood)!.push(film);
		}

		const results: CollectionResult[] = [];

		// Create collection for each mood
		for (const [mood, moodFilms] of moodGroups.entries()) {
			const normalizedMood = mood.replace(/[^\w\s-]/g, "").replace(/\s+/g, "-");
			const filePath = normalizePath(
				`${this.accountFolder}/Collections/By-Mood/${normalizedMood}.md`
			);

			// Sort by rating descending
			moodFilms.sort((a, b) => (Number(b.frontmatter.rating) || 0) - (Number(a.frontmatter.rating) || 0));

			const content = this.generateCollectionContent(
				`Mood: ${mood}`,
				moodFilms,
				{ sortBy: "rating", includeStats: true, includeLinks: true }
			);

			await this.writeCollection(filePath, content);

			results.push({
				success: true,
				filePath,
				filmCount: moodFilms.length,
				message: `Generated ${mood} mood collection with ${moodFilms.length} films`,
			});
		}

		return results;
	}

	// ============================================================================
	// Helper Methods
	// ============================================================================

	/**
	 * Get all films from account folder
	 */
	private getAllFilms(): FilmDataWrapper[] {
		const folder = this.app.vault.getAbstractFileByPath(this.accountFolder);
		if (!folder || !(folder instanceof TFolder)) {
			return [];
		}

		const films: FilmDataWrapper[] = [];
		const cache = this.app.metadataCache;

		const traverse = (f: TFolder) => {
			for (const child of f.children) {
				if (child instanceof TFile && child.extension === "md") {
					// Skip special files
					if (
						child.name === "Watchlist.md" ||
						child.name === "Dashboard.md" ||
						child.name === "README.md"
					) {
						continue;
					}

					const fileCache = cache.getFileCache(child);
					if (fileCache && fileCache.frontmatter) {
						films.push({
                            frontmatter: fileCache.frontmatter as FilmData,
                            file: child
                        });
					}
				} else if (child instanceof TFolder) {
					// Skip special folders
					if (!child.name.startsWith(".")) {
						traverse(child);
					}
				}
			}
		};

		traverse(folder);
		return films;
	}

	/**
	 * Get films with specific status
	 */
	private async getFilmsWithStatus(status: string): Promise<FilmDataWrapper[]> {
		const films = await this.getAllFilms();
		return films.filter((f) => f.frontmatter.status === status);
	}

	/**
	 * Get films with field equal to value
	 */
	private async getFilmsWithField(field: string, value: unknown): Promise<FilmDataWrapper[]> {
		const films = await this.getAllFilms();
		return films.filter((f) => f.frontmatter[field] === value);
	}

	/**
	 * Get films with rating >= threshold
	 */
	private async getFilmsWithMinRating(threshold: number): Promise<FilmDataWrapper[]> {
		const films = await this.getAllFilms();
		return films.filter((f) => Number(f.frontmatter.rating || 0) >= threshold);
	}

	/**
	 * Get films watched in last N days
	 */
	private async getFilmsFromLastDays(days: number): Promise<FilmDataWrapper[]> {
		const films = await this.getAllFilms();
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - days);

		return films.filter((f) => {
			if (!f.frontmatter.watch_date) return false;
			const watchDate = new Date(String(f.frontmatter.watch_date));
			return watchDate >= cutoffDate;
		});
	}

	/**
	 * Generate markdown content for a collection
	 */
	private generateCollectionContent(
		title: string,
		films: FilmDataWrapper[],
		options: CollectionOptions = {}
	): string {
		let content = `# ${title}

`;

		if (options.includeStats) {
			const avgRating =
				films.length > 0
					? (
							films.reduce((sum, f) => sum + (Number(f.frontmatter.rating) || 0), 0) /
							films.length
						).toFixed(1)
					: "N/A";

			content += `**Count:** ${films.length} | **Avg Rating:** ${avgRating}

`;
		}

		content += `## Films

`;

		for (const filmWrapper of films) {
            const film = filmWrapper.frontmatter;
			const title_display = film.title_original || film.title_fr || "Unknown";
			const year = film.year ? ` (${film.year})` : "";
			const rating = film.rating ? ` - ⭐ ${film.rating}` : "";
			const mood = film.mood ? ` - 💭 ${film.mood}` : "";
            const link = this.app.metadataCache.fileToLinktext(filmWrapper.file, this.accountFolder, true);

			content += `- [[${link}|${title_display}]]${year}${rating}${mood}
`;
		}

		// Auto-generated footer
		content += `
---

_Generated automatically. Last updated: ${new Date().toISOString()}_
`;

		return content;
	}

	/**
	 * Write collection file
	 */
	private async writeCollection(filePath: string, content: string): Promise<void> {
		try {
			// Ensure parent folder exists
			const parentPath = filePath.substring(0, filePath.lastIndexOf("/"));
			if (parentPath) {
				await this.app.vault.createFolder(parentPath).catch(() => {
					// Folder likely exists
				});
			}

			// Write or update file
			const existingFile = this.app.vault.getAbstractFileByPath(filePath);
			if (existingFile instanceof TFile) {
				await this.app.vault.modify(existingFile, content);
			} else {
				await this.app.vault.create(filePath, content);
			}
		} catch (error) {
			console.error(`Error writing collection ${filePath}:`, error);
		}
	}
}

/**
 * Create a CollectionGenerator instance (factory)
 */
export function createCollectionGenerator(app: App, accountFolder: string): CollectionGenerator {
	return new CollectionGenerator(app, accountFolder);
}
