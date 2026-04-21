import { App, TFolder, TFile } from "obsidian";

interface FilmRankingData {
    director?: string[];
    cast?: string[];
    genres?: string[];
    rating?: number;
    duration_minutes?: number;
    watch_count?: number;
    title_original?: string;
    production_companies?: string[];
}

export class RankingsGenerator {
    private app: App;
    private accountFolder: string;

    constructor(app: App, accountFolder: string) {
        this.app = app;
        this.accountFolder = accountFolder;
    }

    private async getWatchedFilms(): Promise<FilmRankingData[]> {
        const folder = this.app.vault.getAbstractFileByPath(this.accountFolder);
        if (!folder || !(folder instanceof TFolder)) {
            return [];
        }

        const films: FilmRankingData[] = [];
        const cache = this.app.metadataCache;

        const traverse = (f: TFolder) => {
            for (const child of f.children) {
                if (child instanceof TFile && child.extension === "md") {
                    const fileCache = cache.getFileCache(child);
                    if (fileCache && fileCache.frontmatter && fileCache.frontmatter.watch_date) {
                        films.push(fileCache.frontmatter as FilmRankingData);
                    }
                } else if (child instanceof TFolder) {
                    if (!child.name.startsWith(".")) {
                        traverse(child);
                    }
                }
            }
        };

        traverse(folder);
        return films;
    }

    public async generateRankings(): Promise<string> {
        const films = await this.getWatchedFilms();
        
        let content = "# Top Rankings

";
        
        content += this.generateTopDirectors(films);
        content += this.generateTopActors(films);
        content += this.generateTopGenres(films);
        content += this.generateTopStudios(films);
        content += this.generateMostRewatched(films);

        content += `---

_Generated automatically. Last updated: ${new Date().toISOString()}_
`;

        return content;
    }

    private generateTopDirectors(films: FilmRankingData[]): string {
        const stats: { [key: string]: { count: number, ratings: number[], hours: number } } = {};
        for (const film of films) {
            if (film.director) {
                const directors = Array.isArray(film.director) ? film.director : [film.director];
                for (const director of directors) {
                    if (!stats[director]) stats[director] = { count: 0, ratings: [], hours: 0 };
                    stats[director].count++;
                    if (film.rating) stats[director].ratings.push(film.rating);
                    if (film.duration_minutes) stats[director].hours += film.duration_minutes / 60;
                }
            }
        }
        
        const sorted = Object.entries(stats).sort((a, b) => b[1].count - a[1].count).slice(0, 20);

        let content = "## Top Directors

";
        for (const [director, data] of sorted) {
            const avgRating = data.ratings.length > 0 ? (data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length).toFixed(1) : "N/A";
            content += `- **${director}:** ${data.count} films, Avg rating: ${avgRating}, Total hours: ${Math.round(data.hours)}
`;
        }
        content += "
";
        return content;
    }

    private generateTopActors(films: FilmRankingData[]): string {
        const stats: { [key: string]: { count: number, ratings: number[] } } = {};
        for (const film of films) {
            if (film.cast) {
                for (const actor of film.cast.slice(0, 10)) {
                    if (!stats[actor]) stats[actor] = { count: 0, ratings: [] };
                    stats[actor].count++;
                    if (film.rating) stats[actor].ratings.push(film.rating);
                }
            }
        }
        
        const sorted = Object.entries(stats).sort((a, b) => b[1].count - a[1].count).slice(0, 20);

        let content = "## Top Actors

";
        for (const [actor, data] of sorted) {
            const avgRating = data.ratings.length > 0 ? (data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length).toFixed(1) : "N/A";
            content += `- **${actor}:** ${data.count} films, Avg rating: ${avgRating}
`;
        }
        content += "
";
        return content;
    }
    
    private generateTopGenres(films: FilmRankingData[]): string {
        const stats: { [key: string]: { count: number, ratings: number[] } } = {};
        for (const film of films) {
            if (film.genres) {
                for (const genre of film.genres) {
                    if (!stats[genre]) stats[genre] = { count: 0, ratings: [] };
                    stats[genre].count++;
                    if (film.rating) stats[genre].ratings.push(film.rating);
                }
            }
        }
        
        const sorted = Object.entries(stats).sort((a, b) => b[1].count - a[1].count);

        let content = "## Top Genres

";
        for (const [genre, data] of sorted) {
            const avgRating = data.ratings.length > 0 ? (data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length).toFixed(1) : "N/A";
            content += `- **${genre}:** ${data.count} films, Avg rating: ${avgRating}
`;
        }
        content += "
";
        return content;
    }
    
    private generateTopStudios(films: FilmRankingData[]): string {
        const stats: { [key: string]: { count: number, ratings: number[] } } = {};
        for (const film of films) {
            if (film.production_companies) {
                for (const studio of film.production_companies) {
                    if (!stats[studio]) stats[studio] = { count: 0, ratings: [] };
                    stats[studio].count++;
                    if (film.rating) stats[studio].ratings.push(film.rating);
                }
            }
        }
        
        const sorted = Object.entries(stats).sort((a, b) => b[1].count - a[1].count).slice(0, 20);

        let content = "## Top Studios

";
        for (const [studio, data] of sorted) {
            const avgRating = data.ratings.length > 0 ? (data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length).toFixed(1) : "N/A";
            content += `- **${studio}:** ${data.count} films, Avg rating: ${avgRating}
`;
        }
        content += "
";
        return content;
    }
    
    private generateMostRewatched(films: FilmRankingData[]): string {
        const sorted = films.filter(f => f.watch_count && f.watch_count > 1).sort((a, b) => (b.watch_count || 0) - (a.watch_count || 0)).slice(0, 10);

        let content = "## Most Rewatched Films

";
        for (const film of sorted) {
            content += `- **${film.title_original}:** ${film.watch_count} watches
`;
        }
        content += "
";
        return content;
    }
}

export function createRankingsGenerator(app: App, accountFolder: string): RankingsGenerator {
    return new RankingsGenerator(app, accountFolder);
}
