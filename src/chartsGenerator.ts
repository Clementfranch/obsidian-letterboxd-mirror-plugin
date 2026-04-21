import { App, TFolder, TFile } from "obsidian";

interface FilmChartData {
    genres?: string[];
    director?: string[];
    cast?: string[];
    mood?: string;
    rating?: number;
}

export class ChartsGenerator {
    private app: App;
    private accountFolder: string;

    constructor(app: App, accountFolder: string) {
        this.app = app;
        this.accountFolder = accountFolder;
    }

    private async getWatchedFilms(): Promise<FilmChartData[]> {
        const folder = this.app.vault.getAbstractFileByPath(this.accountFolder);
        if (!folder || !(folder instanceof TFolder)) {
            return [];
        }

        const films: FilmChartData[] = [];
        const cache = this.app.metadataCache;

        const traverse = (f: TFolder) => {
            for (const child of f.children) {
                if (child instanceof TFile && child.extension === "md") {
                    const fileCache = cache.getFileCache(child);
                    if (fileCache && fileCache.frontmatter && fileCache.frontmatter.watch_date) {
                        films.push(fileCache.frontmatter as FilmChartData);
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

    public async generateCharts(): Promise<string> {
        const films = await this.getWatchedFilms();
        
        let content = "# Charts & Statistics\\n\\n";
        
        content += this.generateGenreDistribution(films);
        content += this.generateDirectorDistribution(films);
        content += this.generateActorDistribution(films);
        content += this.generateMoodDistribution(films);
        content += this.generateRatingDistribution(films);

        content += `---

_Generated automatically. Last updated: ${new Date().toISOString()}_
`;

        return content;
    }

    private generateGenreDistribution(films: FilmChartData[]): string {
        const counts: { [key: string]: number } = {};
        for (const film of films) {
            if (film.genres) {
                for (const genre of film.genres) {
                    counts[genre] = (counts[genre] || 0) + 1;
                }
            }
        }
        return this.generateDistributionChart("Genre Distribution", counts);
    }
    
    private generateDirectorDistribution(films: FilmChartData[]): string {
        const counts: { [key: string]: number } = {};
        for (const film of films) {
            if (film.director) {
                const directors = Array.isArray(film.director) ? film.director : [film.director];
                for (const director of directors) {
                    counts[director] = (counts[director] || 0) + 1;
                }
            }
        }
        return this.generateDistributionChart("Top Directors", counts, 20);
    }

    private generateActorDistribution(films: FilmChartData[]): string {
        const counts: { [key: string]: number } = {};
        for (const film of films) {
            if (film.cast) {
                for (const actor of film.cast.slice(0, 10)) { // Top 10 actors
                    counts[actor] = (counts[actor] || 0) + 1;
                }
            }
        }
        return this.generateDistributionChart("Top Actors", counts, 20);
    }
    
    private generateMoodDistribution(films: FilmChartData[]): string {
        const counts: { [key: string]: number } = {};
        for (const film of films) {
            if (film.mood) {
                counts[film.mood] = (counts[film.mood] || 0) + 1;
            }
        }
        return this.generateDistributionChart("Mood Distribution", counts);
    }
    
    private generateRatingDistribution(films: FilmChartData[]): string {
        const counts: { [key: string]: number } = {};
        for (const film of films) {
            if (film.rating) {
                const rating = Math.round(film.rating);
                counts[rating] = (counts[rating] || 0) + 1;
            }
        }
        return this.generateDistributionChart("Rating Distribution", counts);
    }

    private generateDistributionChart(title: string, counts: { [key: string]: number }, topN?: number): string {
        let content = `## ${title}

`;
        let sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

        if (topN) {
            sorted = sorted.slice(0, topN);
        }
        
        const maxValue = sorted[0]?.[1] || 0;

        for (const [key, value] of sorted) {
            const bar = this.createBar(value, maxValue);
            content += `- **${key}:** ${value} ${bar}
`;
        }
        content += "\\n";
        return content;
    }

    private createBar(value: number, maxValue: number, maxWidth: number = 20): string {
        const filledWidth = Math.round((value / maxValue) * maxWidth);
        const emptyWidth = maxWidth - filledWidth;
        return "█".repeat(filledWidth) + "░".repeat(emptyWidth);
    }
}

export function createChartsGenerator(app: App, accountFolder: string): ChartsGenerator {
    return new ChartsGenerator(app, accountFolder);
}

