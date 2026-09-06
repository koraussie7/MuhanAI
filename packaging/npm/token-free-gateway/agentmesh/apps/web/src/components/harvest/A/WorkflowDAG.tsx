// Re-export shim. The original "WorkflowDAG" name was misleading — the
// component is a linear pipeline, not a directed acyclic graph. New
// imports should use `./WorkflowPipeline.js` directly.
export { WorkflowPipeline as WorkflowDAG } from "./WorkflowPipeline.js";
export type { PipelineStage, PipelineStageStatus } from "./WorkflowPipeline.js";
