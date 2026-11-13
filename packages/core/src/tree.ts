import type { Collection, FolderNode, RequestNode, TreeNode } from "./model";

export interface NodeLocation {
  node: TreeNode;
  /** Folders from the collection root down to (not including) the node. */
  ancestors: FolderNode[];
  parentItems: TreeNode[];
  index: number;
}

export function findNode(collection: Collection, id: string): NodeLocation | undefined {
  const walk = (items: TreeNode[], ancestors: FolderNode[]): NodeLocation | undefined => {
    for (let i = 0; i < items.length; i++) {
      const node = items[i]!;
      if (node.id === id) return { node, ancestors, parentItems: items, index: i };
      if (node.type === "folder") {
        const hit = walk(node.items, [...ancestors, node]);
        if (hit) return hit;
      }
    }
    return undefined;
  };
  return walk(collection.items, []);
}

export function findRequest(collection: Collection, id: string): { request: RequestNode; ancestors: FolderNode[] } | undefined {
  const loc = findNode(collection, id);
  if (!loc || loc.node.type !== "request") return undefined;
  return { request: loc.node, ancestors: loc.ancestors };
}

/** Immutable update of a node anywhere in the tree. */
export function updateNode(collection: Collection, id: string, fn: (node: TreeNode) => TreeNode): Collection {
  const map = (items: TreeNode[]): TreeNode[] =>
    items.map((n) => {
      if (n.id === id) return fn(n);
      if (n.type === "folder") return { ...n, items: map(n.items) };
      return n;
    });
  return { ...collection, items: map(collection.items), updatedAt: Date.now() };
}

export function removeNode(collection: Collection, id: string): Collection {
  const filter = (items: TreeNode[]): TreeNode[] =>
    items.filter((n) => n.id !== id).map((n) => (n.type === "folder" ? { ...n, items: filter(n.items) } : n));
  return { ...collection, items: filter(collection.items), updatedAt: Date.now() };
}

/** Insert `node` into folder `parentId`, or at the collection root when parentId is undefined. */
export function insertNode(collection: Collection, node: TreeNode, parentId?: string): Collection {
  if (!parentId) return { ...collection, items: [...collection.items, node], updatedAt: Date.now() };
  return updateNode(collection, parentId, (n) => (n.type === "folder" ? { ...n, items: [...n.items, node] } : n));
}

export function countRequests(items: TreeNode[]): number {
  return items.reduce((acc, n) => acc + (n.type === "request" ? 1 : countRequests(n.items)), 0);
}

export function flattenRequests(items: TreeNode[], ancestors: FolderNode[] = []): { request: RequestNode; ancestors: FolderNode[] }[] {
  const out: { request: RequestNode; ancestors: FolderNode[] }[] = [];
  for (const n of items) {
    if (n.type === "request") out.push({ request: n, ancestors });
    else out.push(...flattenRequests(n.items, [...ancestors, n]));
  }
  return out;
}
