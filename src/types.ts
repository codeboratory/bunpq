export type StorageUpdateData = {
	status: string;
	input_tokens?: number;
	output_tokens?: number;
};

export type BatchStatus = "in_progress" | "canceling" | "ended";

export type BatchStorageCreate = {
	id: string;
	status: BatchStatus;
};

export type BatchStorageUpdate = {
	id: string;
	status: BatchStatus;
};

export type MessageStatus =
	| "created"
	| "succeeded"
	| "errored"
	| "canceled"
	| "expired";

export type MessageStorageCreate = {
	id: string;
	batch_id: string;
	status: MessageStatus;
	content: string;
};

export type MessageStorageUpdate = {
	id: string;
	status: MessageStatus;
	cache_creation_input_tokens?: number | null;
	cache_read_input_tokens?: number | null;
	input_tokens?: number | null;
	output_tokens?: number | null;
	error?: string | null;
};

export interface Storage {
	createBatch(batch_data: BatchStorageCreate): Promise<void>;
	updateBatch(batch_data: BatchStorageUpdate): Promise<void>;
	randomBatches(limit: number, status: BatchStatus): Promise<string[]>;

	createMessage(message_data: MessageStorageCreate): Promise<void>;
	updateMessage(message_data: MessageStorageUpdate): Promise<void>;
}

export type MessageBatcherCreate = {
	id: string;
	content: string;
};

export type BatcherReadOnErrorError = "errored" | "canceled" | "expired";

export type BatcherReadOnValue = (
	custom_id: string,
	text: string,
) => Promise<void>;
export type BatcherReadOnError = (
	custom_id: string,
	error: BatcherReadOnErrorError,
) => Promise<void>;

export interface Batcher {
	create(messages: MessageBatcherCreate[]): Promise<string>;
	read(
		batch_id: string,
		onValue: BatcherReadOnValue,
		onError: BatcherReadOnError,
	): Promise<void>;
}
