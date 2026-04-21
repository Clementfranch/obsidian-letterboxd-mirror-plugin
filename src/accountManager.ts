import type { LetterboxdSettings } from "./types";

/**
 * Represents a single Letterboxd account (personal or friend)
 */
export interface LetterboxdAccount {
	/** Unique identifier for this account */
	id: string;
	/** Display name (e.g., "My Account", "Alice's Films") */
	name: string;
	/** Letterboxd username */
	username: string;
	/** Account type: personal (full data) or friend (watch history only) */
	type: "personal" | "friend";
	/** Folder path for this account's data (e.g., "Letterboxd/MyAccount") */
	folderPath: string;
	/** Sync frequency: daily, weekly, or manual only */
	syncFrequency: "daily" | "weekly" | "manual";
	/** Whether this is the currently active account */
	isActive: boolean;
	/** Last successful sync timestamp (ISO 8601 string) */
	lastSync: string | null;
	/** Custom settings overrides for this specific account (optional) */
	settingsOverrides?: Partial<LetterboxdSettings>;
}

/**
 * Manages multiple Letterboxd accounts
 */
export class AccountManager {
	private accounts: LetterboxdAccount[] = [];
	private activeAccountId: string | null = null;

	constructor() {}

	/**
	 * Initialize accounts from saved configuration
	 */
	loadFromConfig(config: {
		accounts: LetterboxdAccount[];
		activeAccountId: string | null;
	}): void {
		this.accounts = config.accounts || [];
		this.activeAccountId = config.activeAccountId;
	}

	/**
	 * Get current configuration for saving
	 */
	getConfig(): {
		accounts: LetterboxdAccount[];
		activeAccountId: string | null;
	} {
		return {
			accounts: this.accounts,
			activeAccountId: this.activeAccountId,
		};
	}

	/**
	 * Add a new account
	 */
	addAccount(
		name: string,
		username: string,
		type: "personal" | "friend" = "personal"
	): LetterboxdAccount {
		const id = `account-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
		const folderPath = `Letterboxd/${name.replace(/\s+/g, "-")}`;

		const account: LetterboxdAccount = {
			id,
			name,
			username,
			type,
			folderPath,
			syncFrequency: "manual",
			isActive: this.accounts.length === 0, // First account is active by default
			lastSync: null,
		};

		this.accounts.push(account);

		// Set as active if it's the first one
		if (this.accounts.length === 1) {
			this.activeAccountId = id;
		}

		return account;
	}

	/**
	 * Remove an account by ID
	 */
	removeAccount(accountId: string): boolean {
		const index = this.accounts.findIndex((a) => a.id === accountId);
		if (index === -1) return false;

		this.accounts.splice(index, 1);

		// If removed account was active, activate another
		if (this.activeAccountId === accountId) {
			this.activeAccountId = this.accounts.length > 0 ? this.accounts[0].id : null;
		}

		return true;
	}

	/**
	 * Set active account
	 */
	setActiveAccount(accountId: string): boolean {
		const account = this.accounts.find((a) => a.id === accountId);
		if (!account) return false;

		// Deactivate all
		this.accounts.forEach((a) => (a.isActive = false));
		// Activate selected
		account.isActive = true;
		this.activeAccountId = accountId;

		return true;
	}

	/**
	 * Get active account
	 */
	getActiveAccount(): LetterboxdAccount | null {
		if (!this.activeAccountId) return null;
		return this.accounts.find((a) => a.id === this.activeAccountId) || null;
	}

	/**
	 * Get all accounts
	 */
	getAllAccounts(): LetterboxdAccount[] {
		return [...this.accounts];
	}

	/**
	 * Get account by ID
	 */
	getAccount(accountId: string): LetterboxdAccount | null {
		return this.accounts.find((a) => a.id === accountId) || null;
	}

	/**
	 * Get account by username
	 */
	getAccountByUsername(username: string): LetterboxdAccount | null {
		return this.accounts.find((a) => a.username === username) || null;
	}

	/**
	 * Update account last sync timestamp
	 */
	updateLastSync(accountId: string): boolean {
		const account = this.accounts.find((a) => a.id === accountId);
		if (!account) return false;

		account.lastSync = new Date().toISOString();
		return true;
	}

	/**
	 * Update sync frequency for an account
	 */
	updateSyncFrequency(
		accountId: string,
		frequency: "daily" | "weekly" | "manual"
	): boolean {
		const account = this.accounts.find((a) => a.id === accountId);
		if (!account) return false;

		account.syncFrequency = frequency;
		return true;
	}

	/**
	 * Get accounts that need syncing based on frequency and last sync
	 */
	getAccountsDueForSync(): LetterboxdAccount[] {
		const now = new Date();

		return this.accounts.filter((account) => {
			if (account.syncFrequency === "manual") return false;

			if (!account.lastSync) return true; // Never synced

			const lastSyncDate = new Date(account.lastSync);
			const hoursSinceSync = (now.getTime() - lastSyncDate.getTime()) / (1000 * 60 * 60);

			if (account.syncFrequency === "daily") {
				return hoursSinceSync >= 24;
			}
			if (account.syncFrequency === "weekly") {
				return hoursSinceSync >= 7 * 24;
			}

			return false;
		});
	}

	/**
	 * Check if any accounts are configured
	 */
	hasAccounts(): boolean {
		return this.accounts.length > 0;
	}

	/**
	 * Get total number of accounts
	 */
	getAccountCount(): number {
		return this.accounts.length;
	}
}
