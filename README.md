# 📦 bunpq

**SQLite-powered batch processing for AI completions.**

```ts
import { AnthropicBatcher, AnthropicModel, TextPrompt } from "bunpq";
import { Database } from "bun:sqlite";
import Anthropic from "@anthropic-ai/sdk";

const database = new Database("ai.sqlite");
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const model = new AnthropicModel("claude-3-haiku", { max_tokens: 1000 });
const prompt = new TextPrompt("system", { text: "Be helpful.", cache: true });
const batcher = new AnthropicBatcher({ database, client, model, prompt });

// Create a batch
const batch_id = await batcher.create([
  { id: "msg1", content: "Write a haiku" },
  { id: "msg2", content: "Write a limerick" }
]);

// Read results (anytime within 24h)
await batcher.read(
  batch_id,
  async (id, text) => console.log(`✅ ${id}:`, text),
  async (id, error) => console.log(`❌ ${id}:`, error)
);
```

## Features

- 🔋 **Simple API**: Just `create` and `read` methods
- 💾 **Persistent**: All batches stored in SQLite
- 🚀 **Composable**: Build your own schema around it
- 🧩 **Zero overhead**: Thin wrapper around batch APIs
- 💸 **Cost-effective**: Use AI batch APIs with ease

## Usage

```ts
// Daily batch cycle example
// Morning: Create today's batch
const todaysBatch = await batcher.create(generatePrompts());

// Evening: Process yesterday's results
await batcher.read(
  yesterdaysBatchId,
  async (id, text) => await saveToYourDb(id, text),
  async (id, error) => await logErrorYourWay(id, error)
);

// Even single messages work great
const single_batch = await batcher.create([
  { id: crypto.randomUUID(), content: "Take your time with this one" }
]);
```

## Philosophy

"Bring your own batteries" - We handle the batch plumbing, you decide what to do with the results.

*Your AI completions deserve better than direct API calls - but they don't need a complicated solution either.*
