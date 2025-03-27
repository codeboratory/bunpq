import type { Database, Statement } from "bun:sqlite";
import type { Logger } from "@codeboratory/bunlog";
import { createLogger } from "@codeboratory/bunlog";
import type { BatchCreate, BatchUpdate } from "./batch";
import type { MessageCreate, MessageInput, MessageUpdate } from "./message";
import type { Model } from "./model";
import type { Prompt } from "./prompt";

export type OnValue = (custom_id: string, text: string) => Promise<void>;

export type OnError = (custom_id: string, error: BatchError) => Promise<void>;

export type BatchError = "errored" | "canceled" | "expired";

export abstract class Batcher<
	$Client,
	$Model extends Model<unknown>,
	$Prompt extends Prompt<unknown>,
> {
	protected database: Database;
	protected client: $Client;
	protected model: $Model;
	protected prompt: $Prompt;
	protected logger: Logger;

	private $create_batch: Statement;
	private $update_batch: Statement;
	private $create_message: Statement;
	private $update_message: Statement;

	constructor({
		database,
		client,
		model,
		prompt,
	}: {
		database: Database;
		client: $Client;
		model: $Model;
		prompt: $Prompt;
	}) {
		this.database = database;
		this.client = client;
		this.model = model;
		this.prompt = prompt;
		this.logger = createLogger({ database });

		this.logger.debug("Batcher", "Create batch table");
		database.run(`
			CREATE TABLE IF NOT EXISTS batch (
				id TEXT PRIMARY KEY,
				status TEXT NOT NULL
			);

			CREATE INDEX IF NOT EXISTS batch_status_idx ON batch(status);
		`);

		this.logger.debug("Batcher", "Create message table");
		database.run(`
			CREATE TABLE IF NOT EXISTS message (
				id TEXT PRIMARY KEY,
				batch_id TEXT NOT NULL,
				model_name TEXT NOT NULL,
				prompt_name TEXT NOT NULL,
				status TEXT NOT NULL,
				input TEXT NOT NULL,
				output TEXT,
				error TEXT,
				input_tokens INTEGER,
				output_tokens INTEGER,
				cache_creation_input_tokens INTEGER,
				cache_read_input_tokens INTEGER,
				FOREIGN KEY(batch_id) REFERENCES batch(id)
			);

			CREATE INDEX IF NOT EXISTS message_batch_id_idx ON message(batch_id);
			CREATE INDEX IF NOT EXISTS message_status_idx ON message(status);
			CREATE INDEX IF NOT EXISTS message_model_name_idx ON message(model_name);
			CREATE INDEX IF NOT EXISTS message_prompt_name_idx ON message(prompt_name);
		`);

		this.logger.debug("Batcher", "Create $create_batch statement");
		this.$create_batch = database.query(`
			INSERT OR IGNORE INTO
			batch (id, status)
			VALUES ($id, $status);
		`);

		this.logger.debug("Batcher", "Create $update_batch statement");
		this.$update_batch = database.query(`
			UPDATE OR IGNORE batch
			SET status = $status
			WHERE id = $id;
		`);

		this.logger.debug("Batcher", "Create $create_message statement");
		this.$create_message = database.query(`
			INSERT OR IGNORE INTO
			message (id, batch_id, status, model_name, prompt_name, input)
			VALUES ($id, $batch_id, $status, $model_name, $prompt_name, $input);
		`);

		this.logger.debug("Batcher", "Create $update_message statement");
		this.$update_message = database.query(`
			UPDATE OR IGNORE message
			SET status = $status,
			output = COALESCE($output, output),
			cache_creation_input_tokens = COALESCE($cache_creation_input_tokens, cache_creation_input_tokens),
			cache_read_input_tokens = COALESCE($cache_read_input_tokens, cache_read_input_tokens),
			input_tokens = COALESCE($input_tokens, input_tokens),
			output_tokens = COALESCE($output_tokens, output_tokens),
			error = COALESCE($error, error)
			WHERE id = $id;
		`);
	}

	protected async createBatch(data: BatchCreate) {
		this.logger.debug("Batcher", "createBatch", data);
		this.$create_batch.run(data);
	}

	protected async updateBatch(data: BatchUpdate) {
		this.logger.debug("Batcher", "updateBatch", data);
		this.$update_batch.run(data);
	}

	protected async createMessage(data: MessageCreate) {
		this.logger.debug("Batcher", "createMessage", data);
		this.$create_message.run(data);
	}

	protected async updateMessage(data: MessageUpdate) {
		this.logger.debug("Batcher", "updateMessage", data);
		this.$update_message.run(data);
	}

	public abstract create(messages: MessageInput[]): Promise<string>;
	public abstract read(
		batch_id: string,
		onValue: OnValue,
		onError: OnError,
	): Promise<void>;
}
