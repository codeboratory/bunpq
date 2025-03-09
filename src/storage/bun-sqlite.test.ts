import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { BatchStatus } from "../types";
import { BunSQLiteStorage } from "./bun-sqlite";

describe("BunSQLiteStorage", () => {
	let database: Database;
	let storage: BunSQLiteStorage;

	beforeEach(() => {
		database = new Database(":memory:");
		storage = new BunSQLiteStorage(database);
	});

	afterEach(() => {
		database.close();
	});

	it("should create and update a batch", async () => {
		await storage.createBatch({
			id: "test-batch",
			status: "in_progress",
		});

		const initialBatch = database
			.prepare("SELECT * FROM batch WHERE id = ?")
			.get("test-batch");

		expect(initialBatch).not.toBeNull();
		expect(initialBatch.status).toBe("in_progress");

		await storage.updateBatch({
			id: "test-batch",
			status: "completed" as BatchStatus,
		});

		const updatedBatch = database
			.prepare("SELECT * FROM batch WHERE id = ?")
			.get("test-batch");

		expect(updatedBatch.status).toBe("completed");
	});

	it("should retrieve random batches by status", async () => {
		await storage.createBatch({
			id: "batch-1",
			status: "in_progress",
		});

		await storage.createBatch({
			id: "batch-2",
			status: "in_progress",
		});

		await storage.createBatch({
			id: "batch-3",
			status: "ended",
		});

		const pendingBatches = await storage.randomBatches(2, "in_progress");

		expect(pendingBatches.length).toBeLessThanOrEqual(2);

		for (const id of pendingBatches) {
			expect(["batch-1", "batch-2"]).toContain(id);
		}
	});

	it("should create and update a message", async () => {
		await storage.createBatch({
			id: "message-batch",
			status: "in_progress",
		});

		await storage.createMessage({
			id: "test-message",
			batch_id: "message-batch",
			status: "created",
			content: "Hello world",
		});

		const initialMessage = database
			.prepare("SELECT * FROM message WHERE id = ?")
			.get("test-message");

		expect(initialMessage).not.toBeNull();
		expect(initialMessage.content).toBe("Hello world");
		expect(initialMessage.status).toBe("created");

		await storage.updateMessage({
			id: "test-message",
			status: "succeeded",
			input_tokens: 10,
			output_tokens: 20,
		});

		const updatedMessage = database
			.prepare("SELECT * FROM message WHERE id = ?")
			.get("test-message");

		expect(updatedMessage.status).toBe("succeeded");
		expect(updatedMessage.input_tokens).toBe(10);
		expect(updatedMessage.output_tokens).toBe(20);
	});
});
