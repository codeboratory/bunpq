import type Anthropic from "@anthropic-ai/sdk";
import type { MessageCreateParamsBase } from "@anthropic-ai/sdk/resources/messages/index.mjs";
import type {
	Batcher,
	BatcherReadOnError,
	BatcherReadOnValue,
	MessageBatcherCreate,
	Storage,
} from "../types";

export type AnthropicParams = Omit<
	MessageCreateParamsBase,
	"messages" | "stream" | "system"
>;

export class AnthropicBatcher implements Batcher {
	private client: Anthropic;
	private storage: Storage;
	private params: AnthropicParams;
	private system: string;

	private content_index: number;

	constructor(
		client: Anthropic,
		storage: Storage,
		params: AnthropicParams,
		system: string,
	) {
		this.client = client;
		this.storage = storage;
		this.params = params;
		this.system = system;
		this.content_index = params.thinking?.type === "enabled" ? 1 : 0;
	}

	async create(messages: MessageBatcherCreate[]) {
		const batch = await this.client.messages.batches.create({
			requests: messages.map((v) => ({
				custom_id: v.id,
				params: {
					...this.params,
					system: this.system,
					messages: [
						{
							role: "user",
							content: v.content,
						},
					],
				},
			})),
		});

		await this.storage.createBatch({
			id: batch.id,
			status: batch.processing_status,
		});

		for (const message of messages) {
			await this.storage.createMessage({
				id: message.id,
				batch_id: batch.id,
				status: "created",
				input: message.content,
			});
		}

		return batch.id;
	}

	async read(
		batch_id: string,
		onValue: BatcherReadOnValue,
		onError: BatcherReadOnError,
	) {
		const batch = await this.client.messages.batches.retrieve(batch_id);
		const batch_status = batch.processing_status;

		await this.storage.updateBatch({
			id: batch_id,
			status: batch_status,
		});

		if (batch_status !== "ended") {
			return;
		}

		const results = await this.client.messages.batches.results(batch_id);

		for await (const result of results) {
			const custom_id = result.custom_id;

			if (result.result.type === "succeeded") {
				const { content, usage } = result.result.message;
				const content_block = content[this.content_index];

				if (content_block.type === "text") {
					this.storage.updateMessage({
						id: custom_id,
						status: result.result.type,
						output: content_block.text,
						...usage,
					});

					await onValue(custom_id, content_block.text);
				} else {
					this.storage.updateMessage({
						id: custom_id,
						status: "errored",
						error: `Instead of type "text" got type "${content_block.type}"`,
					});

					await onError(custom_id, "errored");
				}
			} else {
				this.storage.updateMessage({
					id: custom_id,
					status: result.result.type,
					error:
						result.result.type === "errored"
							? result.result.error.error.message
							: null,
				});

				await onError(custom_id, result.result.type);
			}
		}
	}
}
