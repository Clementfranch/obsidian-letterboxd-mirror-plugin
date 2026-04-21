import { Notice } from "obsidian";

/** Interface for external service IDs */
export interface ExternalIds {
	imdbId?: string;
	tmdbId?: string;
	tmbdUrl?: string;
}

/** Generate URLs for a film across multiple services */
export class LinkManager {
	private tmdbApiKey: string | undefined;

	constructor(tmdbApiKey?: string) {
		this.tmdbApiKey = tmdbApiKey;
	}

	/**
	 * Get IMDb URL from IMDb ID
	 */
	getImdbUrl(imdbId: string): string | null {
		if (!imdbId) return null;
		// Normalize IMDb ID (remove 'tt' prefix if present)
		const id = imdbId.startsWith("tt") ? imdbId : `tt${imdbId}`;
		return `https://www.imdb.com/title/${id}/`;
	}

	/**
	 * Get TMDB URL from TMDB ID (movie)
	 */
	getTmdbUrl(tmdbId: string): string | null {
		if (!tmdbId) return null;
		return `https://www.themoviedb.org/movie/${tmdbId}`;
	}

	/**
	 * Get OMDb URL (search by title, since we don't have OMDb ID)
	 */
	getOmdbSearchUrl(title: string, year?: number): string | null {
		if (!title) return null;
		const query = encodeURIComponent(title);
		const yearParam = year ? `&y=${year}` : "";
		return `https://www.omdbapi.com/?type=movie&t=${query}${yearParam}`;
	}

	/**
	 * Get Letterboxd film URL by username and title
	 */
	getLetterboxdUrl(filmTitle: string, year?: number): string | null {
		if (!filmTitle) return null;
		// Normalize title: lowercase, replace spaces with hyphens, remove special chars
		const normalized = filmTitle
			.toLowerCase()
			.replace(/[&]/g, "and")
			.replace(/[^\w\s-]/g, "")
			.replace(/\s+/g, "-")
			.replace(/-+/g, "-");
		const yearParam = year ? `/${year}` : "";
		return `https://letterboxd.com/search/${normalized}${yearParam}/`;
	}

	/**
	 * Get Wikipedia URL by film title
	 */
	getWikipediaUrl(filmTitle: string): string | null {
		if (!filmTitle) return null;
		const query = encodeURIComponent(filmTitle);
		return `https://en.wikipedia.org/wiki/Special:Search?search=${query}`;
	}

	/**
	 * Get Rotten Tomatoes URL (search)
	 */
	getRottenTomatoesUrl(filmTitle: string): string | null {
		if (!filmTitle) return null;
		const query = encodeURIComponent(filmTitle);
		return `https://www.rottentomatoes.com/search?search=${query}`;
	}

	/**
	 * Get all external links for a film
	 */
	getAllLinks(
		filmTitle: string,
		imdbId?: string,
		tmdbId?: string,
		year?: number
	): Record<string, string> {
		const links: Record<string, string> = {};

		const imdbUrl = this.getImdbUrl(imdbId || "");
		if (imdbUrl) links.IMDb = imdbUrl;

		const tmdbUrl = this.getTmdbUrl(tmdbId || "");
		if (tmdbUrl) links.TMDB = tmdbUrl;

		const omdbUrl = this.getOmdbSearchUrl(filmTitle, year);
		if (omdbUrl) links.OMDb = omdbUrl;

		const letterboxdUrl = this.getLetterboxdUrl(filmTitle, year);
		if (letterboxdUrl) links.Letterboxd = letterboxdUrl;

		const wikipediaUrl = this.getWikipediaUrl(filmTitle);
		if (wikipediaUrl) links.Wikipedia = wikipediaUrl;

		const rtUrl = this.getRottenTomatoesUrl(filmTitle);
		if (rtUrl) links["Rotten Tomatoes"] = rtUrl;

		return links;
	}

	/**
	 * Fetch TMDB ID from title and year (requires TMDB API key)
	 * Returns the TMDB ID if found, null otherwise
	 */
	async fetchTmdbIdFromTitle(title: string, year?: number): Promise<string | null> {
		if (!this.tmdbApiKey) {
			console.warn("TMDB API key not configured");
			return null;
		}

		try {
			const query = encodeURIComponent(title);
			const yearParam = year ? `&primary_release_year=${year}` : "";
			const url = `https://api.themoviedb.org/3/search/movie?api_key=${this.tmdbApiKey}&query=${query}${yearParam}`;

			const response = await fetch(url);
			if (!response.ok) {
				console.error(`TMDB API error: ${response.status}`);
				return null;
			}

			const data = (await response.json()) as {
				results?: Array<{ id: number }>;
			};
			if (data.results && data.results.length > 0) {
				return String(data.results[0].id);
			}
		} catch (error) {
			console.error("Error fetching TMDB ID:", error);
		}

		return null;
	}

	/**
	 * Fetch IMDb ID from TMDB API (requires TMDB API key)
	 * Returns IMDb ID if available
	 */
	async fetchImdbIdFromTmdb(tmdbId: string): Promise<string | null> {
		if (!this.tmdbApiKey) {
			console.warn("TMDB API key not configured");
			return null;
		}

		try {
			const url = `https://api.themoviedb.org/3/movie/${tmdbId}/external_ids?api_key=${this.tmdbApiKey}`;

			const response = await fetch(url);
			if (!response.ok) {
				console.error(`TMDB API error: ${response.status}`);
				return null;
			}

			const data = (await response.json()) as { imdb_id?: string };
			return data.imdb_id || null;
		} catch (error) {
			console.error("Error fetching IMDb ID from TMDB:", error);
		}

		return null;
	}

	/**
	 * Generate markdown link text for a service
	 */
	generateMarkdownLink(service: string, url: string): string {
		return `[${service}](${url})`;
	}

	/**
	 * Generate markdown links for all available services
	 */
	generateAllMarkdownLinks(
		filmTitle: string,
		imdbId?: string,
		tmdbId?: string,
		year?: number
	): string {
		const links = this.getAllLinks(filmTitle, imdbId, tmdbId, year);
		const markdownLinks = Object.entries(links)
			.map(([service, url]) => this.generateMarkdownLink(service, url))
			.join(" • ");
		return markdownLinks;
	}
}

/**
 * Create a LinkManager instance (factory)
 */
export function createLinkManager(tmdbApiKey?: string): LinkManager {
	return new LinkManager(tmdbApiKey);
}

/**
 * Open URL in default browser
 */
export function openExternalUrl(url: string): void {
	if (url) {
		window.open(url, "_blank");
	} else {
		new Notice("URL not available");
	}
}

/**
 * Copy URL to clipboard
 */
export async function copyUrlToClipboard(url: string): Promise<void> {
	if (url) {
		await navigator.clipboard.writeText(url);
		new Notice("URL copied to clipboard");
	} else {
		new Notice("URL not available");
	}
}
