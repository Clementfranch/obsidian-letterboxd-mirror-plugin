import { App, TFolder, TFile } from "obsidian";

interface FilmTimelineData {
    watch_date: string;
    rating?: number;
    genres?: string[];
    director?: string[];
}

export class TimelineGenerator {
    private app: App;
    private accountFolder: string;

    constructor(app: App, accountFolder: string) {
        this.app = app;
        this.accountFolder = accountFolder;
    }

    private async getWatchedFilms(genre?: string, director?: string): Promise<FilmTimelineData[]> {
        const folder = this.app.vault.getAbstractFileByPath(this.accountFolder);
        if (!folder || !(folder instanceof TFolder)) {
            return [];
        }

        const films: FilmTimelineData[] = [];
        const cache = this.app.metadataCache;

        const traverse = (f: TFolder) => {
            for (const child of f.children) {
                if (child instanceof TFile && child.extension === "md") {
                    const fileCache = cache.getFileCache(child);
                    if (fileCache && fileCache.frontmatter && fileCache.frontmatter.watch_date) {
                        const filmData = fileCache.frontmatter as FilmTimelineData;
                        if (genre && (!filmData.genres || !filmData.genres.includes(genre))) {
                            continue;
                        }
                        if (director && (!filmData.director || !filmData.director.includes(director))) {
                            continue;
                        }
                        films.push(filmData);
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

    public async generateTimeline(genre?: string, director?: string): Promise<string> {
        const films = await this.getWatchedFilms(genre, director);

        const countsByYear: { [year: number]: { [month: number]: { count: number, ratings: number[] } } } = {};

        for (const film of films) {
            const date = new Date(film.watch_date);
            const year = date.getFullYear();
            const month = date.getMonth();

            if (!countsByYear[year]) {
                countsByYear[year] = {};
            }
            if (!countsByYear[year][month]) {
                countsByYear[year][month] = { count: 0, ratings: [] };
            }
            countsByYear[year][month].count++;
            if (film.rating) {
                countsByYear[year][month].ratings.push(film.rating);
            }
        }
        
        let content = "# Films by Year and Month

";
        if (genre) content += `**Genre:** ${genre}
`;
        if (director) content += `**Director:** ${director}
`;
        content += "
";

        const years = Object.keys(countsByYear).map(Number).sort((a, b) => b - a);
        const maxCount = Math.max(...Object.values(countsByYear).flatMap(months => Object.values(months).map(m => m.count)));

        for (const year of years) {
            content += `## ${year}

`;
            for (let month = 0; month < 12; month++) {
                if (countsByYear[year][month]) {
                    const data = countsByYear[year][month];
                    const avgRating = data.ratings.length > 0
                        ? (data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length).toFixed(1)
                        : "N/A";
                    const bar = this.createBar(data.count, maxCount);
                    const monthName = new Date(year, month).toLocaleString('default', { month: 'long' });
                    content += `- **${monthName}:** ${data.count} films, Avg rating: ${avgRating} ${bar}
`;
                }
            }
            content += "
";
        }
        
        content += `---

_Generated automatically. Last updated: ${new Date().toISOString()}_
`;

        return content;
    }

    private createBar(value: number, maxValue: number, maxWidth: number = 20): string {
        const filledWidth = Math.round((value / maxValue) * maxWidth);
        const emptyWidth = maxWidth - filledWidth;
        return "█".repeat(filledWidth) + "░".repeat(emptyWidth);
    }
}

export function createTimelineGenerator(app: App, accountFolder: string): TimelineGenerator {
    return new TimelineGenerator(app, accountFolder);
}
