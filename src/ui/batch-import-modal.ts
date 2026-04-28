import { App, Modal, Setting, TextComponent, ButtonComponent } from "obsidian";
import type LetterboxdPlugin from "../main";

export interface BatchImportItem {
    title: string;
    rating?: number;
    status?: "to-watch" | "watched" | "rewatching";
    tags?: string[];
}

export class BatchImportModal extends Modal {
    private items: BatchImportItem[];
    private onConfirm: (items: BatchImportItem[]) => void;
    private ratingMax: number;

    constructor(app: App, items: BatchImportItem[], ratingMax: number, onConfirm: (items: BatchImportItem[]) => void) {
        super(app);
        this.items = items.map(i => ({ ...i }));
        this.onConfirm = onConfirm;
        this.ratingMax = ratingMax || 10;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        this.setTitle("Batch Import - Review and edit items");

        const container = contentEl.createDiv({ cls: "batch-import-list" });
        container.style.maxHeight = "60vh";
        container.style.overflow = "auto";

        this.items.forEach((item, idx) => {
            const row = container.createDiv({ cls: "batch-import-row" });
            row.style.borderBottom = "1px solid var(--divider)";
            row.style.padding = "8px 4px";

            // Title
            const titleSetting = new Setting(row)
                .setName(`${idx + 1}. ${item.title}`)
                .addText((t) => {
                    t.setValue(item.title).onChange((v) => (this.items[idx].title = v));
                });

            // Rating (number input)
            const ratingInput = row.createEl("input", { type: "number", cls: "setting-text-input" }) as HTMLInputElement;
            ratingInput.style.width = "80px";
            ratingInput.min = "0";
            ratingInput.max = String(this.ratingMax);
            ratingInput.value = (item.rating || 0).toString();
            ratingInput.addEventListener("change", () => {
                const v = parseInt(ratingInput.value || "0", 10) || 0;
                this.items[idx].rating = Math.max(0, Math.min(this.ratingMax, v));
            });
            const ratingLabel = row.createEl("div");
            ratingLabel.style.marginTop = "6px";
            ratingLabel.appendChild(document.createTextNode("Rating (0 to " + this.ratingMax + ")"));
            ratingLabel.appendChild(ratingInput);

            // Status dropdown
            new Setting(row).addDropdown((dd) => {
                dd.addOption("to-watch", "to-watch");
                dd.addOption("watched", "watched");
                dd.addOption("rewatching", "rewatching");
                dd.setValue(item.status || "to-watch");
                dd.onChange((v) => (this.items[idx].status = v as any));
            });

            // Tags input
            new Setting(row)
                .setName("Tags (comma-separated)")
                .addText((t) => t.setValue((item.tags || []).join(", ")).onChange((v) => (this.items[idx].tags = v.split(",").map(s=>s.trim()).filter(Boolean))));

        });

        // Buttons
        const btnRow = contentEl.createDiv({ cls: "modal-buttons" });
        btnRow.style.display = "flex";
        btnRow.style.justifyContent = "flex-end";
        btnRow.style.gap = "8px";
        btnRow.style.marginTop = "12px";

        const cancelBtn = btnRow.createEl("button", { text: "Cancel", cls: "modal-button" }) as HTMLButtonElement;
        cancelBtn.addEventListener("click", () => this.close());

        const importBtn = btnRow.createEl("button", { text: "Import", cls: "mod-cta" }) as HTMLButtonElement;
        importBtn.addEventListener("click", () => {
            // finalize any empty ratings
            this.items = this.items.map(it => ({ ...it, rating: it.rating || 0, status: it.status || "to-watch" }));
            this.onConfirm(this.items);
            this.close();
        });

        contentEl.appendChild(btnRow);
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
