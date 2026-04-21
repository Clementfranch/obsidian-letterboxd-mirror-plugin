import { App, Modal, Setting, TFile } from "obsidian";
import type { TMDBMovie } from "./tmdb/types";

/** Review template content */
export interface ReviewTemplate {
	name: string;
	content: string;
	description: string;
}

/** Templates manager */
export class TemplateManager {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Get predefined review templates
	 */
	getReviewTemplates(): ReviewTemplate[] {
		return [
			{
				name: "Detailed Film Review",
				description: "Comprehensive review with plot, technical aspects, and personal thoughts",
				content: `---
type: movie-review
film: "[[{{FILM_TITLE}}]]"
year: {{YEAR}}
director: {{DIRECTOR}}
poster: {{POSTER_URL}}
---

# Review of [[{{FILM_TITLE}}]]

![Poster|200]({{POSTER_URL}})

## Synopsis
> {{SYNOPSIS}}

## Strengths

- {{Strength 1}}
- {{Strength 2}}

## Weaknesses

- {{Weakness 1}}

## Overall

{{Your personal reaction and interpretation}}

## Final Rating

**Overall:** /10

---

_Review written: {{DATE}}_
`,
			},
			{
				name: "Quick Review",
				description: "Brief review focusing on overall impression and recommendation",
				content: `---
type: movie-review
film: "[[{{FILM_TITLE}}]]"
year: {{YEAR}}
---

# What I Thought

{{Quick overall impression}}

**Rating:** /10

---

_Watched on: {{DATE}}_
`,
			},
		];
	}

	/**
	 * Create a new review from template
	 */
	async createReviewFromTemplate(
        templateName: string, 
        filmTitle: string, 
        year?: number,
        movie?: TMDBMovie
    ): Promise<void> {
		const templates = this.getReviewTemplates();
		const template = templates.find((t) => t.name === templateName);

		if (!template) {
			throw new Error(`Template "${templateName}" not found`);
		}

		// Fill in placeholders
		let content = template.content;
		content = content.replace(/{{FILM_TITLE}}/g, filmTitle);
		content = content.replace(/{{YEAR}}/g, year ? String(year) : "");
		content = content.replace(/{{DATE}}/g, new Date().toISOString().split("T")[0]);

        if (movie) {
            content = content.replace(/{{DIRECTOR}}/g, movie.directors.join(", "));
            content = content.replace(/{{SYNOPSIS}}/g, movie.overview);
            content = content.replace(/{{POSTER_URL}}/g, movie.posterUrlL);
        }

		// Create file
		const filename = `${filmTitle}_Review.md`;
		const folderPath = "Efforts/Reviews"; // TODO: Make this configurable

		try {
			await this.app.vault.createFolder(folderPath).catch(() => {
				// Folder exists
			});

			const newFile = await this.app.vault.create(`${folderPath}/${filename}`, content);
            this.app.workspace.getLeaf(true).openFile(newFile);
		} catch (error) {
			console.error("Error creating review file:", error);
			throw error;
		}
	}

	/**
	 * Get list of template names
	 */
	getTemplateNames(): string[] {
		return this.getReviewTemplates().map((t) => t.name);
	}
}

/**
 * Modal for selecting review template
 */
export class ReviewTemplateModal extends Modal {
	templateManager: TemplateManager;
	filmTitle: string;
	filmYear?: number;
    movie?: TMDBMovie;
	onSelected: (templateName: string, movie?: TMDBMovie) => void;

	constructor(app: App, templateManager: TemplateManager, filmTitle: string, filmYear?: number, movie?: TMDBMovie) {
		super(app);
		this.templateManager = templateManager;
		this.filmTitle = filmTitle;
		this.filmYear = filmYear;
        this.movie = movie;
		this.onSelected = () => {
			/* empty */
		};
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: `Create Review for "${this.filmTitle}"` });
		contentEl.createEl("p", { text: "Select a review template to get started:" });

		const templates = this.templateManager.getReviewTemplates();

		for (const template of templates) {
			const container = contentEl.createEl("div", {
				cls: "review-template-option",
			});
			container.style.cssText = `
				padding: 12px;
				margin: 8px 0;
				border: 1px solid #ccc;
				border-radius: 4px;
				cursor: pointer;
				transition: all 0.2s ease;
			`;
			container.onmouseover = () => {
				container.style.backgroundColor = "#f5f5f5";
			};
			container.onmouseout = () => {
				container.style.backgroundColor = "transparent";
			};

			const title = container.createEl("div", {
				text: template.name,
				cls: "review-template-title",
			});
			title.style.cssText = "font-weight: bold; margin-bottom: 4px;";

			const description = container.createEl("div", {
				text: template.description,
				cls: "review-template-description",
			});
			description.style.cssText = "font-size: 0.9em; color: #666;";

			container.onclick = () => {
				this.onSelected(template.name, this.movie);
				this.close();
			};
		}
	}

	onClose(): void {
		const { contentEl } = this;
		if (contentEl) {
			contentEl.empty();
		}
	}
}

/**
 * Create a TemplateManager instance (factory)
 */
export function createTemplateManager(app: App): TemplateManager {
	return new TemplateManager(app);
}
