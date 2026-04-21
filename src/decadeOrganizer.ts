import { App, TFolder, TFile } from "obsidian";

/** Film data for decade organization */
export interface FilmDecadeData {
	title_original?: string;
	year?: number;
	rating?: number;
	[key: string]: unknown;
}

/** Decade statistics */
export interface DecadeStats {
	decade: string;
	year: number;
	films: FilmDecadeData[];
	count: number;
	averageRating: number;
}

export class DecadeOrganizer {
	private app: App;
	private accountFolder: string;

	constructor(app: App, accountFolder: string) {
		this.app = app;
		this.accountFolder = accountFolder;
	}

	/**
	 * Get all films organized by decade
	 */
	async getFilmsByDecade(): Promise<Map<number, FilmDecadeData[]>> {
		const films = await this.getAllFilms();
		const decadeMap = new Map<number, FilmDecadeData[]>();

		for (const film of films) {
			const year = Number(film.year) || 2000;
			const decade = Math.floor(year / 10) * 10;

			if (!decadeMap.has(decade)) {
				decadeMap.set(decade, []);
			}

			decadeMap.get(decade)!.push(film);
		}

		return decadeMap;
	}

	/**
	 * Generate decade-organized folder structure
	 */
	async generateDecadeFolders(): Promise<DecadeStats[]> {
		const decadeMap = await this.getFilmsByDecade();
		const results: DecadeStats[] = [];

		// Sort decades descending (newest first)
		const sortedDecades = Array.from(decadeMap.entries()).sort((a, b) => b[0] - a[0]);

		for (const [decade, films] of sortedDecades) {
			const decadeStr = `${decade}s`;
			const folderPath = `${this.accountFolder}/By-Decade/${decadeStr}`;

			// Calculate stats
			const ratings = films.map((f) => Number(f.rating) || 0).filter((r) => r > 0);
			const averageRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;

			// Create decade index file
			const indexContent = this.generateDecadeIndex(decadeStr, films, averageRating);

			try {
				// Ensure folder exists
				await this.app.vault.createFolder(folderPath).catch(() => {
					// Folder exists
				});

				// Write index
				const indexPath = `${folderPath}/Index.md`;
				const existingIndexFile = this.app.vault.getAbstractFileByPath(indexPath);
				if (existingIndexFile instanceof TFile) {
					await this.app.vault.modify(existingIndexFile, indexContent);
				} else {
					await this.app.vault.create(indexPath, indexContent);
				}
			} catch (error) {
				console.error(`Error creating decade folder for ${decadeStr}:`, error);
			}

			results.push({
				decade: decadeStr,
				year: decade,
				films,
				count: films.length,
				averageRating: Math.round(averageRating * 10) / 10,
			});
		}

		return results;
	}

	/**
	 * Generate decade overview markdown document
	 */
	async generateDecadeOverview(): Promise<string> {
		const decadeMap = await this.getFilmsByDecade();
		const sortedDecades = Array.from(decadeMap.entries()).sort((a, b) => b[0] - a[0]);

		let content = "# Films by Decade\n\n";

		for (const [decade, films] of sortedDecades) {
			const decadeStr = `${decade}s`;
			const ratings = films.map((f) => Number(f.rating) || 0).filter((r) => r > 0);
			const averageRating =
				ratings.length > 0 ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : "N/A";

			content += `## ${decadeStr}\n\n`;
			content += `**Count:** ${films.length} | **Avg Rating:** ${averageRating}\n\n`;

			// List films in this decade, grouped by year
			const filmsByYear = new Map<number, FilmDecadeData[]>();
			for (const film of films) {
				const year = Number(film.year) || decade;
				if (!filmsByYear.has(year)) {
					filmsByYear.set(year, []);
				}
				filmsByYear.get(year)!.push(film);
			}

			const sortedYears = Array.from(filmsByYear.keys()).sort((a, b) => b - a);

			for (const year of sortedYears) {
				const yearFilms = filmsByYear.get(year)!;
				content += `### ${year}\n\n`;

				for (const film of yearFilms) {
					const rating = film.rating ? ` - ⭐ ${film.rating}` : "";
					content += `- **${film.title_original}**${rating}\n`;
				}

				content += "\n";
			}
		}

		content += `---\n\n_Generated automatically. Last updated: ${new Date().toISOString()}_\n`;

		return content;
	}

	// ============================================================================
	// Helper Methods
	// ============================================================================

	/**
	 * Get all films from account folder
	 */
	private async getAllFilms(): Promise<FilmDecadeData[]> {
		const folder = this.app.vault.getAbstractFileByPath(this.accountFolder);
		if (!folder || !(folder instanceof TFolder)) {
			return [];
		}

		const films: FilmDecadeData[] = [];
		const cache = this.app.metadataCache;

		const traverse = (f: TFolder) => {
			for (const child of f.children) {
				if (child instanceof TFile && child.extension === "md") {
					// Skip special files
					if (
						child.name === "Watchlist.md" ||
						child.name === "Dashboard.md" ||
						child.name === "README.md" ||
						child.name === "Index.md" ||
						child.path.includes("/Collections/") ||
						child.path.includes("/By-Decade/") ||
						child.path.includes("/Analytics/")
					) {
						continue;
					}

					const fileCache = cache.getFileCache(child);
					if (fileCache && fileCache.frontmatter) {
						const metadata = fileCache.frontmatter as FilmDecadeData;
						films.push(metadata);
					}
				} else if (child instanceof TFolder) {
					// Skip special folders
					if (!child.name.startsWith(".") && child.name !== "By-Decade") {
						traverse(child);
					}
				}
			}
		};

		traverse(folder);
		return films;
	}

	/**
	 * Generate markdown content for decade index
	 */
	private generateDecadeIndex(decadeStr: string, films: FilmDecadeData[], avgRating: number): string {
		let content = `# ${decadeStr} Films\n\n`;

		content += `**Total Films:** ${films.length}\n`;
		content += `**Average Rating:** ${avgRating.toFixed(1)}\n\n`;

		// Group by year
		const filmsByYear = new Map<number, FilmDecadeData[]>();
		for (const film of films) {
			const year = Number(film.year) || 2000;
			if (!filmsByYear.has(year)) {
				filmsByYear.set(year, []);
			}
			filmsByYear.get(year)!.push(film);
		}

		const sortedYears = Array.from(filmsByYear.keys()).sort((a, b) => b - a);

		for (const year of sortedYears) {
			const yearFilms = filmsByYear.get(year)!;
			const yearRatings = yearFilms
				.map((f) => Number(f.rating) || 0)
				.filter((r) => r > 0);
			const yearAvg =
				yearRatings.length > 0
					? (yearRatings.reduce((a, b) => a + b, 0) / yearRatings.length).toFixed(1)
					: "N/A";

			content += `## ${year}\n\n`;
			content += `**Films:** ${yearFilms.length} | **Avg Rating:** ${yearAvg}\n\n`;

			for (const film of yearFilms) {
				const rating = film.rating ? ` ⭐ ${film.rating}` : "";
				content += `- ${film.title_original}${rating}\n`;
			}

			content += "\n";
		}

		content += `---\n\n_Generated automatically. Last updated: ${new Date().toISOString()}_\n`;

		return content;
	}
}

/**
 * Create a DecadeOrganizer instance (factory)
 */
export function createDecadeOrganizer(app: App, accountFolder: string): DecadeOrganizer {
	return new DecadeOrganizer(app, accountFolder);
}
