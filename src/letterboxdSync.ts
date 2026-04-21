import { Notice, TFile, TFolder, normalizePath } from "obsidian";
import type LetterboxdPlugin from "./main";
import type { LetterboxdAccount, LetterboxdEntry } from "./types";
import { fetchLetterboxdRSS } from "./letterboxd/parser";
import { renderTemplate, generateFilename } from "./notes/template";
import { ensureFolderExists } from "./utils/vault";
import { createFrontmatterKeyRegex } from "./utils/frontmatter";
import { notify } from "./utils/notify";

/**
 * Synchronization result for a single account
 */
export interface SyncResult {
	accountId: string;
	accountName: string;
	filmsCreated: number;
	filmsUpdated: number;
	errors: number;
	duration: number; // ms
}

/**
 * Gets all existing GUIDs from markdown files in a specific folder.
 */
async function getExistingGuids(plugin: LetterboxdPlugin, folderPath: string): Promise<Set<string>> {
	const { vault } = plugin.app;
	const { guidFrontmatterKey } = plugin.settings;
	const guids = new Set<string>();

	const folder = vault.getAbstractFileByPath(folderPath);
	if (!(folder instanceof TFolder)) {
		return guids;
	}

	const guidRegex = createFrontmatterKeyRegex(guidFrontmatterKey);
	const files = folder.children.filter(
		(f): f is TFile => f instanceof TFile && f.extension === "md"
	);

	for (const file of files) {
		try {
			const content = await vault.cachedRead(file);
			const guidMatch = content.match(guidRegex);
			if (guidMatch) {
				guids.add(guidMatch[1].trim());
			}
		} catch {
			// Skip unreadable files
		}
	}

	return guids;
}

/**
 * Creates a note for a Letterboxd entry in a specific folder.
 */
async function createNote(plugin: LetterboxdPlugin, entry: LetterboxdEntry, account: LetterboxdAccount): Promise<void> {
	const { vault } = plugin.app;
    // TODO: Use settings overrides from account
	const { filenameTemplate, noteTemplate } = plugin.settings;
    const folderPath = account.folderPath;

	const filename = generateFilename(filenameTemplate, entry);
	const content = renderTemplate(noteTemplate, entry);
	const filePath = normalizePath(`${folderPath}/${filename}.md`);

	const existingFile = vault.getAbstractFileByPath(filePath);
	if (existingFile) {
		const timestamp = Date.now();
		await vault.create(normalizePath(`${folderPath}/${filename} (${timestamp}).md`), content);
	} else {
		await vault.create(filePath, content);
	}
}


/**
 * Synchronize a single Letterboxd account
 * Fetches films and creates/updates notes in the account's folder
 */
export async function syncLetterboxdAccount(
	plugin: LetterboxdPlugin,
	account: LetterboxdAccount
): Promise<SyncResult> {
	const startTime = performance.now();
	const result: SyncResult = {
		accountId: account.id,
		accountName: account.name,
		filmsCreated: 0,
		filmsUpdated: 0,
		errors: 0,
		duration: 0,
	};
    const { notificationLevel, syncReviewsOnly } = plugin.settings;

	try {
		notify(`Syncing ${account.name}...`, notificationLevel, "progress");

		// TODO: Implement API-based fetch. For now, use RSS.
		const allEntries = await fetchLetterboxdRSS(account.username, (current, total) => {
			if (current % 5 === 0 || current === total) {
				notify(
					`${account.name}: Fetching entry ${current}/${total}...`,
					notificationLevel,
					"progress"
				);
			}
		});
        
        const entries = syncReviewsOnly
			? allEntries.filter((e) => e.review.length > 0)
			: allEntries;

		if (entries.length === 0) {
			notify(`${account.name}: No new entries found`, notificationLevel, "progress");
            result.duration = performance.now() - startTime;
			return result;
		}
        
        await ensureFolderExists(plugin, account.folderPath);
        const existingGuids = await getExistingGuids(plugin, account.folderPath);

        for (const entry of entries) {
			if (existingGuids.has(entry.guid)) {
				// For now we just skip, later we can update
				continue;
			}

			try {
				await createNote(plugin, entry, account);
				result.filmsCreated++;
			} catch (error) {
				console.error(`Letterboxd: Failed to create note for "${entry.filmTitle}" in account ${account.name}`, error);
				result.errors++;
			}
		}

	} catch (e) {
		result.errors++;
		console.error(
			`[Letterboxd Plugin] Error syncing account ${account.name}:`,
			e
		);
        notify(`Error syncing ${account.name}: ${e.message}`, notificationLevel, "error");
	}

	result.duration = performance.now() - startTime;
	return result;
}

/**
 * Synchronize the active account only
 */
export async function syncActiveAccount(
	plugin: LetterboxdPlugin
): Promise<SyncResult | null> {
	const activeAccount = plugin.getActiveAccount();
	if (!activeAccount) {
		new Notice("No active account selected. Add an account in settings.");
		return null;
	}

	const result = await syncLetterboxdAccount(plugin, activeAccount);

	plugin.updateAccountLastSync(activeAccount.id);
    
    const { notificationLevel } = plugin.settings;
	if (notificationLevel !== "silent") {
		const parts: string[] = [];
		if (result.filmsCreated > 0) parts.push(`${result.filmsCreated} created`);
		if (result.filmsUpdated > 0) parts.push(`${result.filmsUpdated} updated`);
		if (result.errors > 0) parts.push(`${result.errors} errors`);

		const message =
			parts.length > 0
				? `${activeAccount.name}: ${parts.join(", ")}`
				: `${activeAccount.name}: No changes`;

		new Notice(message);
	}

	return result;
}

/**
 * Synchronize all configured accounts
 */
export async function syncAllAccounts(
	plugin: LetterboxdPlugin
): Promise<SyncResult[]> {
	const accounts = plugin.getAllAccounts();
	if (accounts.length === 0) {
		new Notice("No accounts configured. Add an account in settings.");
		return [];
	}

	const results: SyncResult[] = [];
    new Notice(`Syncing ${accounts.length} accounts...`);

	for (const account of accounts) {
		const result = await syncLetterboxdAccount(plugin, account);
		results.push(result);
		plugin.updateAccountLastSync(account.id);
	}

	if (plugin.settings.notificationLevel !== "silent") {
		const totalCreated = results.reduce((sum, r) => sum + r.filmsCreated, 0);
		const totalUpdated = results.reduce((sum, r) => sum + r.filmsUpdated, 0);
		const totalErrors = results.reduce((sum, r) => sum + r.errors, 0);

		const parts: string[] = [];
		if (totalCreated > 0) parts.push(`${totalCreated} created`);
		if (totalUpdated > 0) parts.push(`${totalUpdated} updated`);
		if (totalErrors > 0) parts.push(`${totalErrors} errors`);

		const message =
			parts.length > 0
				? `All accounts synced: ${parts.join(", ")}`
				: "All accounts synced: No changes";

		new Notice(message);
	}

	return results;
}

/**
 * Sync accounts that are due for automatic sync based on their frequency
 */
export async function syncAccountsDueForSync(
	plugin: LetterboxdPlugin
): Promise<SyncResult[]> {
	const accountsDue = plugin.getAccountsDueForSync();
	if (accountsDue.length === 0) {
		return [];
	}

	const results: SyncResult[] = [];

	for (const account of accountsDue) {
		const result = await syncLetterboxdAccount(plugin, account);
		results.push(result);
		plugin.updateAccountLastSync(account.id);
	}

	return results;
}
