import { App, TFolder, TFile } from "obsidian";

interface FilmWatchData {
    watch_date: string;
}

export class HeatmapGenerator {
    private app: App;
    private accountFolder: string;

    constructor(app: App, accountFolder: string) {
        this.app = app;
        this.accountFolder = accountFolder;
    }

    private async getWatchedFilms(): Promise<FilmWatchData[]> {
        const folder = this.app.vault.getAbstractFileByPath(this.accountFolder);
        if (!folder || !(folder instanceof TFolder)) {
            return [];
        }

        const films: FilmWatchData[] = [];
        const cache = this.app.metadataCache;

        const traverse = (f: TFolder) => {
            for (const child of f.children) {
                if (child instanceof TFile && child.extension === "md") {
                    const fileCache = cache.getFileCache(child);
                    if (fileCache && fileCache.frontmatter && fileCache.frontmatter.watch_date) {
                        films.push(fileCache.frontmatter as FilmWatchData);
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

    public async generateHeatmap(year: number = new Date().getFullYear()): Promise<string> {
        const films = await this.getWatchedFilms();
        const watchDates = films
            .map(f => new Date(f.watch_date))
            .filter(d => d.getFullYear() === year);

        const countsByDay: { [key: string]: number } = {};
        for (const date of watchDates) {
            const day = date.toISOString().slice(0, 10);
            countsByDay[day] = (countsByDay[day] || 0) + 1;
        }

        return this.generateSvg(countsByDay, year);
    }

    private generateSvg(countsByDay: { [key: string]: number }, year: number): string {
        const weeks = 53;
        const days = 7;
        const squareSize = 10;
        const gap = 2;
        const width = weeks * (squareSize + gap);
        const height = days * (squareSize + gap);

        const firstDay = new Date(year, 0, 1);
        const dayOffset = (firstDay.getDay() + 6) % 7;

        let svg = `<svg width="${width}" height="${height}">`;

        for (let week = 0; week < weeks; week++) {
            for (let day = 0; day < days; day++) {
                const dayIndex = week * 7 + day - dayOffset;
                const date = new Date(year, 0, dayIndex + 1);
                
                if (date.getFullYear() !== year) continue;

                const dateString = date.toISOString().slice(0, 10);
                const count = countsByDay[dateString] || 0;
                const color = this.getColor(count);

                svg += `<rect 
                    x="${week * (squareSize + gap)}" 
                    y="${day * (squareSize + gap)}" 
                    width="${squareSize}" 
                    height="${squareSize}" 
                    fill="${color}" 
                    data-count="${count}" 
                    data-date="${dateString}"
                />`;
            }
        }

        svg += `</svg>`;
        return svg;
    }

    private getColor(count: number): string {
        if (count === 0) return "#ebedf0";
        if (count <= 1) return "#9be9a8";
        if (count <= 3) return "#40c463";
        if (count <= 5) return "#30a14e";
        return "#216e39";
    }
}

export function createHeatmapGenerator(app: App, accountFolder: string): HeatmapGenerator {
    return new HeatmapGenerator(app, accountFolder);
}
