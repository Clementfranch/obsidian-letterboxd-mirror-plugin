
import { App, Modal, Setting } from "obsidian";
import type { LetterboxdAccount } from "../types";

export type AddAccountDetails = Pick<LetterboxdAccount, "name" | "username" | "type"> & {
    apiKey: string;
};

type OnSaveCallback = (details: AddAccountDetails) => void;

export class AddAccountModal extends Modal {
    private details: AddAccountDetails;
    private onSave: OnSaveCallback;

    constructor(app: App, onSave: OnSaveCallback) {
        super(app);
        this.onSave = onSave;
        this.details = {
            name: "",
            username: "",
            apiKey: "",
            type: "personal",
        };
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        this.setTitle("Add Letterboxd Account");

        new Setting(contentEl)
            .setName("Account Name")
            .setDesc("A friendly name for this account (e.g., 'My Films', 'Alice's Watchlist').")
            .addText((text) =>
                text
                    .setPlaceholder("e.g., My Account")
                    .setValue(this.details.name)
                    .onChange((value) => {
                        this.details.name = value;
                    })
            );

        new Setting(contentEl)
            .setName("Letterboxd Username")
            .setDesc("The exact username on Letterboxd.")
            .addText((text) =>
                text
                    .setPlaceholder("e.g., username")
                    .setValue(this.details.username)
                    .onChange((value) => {
                        this.details.username = value;
                    })
            );

        new Setting(contentEl)
            .setName("Letterboxd API Key")
            .setDesc("Your Letterboxd API Key. This is stored as a secret in your vault.")
            .addText((text) => {
                text
                    .setPlaceholder("Enter API Key")
                    .setValue(this.details.apiKey)
                    .onChange((value) => {
                        this.details.apiKey = value;
                    });
                text.inputEl.type = "password";
            });

        new Setting(contentEl)
            .setName("Account Type")
            .setDesc("Personal for your own account, Friend for others.")
            .addDropdown((dropdown) =>
                dropdown
                    .addOption("personal", "Personal")
                    .addOption("friend", "Friend")
                    .setValue(this.details.type)
                    .onChange((value: "personal" | "friend") => {
                        this.details.type = value;
                    })
            );

        new Setting(contentEl)
            .addButton((btn) =>
                btn.setButtonText("Cancel").onClick(() => {
                    this.close();
                })
            )
            .addButton((btn) =>
                btn
                    .setButtonText("Save")
                    .setCta()
                    .onClick(() => {
                        if (!this.details.name || !this.details.username || !this.details.apiKey) {
                            new Notice("Please fill out all fields.");
                            return;
                        }
                        this.onSave(this.details);
                        this.close();
                    })
            );
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
