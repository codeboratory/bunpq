import type { Database } from "bun:sqlite";
import { protos, JobServiceClient } from "@google-cloud/aiplatform";
import type { GenerationConfig } from "@google/generative-ai";
import { Bucket } from "@google-cloud/storage";
import { createId } from "@paralleldrive/cuid2";
import type { OnError, OnValue } from "./batcher";
import { Batcher } from "./batcher";
import type { MessageInput } from "./message";
import { Model } from "./model";
import type { TextPrompt } from "./prompt";
import type { BatchStatus } from "./batch";

const { GcsDestination, GcsSource } = protos.google.cloud.aiplatform.v1;

type Job = protos.google.cloud.aiplatform.v1.ICreateBatchPredictionJobRequest;

type State =
	| protos.google.cloud.aiplatform.v1.JobState
	| keyof typeof protos.google.cloud.aiplatform.v1.JobState;

const IN_PROGRESS_STRING: State[] = [
	"JOB_STATE_PENDING",
	"JOB_STATE_QUEUED",
	"JOB_STATE_UPDATING",
];
const IN_PROGRESS_NUMBER: State[] = [2, 1, 10];

const mapState = (state?: State | null): BatchStatus => {
	if (state === undefined || state === null) {
		return "ended";
	}

	if (
		IN_PROGRESS_STRING.includes(state) ||
		IN_PROGRESS_NUMBER.includes(state)
	) {
		return "in_progress";
	}

	if (state === "JOB_STATE_CANCELLING" || state === 6) {
		return "canceling";
	}

	return "ended";
};

type Config = {
	project: string;
	location: string;
};

export class GoogleModel extends Model<{
	name: string;
	config: GenerationConfig;
}> {}

export class GoogleBatcher extends Batcher<
	JobServiceClient,
	GoogleModel,
	TextPrompt
> {
	protected bucket: Bucket;
	protected config: Config;

	constructor({
		database,
		client,
		model,
		prompt,
		bucket,
		config,
	}: {
		database: Database;
		client: JobServiceClient;
		model: GoogleModel;
		prompt: TextPrompt;
		bucket: Bucket;
		config: Config;
	}) {
		super({ database, client, model, prompt });
		this.bucket = bucket;
		this.config = config;
	}

	async create(messages: MessageInput[]) {
		this.logger.debug("Google.create", "messages", messages);

		const batch_id = createId();

		const model = this.model.params;
		const files: Promise<void>[] = [];
		const uris: string[] = [];

		for (let i = 0; i < messages.length; ++i) {
			const message = messages[i];
			const filename = `${message.id}.jsonl`;

			files.push(
				this.bucket.file(filename).save(
					JSON.stringify({
						request: {
							// TODO: add caching
							systemInstruction: this.prompt.content.text,
							contents: [
								{
									role: "user",
									parts: [
										{
											text: message.content,
										},
									],
								},
							],
						},
					}),
				),
			);

			uris.push(`${this.bucket.name}/input/${filename}`);
		}

		this.logger.debug("Google.create", "files", files);

		await Promise.all(files);

		const job: Job = {
			batchPredictionJob: {
				name: batch_id,
				model: model.name,
				modelParameters: {
					structValue: {
						fields: {
							...(model.config.temperature
								? { temperature: { numberValue: model.config.temperature } }
								: {}),
							...(model.config.candidateCount
								? {
										candidateCount: {
											numberValue: model.config.candidateCount,
										},
									}
								: {}),
							...(model.config.stopSequences
								? {
										stopSequences: {
											listValue: {
												values: model.config.stopSequences.map((value) => ({
													stringValue: value,
												})),
											},
										},
									}
								: {}),
							...(model.config.maxOutputTokens
								? {
										maxOutputTokens: {
											numberValue: model.config.maxOutputTokens,
										},
									}
								: {}),
							...(model.config.topP
								? {
										topP: {
											numberValue: model.config.topP,
										},
									}
								: {}),
							...(model.config.topK
								? {
										topK: {
											numberValue: model.config.topK,
										},
									}
								: {}),
							...(model.config.responseMimeType
								? {
										responseMimeType: {
											stringValue: model.config.responseMimeType,
										},
									}
								: {}),
							//// TODO: implement responseMimeType
							...(model.config.presencePenalty
								? {
										presencePenalty: {
											numberValue: model.config.presencePenalty,
										},
									}
								: {}),
							...(model.config.frequencyPenalty
								? {
										frequencyPenalty: {
											numberValue: model.config.frequencyPenalty,
										},
									}
								: {}),
							...(model.config.responseLogprobs
								? {
										responseLogprobs: {
											boolValue: model.config.responseLogprobs,
										},
									}
								: {}),
							...(model.config.logprobs
								? {
										logprobs: {
											numberValue: model.config.logprobs,
										},
									}
								: {}),
						},
					},
				},
				inputConfig: {
					gcsSource: new GcsSource({
						uris,
					}),
					instancesFormat: "jsonl",
				},
				outputConfig: {
					gcsDestination: new GcsDestination({
						outputUriPrefix: `${this.bucket.name}/output`,
					}),
					predictionsFormat: "jsonl",
				},
			},
		};

		this.logger.debug("Google.create", "job", job);

		const [response] = await this.client.createBatchPredictionJob(job);

		this.logger.debug("Google.create", "batch", job);

		await this.createBatch({
			id: batch_id,
			status: mapState(response.state),
		});

		for (const message of messages) {
			await this.createMessage({
				id: message.id,
				batch_id: batch_id,
				status: "created",
				model_name: this.model.name,
				prompt_name: this.prompt.name,
				input: message.content,
			});
		}

		this.logger.info(
			"Google.create",
			`Batch with ${messages.length} messages has been created`,
			batch_id,
		);

		return batch_id;
	}

	async read(batch_id: string, onValue: OnValue, onError: OnError) {
		const [batch] = await this.client.getBatchPredictionJob({
			name: `projects/${this.config.project}/locations/${this.config.location}/batchPredictionJobs/${batch_id}`,
		});

		const batch_status = mapState(batch.state);

		this.logger.debug("Google.read", "batch", batch);

		await this.updateBatch({
			id: batch_id,
			status: batch_status,
		});

		if (batch_status !== "ended") {
			this.logger.info("Google.read", "Batch has not ended yet", batch_id);
			return;
		}

		const results = await this.bucket
			.file(`${this.bucket.name}/output/${batch_id}`)
			.download();

		const file = results.toString();

		console.log(file);
	}
}
