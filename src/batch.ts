export type BatchStatus = "in_progress" | "canceling" | "ended";

export interface BatchCreate {
	id: string;
	status: BatchStatus;
}

export interface BatchUpdate {
	id: string;
	status: BatchStatus;
}
