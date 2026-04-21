import { App, TFolder, TFile } from "obsidian";

/** Film quote data */
export interface FilmQuoteData {
	title_original?: string;
	title_fr?: string;
	year?: number;
	director?: string | string[];
	overview?: string;
	favoriteQuote?: string;
	[key: string]: unknown;
}

/** Quote result */
export interface QuoteResult {
	title: string;
	director?: string;
	year?: number;
	overview?: string;
	quote?: string;
	isCustom: boolean;
}

export class QuoteGenerator {
	private app: App;
	private accountFolder: string;

	constructor(app: App, accountFolder: string) {
		this.app = app;
		this.accountFolder = accountFolder;
	}

	/**
	 * Get all watched films with quotes
	 */
	private async getAllFilmsWithQuotes(): Promise<FilmQuoteData[]> {
		const folder = this.app.vault.getAbstractFileByPath(this.accountFolder);
		if (!folder || !(folder instanceof TFolder)) {
			return [];
		}

		const films: FilmQuoteData[] = [];
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
						const metadata = fileCache.frontmatter as FilmQuoteData;
						// Only include watched films
						if (metadata.overview || metadata.favoriteQuote) {
							films.push(metadata);
						}
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
	 * Get a random movie quote
	 */
	async getRandomMovieQuote(): Promise<QuoteResult | null> {
		const films = await this.getAllFilmsWithQuotes();

		if (films.length === 0) {
			return null;
		}

		// Pick random film
		const randomFilm = films[Math.floor(Math.random() * films.length)];

		// Get director name(s)
		let directorStr: string | undefined;
		if (randomFilm.director) {
			if (Array.isArray(randomFilm.director)) {
				directorStr = randomFilm.director.join(", ");
			} else {
				directorStr = String(randomFilm.director);
			}
		}

		// Prefer custom quote, fallback to overview
		const quote = randomFilm.favoriteQuote || randomFilm.overview;
		const isCustom = !!randomFilm.favoriteQuote;

		return {
			title: String(randomFilm.title_original || randomFilm.title_fr || "Unknown"),
			director: directorStr,
			year: Number(randomFilm.year),
			overview: String(randomFilm.overview || ""),
			quote: String(quote || ""),
			isCustom,
		};
	}

	/**
	 * Format quote as markdown display
	 */
	formatQuoteDisplay(quote: QuoteResult): string {
		let display = "";

		// Title and year
		display += `# 🎬 ${quote.title}`;
		if (quote.year) {
			display += ` (${quote.year})`;
		}
		display += "\n\n";

		// Director
		if (quote.director) {
			display += `**Director:** ${quote.director}\n\n`;
		}

		// Quote label
		if (quote.isCustom) {
			display += "## Favorite Quote\n\n";
		} else {
			display += "## Overview\n\n";
		}

		// The quote itself
		if (quote.quote) {
			display += `> ${quote.quote.split("\n").join("\n> ")}\n\n`;
		}

		display += `---\n\n_${quote.isCustom ? "Custom quote" : "Overview from TMDB"}_`;

		return display;
	}
}

/**
 * Create a QuoteGenerator instance (factory)
 */
export function createQuoteGenerator(app: App, accountFolder: string): QuoteGenerator {
	return new QuoteGenerator(app, accountFolder);
}
