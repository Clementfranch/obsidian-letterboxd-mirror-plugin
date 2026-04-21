import { App, TFolder, TFile } from "obsidian";

interface FilmWatchData {
    watch_date: string;
}

export interface StreakInfo {
    currentStreak: number;
    longestStreak: number;
    lastWatchDate: Date | null;
}

export class StreakCalculator {
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

    public async calculateStreaks(): Promise<StreakInfo> {
        const films = await this.getWatchedFilms();
        if (films.length === 0) {
            return { currentStreak: 0, longestStreak: 0, lastWatchDate: null };
        }

        const watchDates = films
            .map(f => new Date(f.watch_date).toISOString().slice(0, 10))
            .filter((v, i, a) => a.indexOf(v) === i) // Unique dates
            .sort();

        let currentStreak = 0;
        let longestStreak = 0;
        let lastWatchDate: Date | null = null;
        
        if (watchDates.length > 0) {
            longestStreak = 1;
            currentStreak = 1;
            lastWatchDate = new Date(watchDates[watchDates.length - 1]);
            
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const yesterday = new Date(today);
            yesterday.setDate(today.getDate() - 1);

            if (lastWatchDate.getTime() === today.getTime() || lastWatchDate.getTime() === yesterday.getTime()) {
                // part of current streak
            } else {
                currentStreak = 0; // streak is broken
            }
        }
        
        for (let i = 1; i < watchDates.length; i++) {
            const currentDate = new Date(watchDates[i]);
            const prevDate = new Date(watchDates[i-1]);
            
            const diffTime = Math.abs(currentDate.getTime() - prevDate.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays === 1) {
                currentStreak++;
            } else {
                if (currentStreak > longestStreak) {
                    longestStreak = currentStreak;
                }
                currentStreak = 1;
            }
        }
        if (currentStreak > longestStreak) {
            longestStreak = currentStreak;
        }

        return { currentStreak, longestStreak, lastWatchDate };
    }

    public async generateStreakReport(): Promise<string> {
        const streaks = await this.calculateStreaks();
        
        let content = "# Watch Streak\\n\\n";
        content += `- **Current Streak:** ${streaks.currentStreak} days
`;
        content += `- **Longest Streak:** ${streaks.longestStreak} days
`;
        if (streaks.lastWatchDate) {
            content += `- **Last Film Watched:** ${streaks.lastWatchDate.toISOString().slice(0, 10)}
`;
        }
        content += `
${this.getStreakEmoji(streaks.currentStreak)}
`;

        content += `---

_Generated automatically. Last updated: ${new Date().toISOString()}_
`;

        return content;
    }

    private getStreakEmoji(streak: number): string {
        if (streak === 0) return "🧊";
        if (streak < 5) return "🔥";
        if (streak < 10) return "🔥🔥";
        if (streak < 20) return "🔥🔥🔥";
        if (streak < 50) return "🚀";
        return "🌌";
    }
}

export function createStreakCalculator(app: App, accountFolder: string): StreakCalculator {
    return new StreakCalculator(app, accountFolder);
}

