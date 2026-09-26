/**
 * Permission helpers — re-exported from shared-types for backwards compatibility.
 * New code should import from "@agentmesh/shared-types" directly.
 */

export type { KnowledgeNode, KnowledgePermissions } from "@agentmesh/shared-types";
export { canRead, createDefaultPermissions, shareWith } from "@agentmesh/shared-types";
