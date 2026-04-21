
import { App, SuggestModal } from "obsidian";
import type { LetterboxdAccount } from "../types";

export class SelectAccountModal extends SuggestModal<LetterboxdAccount> {
    constructor(
        app: App,
        private accounts: LetterboxdAccount[],
        private onChoose: (account: LetterboxdAccount) => void
    ) {
        super(app);
    }

    getSuggestions(query: string): LetterboxdAccount[] {
        return this.accounts.filter((account) =>
            account.name.toLowerCase().includes(query.toLowerCase()) ||
            account.username.toLowerCase().includes(query.toLowerCase())
        );
    }

    renderSuggestion(account: LetterboxdAccount, el: HTMLElement) {
        el.createEl("div", { text: account.name });
        el.createEl("small", { text: account.username });
    }

    onChooseSuggestion(account: LetterboxdAccount, evt: MouseEvent | KeyboardEvent) {
        this.onChoose(account);
    }
}
