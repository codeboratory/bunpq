export abstract class Prompt<$Content> {
	name: string;
	type: string;
	content: $Content;

	constructor(type: string, name: string, content: $Content) {
		this.type = type;
		this.name = name;
		this.content = content;
	}
}

export type TextPromptContent = {
	text: string;
	cache: boolean;
};

export class TextPrompt extends Prompt<TextPromptContent> {
	constructor(name: string, content: TextPromptContent) {
		super("text", name, content);
	}
}
