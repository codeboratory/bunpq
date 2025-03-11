import type { Nullable } from "./types";

export type MessageStatus =
	| "created"
	| "succeeded"
	| "errored"
	| "canceled"
	| "expired";

export interface MessageCreate {
	id: string;
	batch_id: string;
	model_name: string;
	prompt_name: string;
	status: MessageStatus;
	input: string;
}

export interface MessageUpdate {
	id: string;
	status: MessageStatus;
	output?: Nullable<string>;
	error?: Nullable<string>;
	cache_creation_input_tokens?: Nullable<number>;
	cache_read_input_tokens?: Nullable<number>;
	input_tokens?: Nullable<number>;
	output_tokens?: Nullable<number>;
}

export interface MessageInput {
	id: string;
	content: string;
}
