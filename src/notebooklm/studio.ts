export type StudioCompletionState =
  | "queued"
  | "in_progress"
  | "completed"
  | "failed"
  | "not_started";
export type StudioDetailLevel = "standard" | "detailed";

export interface StudioCompletion {
  artifactType: string;
  status: string;
  completionState: StudioCompletionState;
  sourceCountVerified: boolean | null;
  expectedSourceCount?: number;
  actualSourceCount?: number;
  slideCount?: number;
  detailLevel?: StudioDetailLevel;
  message?: string;
}

export interface StudioCompletionInput {
  artifactType: string;
  status: string;
  expectedSourceCount?: number;
  actualSourceCount?: number;
  slideCount?: number;
  detailLevel?: StudioDetailLevel;
  message?: string;
}

export function buildStudioCompletion(input: StudioCompletionInput): StudioCompletion {
  const sourceCountVerified =
    input.expectedSourceCount === undefined || input.actualSourceCount === undefined
      ? null
      : input.expectedSourceCount === input.actualSourceCount;
  const completionState: StudioCompletionState =
    input.status === "ready"
      ? "completed"
      : input.status === "started" || input.status === "queued"
        ? "queued"
        : input.status === "in_progress"
          ? "in_progress"
          : input.status === "not_started"
            ? "not_started"
            : "failed";
  return {
    artifactType: input.artifactType,
    status: input.status,
    completionState,
    sourceCountVerified,
    expectedSourceCount: input.expectedSourceCount,
    actualSourceCount: input.actualSourceCount,
    slideCount: input.slideCount,
    detailLevel: input.detailLevel,
    message: input.message,
  };
}
