import { App, TFolder, TFile } from "obsidian";

/** Film analytics data */
export interface FilmAnalytics {
	title?: string;
	duration_minutes?: number;
	genres?: string[];
	director?: string[];
	year?: number;
	[key: string]: unknown;
}

/** Watch time statistics */
export interface WatchTimeStats {
	totalFilms: number;
	totalMinutes: number;
	totalHours: number;
	totalDays: number;
	totalYears: number;
	byGenre: Map<string, { count: number; hours: number }>;
	byDirector: Map<string, { count: number; hours: number }>;
	byYear: Map<number, { count: number; hours: number }>;
	averageFilmLength: number;
}

export class AnalyticsCalculator {
	private app: App;
	private accountFolder: string;

	constructor(app: App, accountFolder: string) {
		this.app = app;
		this.accountFolder = accountFolder;
	}

	/**
	 * Calculate total watch time statistics
	 */
	async calculateTotalWatchTime(): Promise<WatchTimeStats> {
		const films = await this.getWatchedFilms();
		const stats: WatchTimeStats = {
			totalFilms: films.length,
			totalMinutes: 0,
			totalHours: 0,
			totalDays: 0,
			totalYears: 0,
			byGenre: new Map(),
			byDirector: new Map(),
			byYear: new Map(),
			averageFilmLength: 0,
		};

		for (const film of films) {
			const duration = Number(film.duration_minutes) || 0;
			stats.totalMinutes += duration;

			// By genre
			if (film.genres && Array.isArray(film.genres)) {
				for (const genre of film.genres) {
					const genreStr = String(genre);
					const existing = stats.byGenre.get(genreStr) || { count: 0, hours: 0 };
					stats.byGenre.set(genreStr, {
						count: existing.count + 1,
						hours: existing.hours + duration / 60,
					});
				}
			}

			// By director
			if (film.director) {
				const directors = Array.isArray(film.director) ? film.director : [film.director];
				for (const director of directors) {
					const directorStr = String(director);
					const existing = stats.byDirector.get(directorStr) || { count: 0, hours: 0 };
					stats.byDirector.set(directorStr, {
						count: existing.count + 1,
						hours: existing.hours + duration / 60,
					});
				}
			}

			// By year
			if (film.year) {
				const year = Number(film.year);
				const existing = stats.byYear.get(year) || { count: 0, hours: 0 };
				stats.byYear.set(year, {
					count: existing.count + 1,
					hours: existing.hours + duration / 60,
				});
			}
		}

		// Calculate derived stats
		stats.totalHours = Math.round(stats.totalMinutes / 60);
		stats.totalDays = Math.round(stats.totalHours / 24);
		stats.totalYears = Math.round(stats.totalDays / 365);
		stats.averageFilmLength =
			films.length > 0 ? Math.round(stats.totalMinutes / films.length) : 0;

		return stats;
	}

	/**
	 * Generate total watch time markdown report
	 */
	async generateTotalWatchTimeReport(): Promise<string> {
		const stats = await this.calculateTotalWatchTime();

		let content = "# Total Watch Time\n\n";

		// Summary
		content += "## Summary\n\n";
		content += `- **Total Films Watched:** ${stats.totalFilms}\n`;
		content += `- **Total Time:** ${stats.totalYears}y ${stats.totalDays % 365}d (${stats.totalHours} hours)\n`;
		content += `- **Average Film Length:** ${this.formatMinutes(stats.averageFilmLength)}\n\n`;

		// By genre
		if (stats.byGenre.size > 0) {
			content += "## By Genre\n\n";

			const genresSorted = Array.from(stats.byGenre.entries())
				.sort((a, b) => b[1].hours - a[1].hours)
				.slice(0, 20); // Top 20

			for (const [genre, data] of genresSorted) {
				const percentage = ((data.hours / stats.totalHours) * 100).toFixed(1);
				const bar = this.createBar(Number(percentage));
				content += `- **${genre}:** ${data.count} films, ${Math.round(data.hours)}h ${bar} ${percentage}%\n`;
			}

			content += "\n";
		}

		// By director
		if (stats.byDirector.size > 0) {
			content += "## By Director (Top 20)\n\n";

			const directorsSorted = Array.from(stats.byDirector.entries())
				.sort((a, b) => b[1].hours - a[1].hours)
				.slice(0, 20);

			for (const [director, data] of directorsSorted) {
				const percentage = ((data.hours / stats.totalHours) * 100).toFixed(1);
				content += `- **${director}:** ${data.count} films, ${Math.round(data.hours)}h (${percentage}%)\n`;
			}

			content += "\n";
		}

		// By year
		if (stats.byYear.size > 0) {
			content += "## By Year\n\n";

			const yearsSorted = Array.from(stats.byYear.entries()).sort((a, b) => b[0] - a[0]);

			for (const [year, data] of yearsSorted) {
				const percentage = ((data.hours / stats.totalHours) * 100).toFixed(1);
				content += `- **${year}:** ${data.count} films, ${Math.round(data.hours)}h (${percentage}%)\n`;
			}

			content += "\n";
		}

		content += `---\n\n_Generated automatically. Last updated: ${new Date().toISOString()}_\n`;

		return content;
	}

	// ============================================================================
	// Helper Methods
	// ============================================================================

	/**
	 * Get all watched films from account folder
	 */
	private async getWatchedFilms(): Promise<FilmAnalytics[]> {
		const folder = this.app.vault.getAbstractFileByPath(this.accountFolder);
		if (!folder || !(folder instanceof TFolder)) {
			return [];
		}

		const films: FilmAnalytics[] = [];
		const cache = this.app.metadataCache;

		const traverse = (f: TFolder) => {
			for (const child of f.children) {
				if (child instanceof TFile && child.extension === "md") {
					// Skip special files
					if (
						child.name === "Watchlist.md" ||
						child.name === "Dashboard.md" ||
						child.name === "README.md" ||
						child.path.includes("/Collections/") ||
						child.path.includes("/By-Decade/") ||
						child.path.includes("/Analytics/")
					) {
						continue;
					}

					const fileCache = cache.getFileCache(child);
					if (fileCache && fileCache.frontmatter) {
						const metadata = fileCache.frontmatter as FilmAnalytics;
						// Only include watched films
						if (metadata.status === "watched") {
							films.push(metadata);
						}
					}
				} else if (child instanceof TFolder) {
					// Skip special folders
					if (!child.name.startsWith(".") && !child.name.includes("/")) {
						traverse(child);
					}
				}
			}
		};

		traverse(folder);
		return films;
	}

	/**
	 * Format minutes to human-readable string
	 */
	private formatMinutes(minutes: number): string {
		if (minutes < 60) return `${minutes}m`;
		const hours = Math.floor(minutes / 60);
		const mins = minutes % 60;
		return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
	}

	/**
	 * Create ASCII bar chart
	 */
	private createBar(percentage: number, maxWidth: number = 15): string {
		const filledWidth = Math.round((percentage / 100) * maxWidth);
		const emptyWidth = maxWidth - filledWidth;
		return "█".repeat(filledWidth) + "░".repeat(emptyWidth);
	}
}

/**
 * Create an AnalyticsCalculator instance (factory)
 */
export function createAnalyticsCalculator(app: App, accountFolder: string): AnalyticsCalculator {
	return new AnalyticsCalculator(app, accountFolder);
}
