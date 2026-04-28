/**
 * Simple vault secrets wrapper with feature detection
 */

export async function setSecret(app: any, key: string, value: string): Promise<boolean> {
	try {
		const vault = app.vault as any;
		if (vault && typeof vault.setSecret === "function") {
			await vault.setSecret(key, value);
			return true;
		}
	} catch (e) {
		console.warn("vault.setSecret failed:", e);
	}
	return false;
}

export async function getSecret(app: any, key: string): Promise<string | null> {
	try {
		const vault = app.vault as any;
		if (vault && typeof vault.getSecret === "function") {
			const s = await vault.getSecret(key);
			return s || null;
		}
	} catch (e) {
		console.warn("vault.getSecret failed:", e);
	}
	return null;
}

export async function removeSecret(app: any, key: string): Promise<boolean> {
	try {
		const vault = app.vault as any;
		if (vault && typeof vault.removeSecret === "function") {
			await vault.removeSecret(key);
			return true;
		}
	} catch (e) {
		console.warn("vault.removeSecret failed:", e);
	}
	return false;
}
