import { Plugin, Notice, TFile, Modal, Setting } from "obsidian";
import type { LetterboxdSettings, LetterboxdAccount } from "./types";
import { DEFAULT_SETTINGS, LetterboxdSettingTab } from "./settings";
import { syncDiary, importFromCSV } from "./notes/sync";
import { syncFilmsFromTMDB, syncAllFilmsFromDiary } from "./tmdb/sync";
import { fetchTMDBMovie } from "./tmdb/api";
import { AccountManager } from "./accountManager";
import {
	syncActiveAccount,
	syncAllAccounts,
	syncAccountsDueForSync,
} from "./letterboxdSync";
import { createWatchlistSync } from "./watchlistSync";
import { createLinkManager, openExternalUrl, copyUrlToClipboard } from "./linkManager";
import { createCollectionGenerator } from "./collectionGenerator";
import { createAnalyticsCalculator } from "./analyticsCalculator";
import { createDecadeOrganizer } from "./decadeOrganizer";
import { createQuoteGenerator } from "./quoteGenerator";
import { createHeatmapGenerator } from "./heatmapGenerator";
import { createTimelineGenerator } from "./timelineGenerator";
import { createChartsGenerator } from "./chartsGenerator";
import { createRankingsGenerator } from "./rankingsGenerator";
import { createStreakCalculator } from "./streakCalculator";
import { AddAccountModal, AddAccountDetails } from "./ui/add-account-modal";
import { SelectAccountModal } from "./ui/select-account-modal";
import { createTemplateManager, ReviewTemplateModal } from "./templates";
import { TMDBMovie } from "./tmdb/types";

/** Delay before auto-sync on startup (ms) - allows vault to fully load */
const STARTUP_SYNC_DELAY_MS = 3000;

/** Expected CSV filenames in Letterboxd export */
const DIARY_CSV_FILENAME = "diary.csv";
const REVIEWS_CSV_FILENAME = "reviews.csv";

export default class LetterboxdPlugin extends Plugin {
	settings: LetterboxdSettings;
	accountManager: AccountManager;

	async onload(): Promise<void> {
		await this.loadSettings();

		// Initialize account manager
		this.accountManager = new AccountManager();
		this.accountManager.loadFromConfig({
			accounts: this.settings.accounts || [],
			activeAccountId: this.settings.activeAccountId || null,
		});

		// Register settings tab
		this.addSettingTab(new LetterboxdSettingTab(this.app, this));

		// Register sync command
		this.addCommand({
			id: "sync-diary",
			name: "Sync Letterboxd diary",
			callback: () => this.syncDiary(),
		});

		// Register CSV import command
		this.addCommand({
			id: "import-csv",
			name: "Import from Letterboxd CSV export",
			callback: () => this.importCSVFolder(),
		});

		// Register TMDB sync command
		this.addCommand({
			id: "sync-films",
			name: "Sync TMDB film data",
			callback: () => this.syncTMDBFilms(),
		});

		// Debug: Check TMDB API Key in vault secrets
		this.addCommand({
			id: "debug-check-tmdb-key",
			name: "[Debug] Check TMDB API Key",
			callback: async () => {
				try {
					const secret = await this.app.vault.getSecret("letterboxd-tmdb-api-key");
					if (secret) {
						const masked = secret.substring(0, 20) + "...";
						new Notice(`✓ TMDB API Key found: ${masked}`);
						if (window.DEBUG) {
							console.log("[Letterboxd Plugin] TMDB API Key from vault:", secret);
						}
					} else {
						new Notice("⚠ No TMDB API Key found in vault secrets");
						if (window.DEBUG) {
							console.log("[Letterboxd Plugin] TMDB API Key: not set");
						}
					}
				} catch (e) {
					new Notice(`✗ Error accessing TMDB API Key: ${String(e)}`);
					console.error("[Letterboxd Plugin] Error retrieving TMDB API key:", e);
				}
			},
		});

		// ============================================================================
		// Multi-Account Commands
		// ============================================================================

		// Add Account
		this.addCommand({
			id: "add-account",
			name: "Add Letterboxd Account",
			callback: () => this.addNewAccount(),
		});

		// Switch Account
		this.addCommand({
			id: "switch-account",
			name: "Switch Letterboxd Account",
			callback: () => this.switchAccount(),
		});

		// Remove Account
		this.addCommand({
			id: "remove-account",
			name: "Remove Letterboxd Account",
			callback: () => this.removeAccount(),
		});

		// List Accounts
		this.addCommand({
			id: "list-accounts",
			name: "List Letterboxd Accounts",
			callback: () => this.listAccounts(),
		});

		// Sync Active Account
		this.addCommand({
			id: "sync-active-account",
			name: "Sync Active Account",
			callback: () => this.syncAccountCommand(),
		});

		// Sync All Accounts
		this.addCommand({
			id: "sync-all-accounts",
			name: "Sync All Accounts",
			callback: () => this.syncAllAccountsCommand(),
		});
        
        // Sync Watchlist
        this.addCommand({
            id: "sync-watchlist",
            name: "Sync Letterboxd Watchlist",
            callback: () => this.syncWatchlist(),
        });

		// ============================================================================
		// Link & Cross-Reference Commands
		// ============================================================================

		// Open Film in IMDb
		this.addCommand({
			id: "open-film-imdb",
			name: "Open Film in IMDb",
			callback: () => this.openFilmInService("imdb"),
		});

		// Open Film in TMDB
		this.addCommand({
			id: "open-film-tmdb",
			name: "Open Film in TMDB",
			callback: () => this.openFilmInService("tmdb"),
		});

		// Open Film in Letterboxd
		this.addCommand({
			id: "open-film-letterboxd",
			name: "Open Film in Letterboxd",
			callback: () => this.openFilmInService("letterboxd"),
		});

		// Open Film in Rotten Tomatoes
		this.addCommand({
			id: "open-film-rottentomatoes",
			name: "Open Film in Rotten Tomatoes",
			callback: () => this.openFilmInService("rottentomatoes"),
		});

		// Copy IMDb Link
		this.addCommand({
			id: "copy-imdb-link",
			name: "Copy IMDb Link",
			callback: () => this.copyFilmLink("imdb"),
		});

		// ============================================================================
		// Collection & Watchlist Commands
		// ============================================================================

		// Generate Watchlist
		this.addCommand({
			id: "generate-watchlist",
			name: "Generate Watchlist",
			callback: () => this.generateWatchlist(),
		});

		// Generate Favorites
		this.addCommand({
			id: "generate-favorites",
			name: "Generate Favorites Collection",
			callback: () => this.generateFavorites(),
		});

		// Generate Mood Collections
		this.addCommand({
			id: "generate-mood-collections",
			name: "Generate Mood Collections",
			callback: () => this.generateMoodCollections(),
		});

		// Generate Watch Time Analytics
		this.addCommand({
			id: "generate-watch-time",
			name: "Generate Watch Time Analytics",
			callback: () => this.generateWatchTimeAnalytics(),
		});
        
        // Generate Heatmap
        this.addCommand({
            id: "generate-heatmap",
            name: "Generate Watch Heatmap",
            callback: () => this.generateHeatmap(),
        });
        
        // Generate Timeline
        this.addCommand({
            id: "generate-timeline",
            name: "Generate Watch Timeline",
            callback: () => this.generateTimeline(),
        });
        
        // Generate Charts
        this.addCommand({
            id: "generate-charts",
            name: "Generate Charts & Statistics",
            callback: () => this.generateCharts(),
        });
        
        // Generate Rankings
        this.addCommand({
            id: "generate-rankings",
            name: "Generate Top Rankings",
            callback: () => this.generateRankings(),
        });
        
        // Generate Streak Report
        this.addCommand({
            id: "generate-streak-report",
            name: "Generate Watch Streak Report",
            callback: () => this.generateStreakReport(),
        });

		// Generate Decade Folders
		this.addCommand({
			id: "organize-by-decade",
			name: "Organize Films by Decade",
			callback: () => this.organizeFilmsByDecade(),
		});

		// Random Movie Citation
		this.addCommand({
			id: "random-movie-quote",
			name: "Random Movie Citation",
			callback: () => this.showRandomMovieQuote(),
		});

		// Create Review from Template
		this.addCommand({
			id: "create-film-review",
			name: "Create Detailed Film Review",
			callback: () => this.createFilmReview(),
		});

		this.addRibbonIcon("clapperboard", "Sync Letterboxd diary", () => {
			void this.syncDiary();
		});

		// Auto-sync on startup if enabled
		if (this.settings.syncOnStartup && this.settings.username) {
			this.registerInterval(
				window.setTimeout(() => {
					void this.syncDiary();
				}, STARTUP_SYNC_DELAY_MS)
			);
		}
	}

	onunload(): void {
		// Cleanup is handled automatically by register* methods
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		this.updateDebugMode();
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		// Save TMDB API key to vault secrets
		if (this.settings.tmdbApiKey) {
			try {
				await this.app.vault.setSecret("letterboxd-tmdb-api-key", this.settings.tmdbApiKey);
			} catch (e) {
				console.warn("[Letterboxd Plugin] Could not save API key to vault secret:", e);
			}
		}
	}

	updateDebugMode(): void {
		window.DEBUG = this.settings.debug;
		if (window.DEBUG) {
			console.log("[Letterboxd Plugin] Debug mode enabled");
		}
	}

	async getTmdbApiKey(): Promise<string> {
		try {
			const secret = await this.app.vault.getSecret("letterboxd-tmdb-api-key");
			if (secret) {
				return secret;
			}
		} catch (e) {
			console.warn("[Letterboxd Plugin] Error retrieving TMDB API key from vault:", e);
		}
		// Fallback to settings value
		return this.settings.tmdbApiKey || "";
	}

	/**
	 * Triggers a diary sync via RSS
	 * If TMDB API key is configured, also syncs Film notes for new entries
	 */
	async syncDiary(): Promise<void> {
		const result = await syncDiary(this);

		// If TMDB is enabled and we created new diary entries, sync Film notes
		if (this.settings.tmdbApiKey && result.createdTmdbIds.length > 0) {
			const tmdbResult = await syncFilmsFromTMDB(this, result.createdTmdbIds);
			if (tmdbResult.created > 0 || tmdbResult.errors > 0) {
				const parts: string[] = [];
				if (tmdbResult.created > 0) parts.push(`${tmdbResult.created} films created`);
				if (tmdbResult.skipped > 0) parts.push(`${tmdbResult.skipped} skipped`);
				if (tmdbResult.errors > 0) parts.push(`${tmdbResult.errors} errors`);
				new Notice(`TMDB: ${parts.join(", ")}`);
			}
		}
	}

	/**
	 * Syncs all TMDB Film notes from existing diary entries
	 */
	async syncTMDBFilms(): Promise<void> {
		if (!this.settings.tmdbApiKey) {
			new Notice("TMDB: please set your API key in settings.");
			return;
		}
		await syncAllFilmsFromDiary(this);
	}

	/**
	 * Opens folder picker to import Letterboxd CSV export
	 * Expects a folder containing diary.csv and optionally reviews.csv
	 */
	importCSVFolder(): void {
		// Create a file input that accepts directories
		// Note: webkitdirectory is not standard but works in Electron/Obsidian
		const input = document.createElement("input");
		input.type = "file";
		input.setAttribute("webkitdirectory", "");
		input.setAttribute("directory", "");

		input.onchange = async () => {
			const files = input.files;
			if (!files || files.length === 0) {
				return;
			}

			try {
				let diaryCSV: string | null = null;
				let reviewsCSV: string | null = null;

				// Find diary.csv and reviews.csv at the ROOT of the selected folder
				// webkitRelativePath format: "folderName/file.csv" for root files
				// vs "folderName/subfolder/file.csv" for nested files
				for (let i = 0; i < files.length; i++) {
					const file = files[i];
					const relativePath =
						(file as File & { webkitRelativePath?: string }).webkitRelativePath || "";
					const pathParts = relativePath.split("/");

					// Only process files at root level (exactly 2 parts: folder/file.csv)
					if (pathParts.length !== 2) continue;

					const filename = file.name.toLowerCase();

					if (filename === DIARY_CSV_FILENAME) {
						diaryCSV = await file.text();
					} else if (filename === REVIEWS_CSV_FILENAME) {
						reviewsCSV = await file.text();
					}
				}

				if (!diaryCSV && !reviewsCSV) {
					new Notice("Letterboxd: no diary.csv or reviews.csv found in folder.");
					return;
				}

				const csvResult = await importFromCSV(this, diaryCSV, reviewsCSV);

				// If TMDB is enabled and we have new films, sync Film notes
				if (this.settings.tmdbApiKey && csvResult.createdTmdbIds.length > 0) {
					new Notice(`TMDB: creating ${csvResult.createdTmdbIds.length} film notes...`);
					const tmdbResult = await syncFilmsFromTMDB(this, csvResult.createdTmdbIds);
					if (tmdbResult.created > 0 || tmdbResult.errors > 0) {
						const parts: string[] = [];
						if (tmdbResult.created > 0)
							parts.push(`${tmdbResult.created} films created`);
						if (tmdbResult.skipped > 0) parts.push(`${tmdbResult.skipped} skipped`);
						if (tmdbResult.errors > 0) parts.push(`${tmdbResult.errors} errors`);
						new Notice(`TMDB: ${parts.join(", ")}`);
					}
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : "Unknown error";
				new Notice(`Letterboxd: Failed to read CSV files - ${message}`);
				console.error("Letterboxd CSV read error:", error);
			}
		};

		input.click();
	}

	// ============================================================================
	// Multi-Account Methods
	// ============================================================================

	/**
	 * Get active account
	 */
	getActiveAccount(): LetterboxdAccount | null {
		return this.accountManager.getActiveAccount();
	}

	/**
	 * Get all accounts
	 */
	getAllAccounts(): LetterboxdAccount[] {
		return this.accountManager.getAllAccounts();
	}

	/**
	 * Get accounts due for automatic sync
	 */
	getAccountsDueForSync(): LetterboxdAccount[] {
		return this.accountManager.getAccountsDueForSync();
	}

	/**
	 * Update account last sync timestamp
	 */
	updateAccountLastSync(accountId: string): void {
		this.accountManager.updateLastSync(accountId);
		this.saveAccountsConfig();
	}

	/**
	 * Save account configuration to settings
	 */
	private saveAccountsConfig(): void {
		const config = this.accountManager.getConfig();
		this.settings.accounts = config.accounts;
		this.settings.activeAccountId = config.activeAccountId;
		void this.saveSettings();
	}

	/**
	 * Add a new account
	 */
	private addNewAccount(): void {
		new AddAccountModal(this.app, async (details: AddAccountDetails) => {
			const { name, username, apiKey, type } = details;

			// Check if account already exists
			if (this.accountManager.getAccountByUsername(username)) {
				new Notice(`An account with username '${username}' already exists.`);
				return;
			}

			// Add account to manager
			const newAccount = this.accountManager.addAccount(name, username, type);
			new Notice(`Account '${newAccount.name}' added.`);

			// Save API key to vault secrets
			try {
				await this.app.vault.setSecret(`letterboxd-api-key-${username}`, apiKey);
			} catch (e) {
				console.warn(`[Letterboxd Plugin] Could not save API key for ${username}:`, e);
				new Notice(`Could not save API key for ${username}.`);
			}

			// Persist updated accounts list
			this.saveAccountsConfig();
		}).open();
	}

	/**
	 * Switch to a different account
	 */
	private switchAccount(): void {
		const accounts = this.accountManager.getAllAccounts();
		if (accounts.length === 0) {
			new Notice("No accounts configured. Add one first.");
			return;
		}

		new SelectAccountModal(this.app, accounts, (selectedAccount) => {
			if (this.accountManager.setActiveAccount(selectedAccount.id)) {
				this.saveAccountsConfig();
				new Notice(`Switched to account: ${selectedAccount.name}`);
			}
		}).open();
	}

	/**
	 * Remove an account
	 */
	private removeAccount(): void {
		const accounts = this.accountManager.getAllAccounts();
		if (accounts.length === 0) {
			new Notice("No accounts to remove.");
			return;
		}

		new SelectAccountModal(this.app, accounts, (accountToRemove) => {
			// Confirmation modal
			const confirmationModal = new Modal(this.app);
			confirmationModal.contentEl.createEl("h2", { text: `Remove ${accountToRemove.name}?` });
			confirmationModal.contentEl.createEl("p", { text: "This will remove the account from the plugin. It will not delete any files." });

			new Setting(confirmationModal.contentEl)
				.addButton((btn) =>
					btn.setButtonText("Cancel").onClick(() => {
						confirmationModal.close();
					})
				)
				.addButton((btn) =>
					btn
						.setButtonText("Remove")
						.setWarning()
						.onClick(async () => {
							this.accountManager.removeAccount(accountToRemove.id);
							try {
								await this.app.vault.removeSecret(`letterboxd-api-key-${accountToRemove.username}`);
							} catch (e) {
								console.warn(`[Letterboxd Plugin] Could not remove API key for ${accountToRemove.username}:`, e);
							}
							this.saveAccountsConfig();
							new Notice(`Account '${accountToRemove.name}' removed.`);
							confirmationModal.close();
						})
				);
			confirmationModal.open();
		}).open();
	}

	/**
	 * List all accounts
	 */
	private listAccounts(): void {
		const accounts = this.accountManager.getAllAccounts();
		if (accounts.length === 0) {
			new Notice("No accounts configured.");
			return;
		}

		const accountsList = accounts
			.map((acc) => {
				const lastSync = acc.lastSync
					? new Date(acc.lastSync).toLocaleString()
					: "Never";
				const active = acc.isActive ? "✓ Active" : "";
				return `• ${acc.name} (${acc.username}) - ${acc.type} ${active}
  Last sync: ${lastSync}`;
			})
			.join("
");

		new Notice(`Accounts:

${accountsList}`);
	}

	/**
	 * Sync active account
	 */
	private async syncAccountCommand(): Promise<void> {
		const result = await syncActiveAccount(this);
		if (result) {
			this.saveAccountsConfig();
		}
	}

	/**
	 * Sync all accounts
	 */
	private async syncAllAccountsCommand(): Promise<void> {
		const results = await syncAllAccounts(this);
		if (results.length > 0) {
			this.saveAccountsConfig();
		}
	}
    
    /**
     * Sync watchlist for active account
     */
    private async syncWatchlist(): Promise<void> {
        const activeAccount = this.accountManager.getActiveAccount();
        if (!activeAccount) {
            new Notice("No active account selected");
            return;
        }

        const syncer = createWatchlistSync(this);
        await syncer.syncWatchlist(activeAccount);
    }

	// ============================================================================
	// Link & Cross-Reference Methods
	// ============================================================================

	/**
	 * Get current file's film metadata
	 */
	private getFilmMetadata(): Record<string, unknown> | null {
		const file = this.app.workspace.getActiveFile();
		if (!file) {
			new Notice("No file is currently active");
			return null;
		}

		// Read frontmatter from active file
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache || !cache.frontmatter) {
			new Notice("No frontmatter found in current file");
			return null;
		}

		return cache.frontmatter;
	}

	/**
	 * Open film in external service
	 */
	private openFilmInService(service: "imdb" | "tmdb" | "letterboxd" | "rottentomatoes"): void {
		const metadata = this.getFilmMetadata();
		if (!metadata) return;

		const linkManager = createLinkManager(this.settings.tmdbApiKey);
		const title = String(metadata.title_original || metadata.title_fr || "");
		const imdbId = String(metadata.imdb_id || "");
		const tmdbId = String(metadata.tmdb_id || metadata.tmdb_url || "");
		const year = Number(metadata.year || 0);

		let url: string | null = null;

		switch (service) {
			case "imdb":
				url = linkManager.getImdbUrl(imdbId);
				break;
			case "tmdb":
				url = linkManager.getTmdbUrl(tmdbId);
				break;
			case "letterboxd":
				url = linkManager.getLetterboxdUrl(title, year);
				break;
			case "rottentomatoes":
				url = linkManager.getRottenTomatoesUrl(title);
				break;
		}

		if (url) {
			openExternalUrl(url);
		} else {
			new Notice(`Could not find ${service.toUpperCase()} link for this film`);
		}
	}

	/**
	 * Copy film link to clipboard
	 */
	private copyFilmLink(service: "imdb" | "tmdb" | "letterboxd" | "rottentomatoes"): void {
		const metadata = this.getFilmMetadata();
		if (!metadata) return;

		const linkManager = createLinkManager(this.settings.tmdbApiKey);
		const title = String(metadata.title_original || metadata.title_fr || "");
		const imdbId = String(metadata.imdb_id || "");
		const tmdbId = String(metadata.tmdb_id || metadata.tmdb_url || "");
		const year = Number(metadata.year || 0);

		let url: string | null = null;

		switch (service) {
			case "imdb":
				url = linkManager.getImdbUrl(imdbId);
				break;
			case "tmdb":
				url = linkManager.getTmdbUrl(tmdbId);
				break;
			case "letterboxd":
				url = linkManager.getLetterboxdUrl(title, year);
				break;
			case "rottentomatoes":
				url = linkManager.getRottenTomatoesUrl(title);
				break;
		}

		if (url) {
			void copyUrlToClipboard(url);
		} else {
			new Notice(`Could not find ${service.toUpperCase()} link for this film`);
		}
	}

	// ============================================================================
	// Collection & Watchlist Methods
	// ============================================================================

	/**
	 * Generate watchlist for active account
	 */
	private async generateWatchlist(): Promise<void> {
		const activeAccount = this.accountManager.getActiveAccount();
		if (!activeAccount) {
			new Notice("No active account selected");
			return;
		}

		const generator = createCollectionGenerator(this.app, activeAccount.folderPath);
		const result = await generator.generateWatchlist();

		if (result.success) {
			new Notice(result.message);
		} else {
			new Notice(`Failed to generate watchlist: ${result.message}`);
		}
	}

	/**
	 * Generate favorites for active account
	 */
	private async generateFavorites(): Promise<void> {
		const activeAccount = this.accountManager.getActiveAccount();
		if (!activeAccount) {
			new Notice("No active account selected");
			return;
		}

		const generator = createCollectionGenerator(this.app, activeAccount.folderPath);
		const result = await generator.generateFavorites();

		if (result.success) {
			new Notice(result.message);
		} else {
			new Notice(`Failed to generate favorites: ${result.message}`);
		}
	}

	/**
	 * Generate mood-based collections for active account
	 */
	private async generateMoodCollections(): Promise<void> {
		const activeAccount = this.accountManager.getActiveAccount();
		if (!activeAccount) {
			new Notice("No active account selected");
			return;
		}

		const generator = createCollectionGenerator(this.app, activeAccount.folderPath);
		const results = await generator.generateMoodCollections();

		if (results.length > 0) {
			new Notice(`Generated ${results.length} mood collections`);
		} else {
			new Notice("No mood collections generated");
		}
	}

	/**
	 * Generate watch time analytics for active account
	 */
	private async generateWatchTimeAnalytics(): Promise<void> {
		const activeAccount = this.accountManager.getActiveAccount();
		if (!activeAccount) {
			new Notice("No active account selected");
			return;
		}

		const calculator = createAnalyticsCalculator(this.app, activeAccount.folderPath);
		const content = await calculator.generateTotalWatchTimeReport();

		// Write to Analytics folder
		const filePath = `${activeAccount.folderPath}/Analytics/TotalTime.md`;
		try {
			const existingFile = this.app.vault.getAbstractFileByPath(filePath);
			if (existingFile instanceof TFile) {
				await this.app.vault.modify(existingFile, content);
			} else {
				// Create folder first
				await this.app.vault.createFolder(`${activeAccount.folderPath}/Analytics`).catch(() => {
					// Folder might exist
				});
				await this.app.vault.create(filePath, content);
			}
			new Notice("Watch time analytics generated");
		} catch (error) {
			console.error("Error generating analytics:", error);
			new Notice("Failed to generate analytics");
		}
	}
    
    /**
     * Generate watch heatmap for active account
     */
    private async generateHeatmap(): Promise<void> {
        const activeAccount = this.accountManager.getActiveAccount();
        if (!activeAccount) {
            new Notice("No active account selected");
            return;
        }

        const generator = createHeatmapGenerator(this.app, activeAccount.folderPath);
        const svg = await generator.generateHeatmap();

        const filePath = `${activeAccount.folderPath}/Analytics/Heatmap.md`;
        try {
            const existingFile = this.app.vault.getAbstractFileByPath(filePath);
            if (existingFile instanceof TFile) {
                await this.app.vault.modify(existingFile, svg);
            } else {
                await this.app.vault.createFolder(`${activeAccount.folderPath}/Analytics`).catch(() => {});
                await this.app.vault.create(filePath, svg);
            }
            new Notice("Watch heatmap generated");
        } catch (error) {
            console.error("Error generating heatmap:", error);
            new Notice("Failed to generate heatmap");
        }
    }
    
    /**
     * Generate watch timeline for active account
     */
    private async generateTimeline(): Promise<void> {
        const activeAccount = this.accountManager.getActiveAccount();
        if (!activeAccount) {
            new Notice("No active account selected");
            return;
        }

        const generator = createTimelineGenerator(this.app, activeAccount.folderPath);
        const content = await generator.generateTimeline();

        const filePath = `${activeAccount.folderPath}/Analytics/Timeline.md`;
        try {
            const existingFile = this.app.vault.getAbstractFileByPath(filePath);
            if (existingFile instanceof TFile) {
                await this.app.vault.modify(existingFile, content);
            } else {
                await this.app.vault.createFolder(`${activeAccount.folderPath}/Analytics`).catch(() => {});
                await this.app.vault.create(filePath, content);
            }
            new Notice("Watch timeline generated");
        } catch (error) {
            console.error("Error generating timeline:", error);
            new Notice("Failed to generate timeline");
        }
    }
    
    /**
     * Generate charts for active account
     */
    private async generateCharts(): Promise<void> {
        const activeAccount = this.accountManager.getActiveAccount();
        if (!activeAccount) {
            new Notice("No active account selected");
            return;
        }

        const generator = createChartsGenerator(this.app, activeAccount.folderPath);
        const content = await generator.generateCharts();

        const filePath = `${activeAccount.folderPath}/Analytics/Charts.md`;
        try {
            const existingFile = this.app.vault.getAbstractFileByPath(filePath);
            if (existingFile instanceof TFile) {
                await this.app.vault.modify(existingFile, content);
            } else {
                await this.app.vault.createFolder(`${activeAccount.folderPath}/Analytics`).catch(() => {});
                await this.app.vault.create(filePath, content);
            }
            new Notice("Charts & statistics generated");
        } catch (error) {
            console.error("Error generating charts:", error);
            new Notice("Failed to generate charts");
        }
    }
    
    /**
     * Generate rankings for active account
     */
    private async generateRankings(): Promise<void> {
        const activeAccount = this.accountManager.getActiveAccount();
        if (!activeAccount) {
            new Notice("No active account selected");
            return;
        }

        const generator = createRankingsGenerator(this.app, activeAccount.folderPath);
        const content = await generator.generateRankings();

        const filePath = `${activeAccount.folderPath}/Analytics/Rankings.md`;
        try {
            const existingFile = this.app.vault.getAbstractFileByPath(filePath);
            if (existingFile instanceof TFile) {
                await this.app.vault.modify(existingFile, content);
            } else {
                await this.app.vault.createFolder(`${activeAccount.folderPath}/Analytics`).catch(() => {});
                await this.app.vault.create(filePath, content);
            }
            new Notice("Top rankings generated");
        } catch (error) {
            console.error("Error generating rankings:", error);
            new Notice("Failed to generate rankings");
        }
    }
    
    /**
     * Generate streak report for active account
     */
    private async generateStreakReport(): Promise<void> {
        const activeAccount = this.accountManager.getActiveAccount();
        if (!activeAccount) {
            new Notice("No active account selected");
            return;
        }

        const generator = createStreakCalculator(this.app, activeAccount.folderPath);
        const content = await generator.generateStreakReport();

        const filePath = `${activeAccount.folderPath}/Analytics/Streak.md`;
        try {
            const existingFile = this.app.vault.getAbstractFileByPath(filePath);
            if (existingFile instanceof TFile) {
                await this.app.vault.modify(existingFile, content);
            } else {
                await this.app.vault.createFolder(`${activeAccount.folderPath}/Analytics`).catch(() => {});
                await this.app.vault.create(filePath, content);
            }
            new Notice("Watch streak report generated");
        } catch (error) {
            console.error("Error generating streak report:", error);
            new Notice("Failed to generate streak report");
        }
    }

	/**
	 * Organize films by decade
	 */
	private async organizeFilmsByDecade(): Promise<void> {
		const activeAccount = this.accountManager.getActiveAccount();
		if (!activeAccount) {
			new Notice("No active account selected");
			return;
		}

		const organizer = createDecadeOrganizer(this.app, activeAccount.folderPath);
		const results = await organizer.generateDecadeFolders();

		if (results.length > 0) {
			new Notice(`Organized ${results.length} decades with ${results.reduce((sum, r) => sum + r.count, 0)} films`);
		} else {
			new Notice("No films to organize");
		}
	}

	/**
	 * Show random movie quote
	 */
	private async showRandomMovieQuote(): Promise<void> {
		const activeAccount = this.accountManager.getActiveAccount();
		if (!activeAccount) {
			new Notice("No active account selected");
			return;
		}

		const generator = createQuoteGenerator(this.app, activeAccount.folderPath);
		const quote = await generator.getRandomMovieQuote();

		if (quote) {
			const display = generator.formatQuoteDisplay(quote);
			new Notice(display);
		} else {
			new Notice("No films found with quotes");
		}
	}

    /**
     * Create a new film review from a template.
     */
    private async createFilmReview(): Promise<void> {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
            new Notice("No file is currently active.");
            return;
        }

        const metadata = this.getFilmMetadata();
        if (!metadata) {
            new Notice("No frontmatter found in current file.");
            return;
        }

        const filmTitle = String(metadata.title_original || metadata.title_fr || file.basename);
        const filmYear = Number(metadata.year);
        const tmdbId = String(metadata.tmdb_id || "");

        let movie: TMDBMovie | undefined;
        if (tmdbId) {
            const tmdbApiKey = await this.getTmdbApiKey();
            if (tmdbApiKey) {
                try {
                    movie = await fetchTMDBMovie(tmdbId, tmdbApiKey, this.settings.tmdbLanguage, true);
                } catch (e) {
                    console.warn(`[Letterboxd Plugin] Could not fetch TMDB data for ${tmdbId}:`, e);
                }
            }
        }
        
        const templateManager = createTemplateManager(this.app);
        const modal = new ReviewTemplateModal(this.app, templateManager, filmTitle, filmYear, movie);
        modal.onSelected = (templateName, movie) => {
            templateManager.createReviewFromTemplate(templateName, filmTitle, filmYear, movie);
        };
        modal.open();
    }
}
