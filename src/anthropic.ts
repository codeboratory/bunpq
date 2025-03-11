import type Anthropic from "@anthropic-ai/sdk";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages";
import type { OnError, OnValue } from "./batcher";
import { Batcher } from "./batcher";
import type { MessageInput } from "./message";
import { Model } from "./model";
import type { TextPrompt } from "./prompt";

export class AnthropicModel extends Model<MessageCreateParamsNonStreaming> {
	get content_index() {
		return this.params.thinking?.type === "enabled" ? 1 : 0;
	}
}

export class AnthropicBatcher extends Batcher<
	Anthropic,
	AnthropicModel,
	TextPrompt
> {
	async create(messages: MessageInput[]) {
		this.logger.debug("Anthropic.create", "messages", messages);

		const requests = messages.map((v) => ({
			custom_id: v.id,
			params: {
				...this.model.params,
				system: [
					{
						type: "text" as const,
						text: this.prompt.content.text,
						cache: this.prompt.content.cache ? { type: "ephemeral" } : false,
					},
				],
				messages: [
					{
						role: "user" as const,
						content: v.content,
					},
				],
			},
		}));

		this.logger.debug("Anthropic.create", "requests", requests);

		const batch = await this.client.messages.batches.create({
			requests,
		});

		this.logger.debug("Anthropic.create", "batch", batch);

		await this.createBatch({
			id: batch.id,
			status: batch.processing_status,
		});

		for (const message of messages) {
			await this.createMessage({
				id: message.id,
				batch_id: batch.id,
				status: "created",
				model_name: this.model.name,
				prompt_name: this.prompt.name,
				input: message.content,
			});
		}

		this.logger.info(
			"Anthropic.create",
			`Batch with ${requests.length} messages has been created`,
			batch.id,
		);

		return batch.id;
	}

	async read(batch_id: string, onValue: OnValue, onError: OnError) {
		const batch = await this.client.messages.batches.retrieve(batch_id);
		const batch_status = batch.processing_status;

		this.logger.debug("Anthropic.read", "batch", batch);

		await this.updateBatch({
			id: batch_id,
			status: batch_status,
		});

		if (batch_status !== "ended") {
			this.logger.info("Anthropic.read", "Batch has not ended yet", batch.id);
			return;
		}

		const results = await this.client.messages.batches.results(batch_id);

		this.logger.debug("Anthropic.read", "results", results);

		for await (const result of results) {
			const custom_id = result.custom_id;

			if (result.result.type === "succeeded") {
				this.logger.info(
					"Anthropic.read",
					`Message ${custom_id} has succeeded`,
				);

				const { content, usage } = result.result.message;
				const content_block = content[this.model.content_index];

				if (content_block.type === "text") {
					this.logger.debug("Anthropic.read", `Message ${custom_id} is text`);

					this.updateMessage({
						id: custom_id,
						status: result.result.type,
						output: content_block.text,
						...usage,
					});

					await onValue(custom_id, content_block.text);
				} else {
					const params = {
						status: "errored" as const,
						error: `Got "${content_block.type}" instead of "text"`,
					};

					this.logger.warn(
						"Anthropic.read",
						`Message ${custom_id} is not text`,
						params,
					);

					this.updateMessage({
						id: custom_id,
						...params,
					});

					await onError(custom_id, "errored");
				}
			} else {
				const params = {
					status: result.result.type,
					error:
						result.result.type === "errored"
							? result.result.error.error.message
							: null,
				};

				this.logger.warn(
					"Anthropic.read",
					`Message ${custom_id} has not succeeded`,
					params,
				);

				this.updateMessage({
					id: custom_id,
					...params,
				});

				await onError(custom_id, result.result.type);
			}
		}
	}
}
