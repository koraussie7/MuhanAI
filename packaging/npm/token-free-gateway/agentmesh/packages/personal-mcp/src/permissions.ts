import { KnowledgePermissions, Visibility, KnowledgeNode } from "../../shared/types";

export function canRead(
  node: KnowledgeNode,
  requesterId: string,
  isAgent = false
): boolean {
  if (node.ownerId === requesterId) return true;
  if (node.visibility === "public") return true;
  if (node.visibility === "shared" && node.permissions.readableBy.includes(requesterId)) {
    return true;
  }
  if (isAgent && node.permissions.usableByAgents) {
    return node.visibility !== "private" || node.permissions.readableBy.includes(requesterId);
  }
  return false;
}

export function createDefaultPermissions(ownerId: string): KnowledgePermissions {
  return {
    readableBy: [ownerId],
    usableByAgents: true,
    commercialUse: false,
  };
}

export function shareWith(node: KnowledgeNode, userIds: string[]): KnowledgeNode {
  const readableBy = Array.from(new Set([...node.permissions.readableBy, ...userIds]));
  return {
    ...node,
    visibility: node.visibility === "private" ? "shared" : node.visibility,
    permissions: {
      ...node.permissions,
      readableBy,
    },
    updatedAt: new Date(),
  };
}
