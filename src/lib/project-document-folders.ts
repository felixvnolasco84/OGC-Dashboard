/** Project views omit the physical root; global views retain the persisted hierarchy. */
export function projectDocumentFolders<T extends { _id: string; parent_folder_id?: string }>(
  folders: T[], rootId?: string,
): T[] {
  return folders.filter(folder => folder._id !== rootId).map(folder =>
    rootId && folder.parent_folder_id === rootId
      ? { ...folder, parent_folder_id: undefined }
      : folder);
}

export function projectDocumentCounts(counts: Record<string, number>, rootId?: string) {
  if (!rootId) return counts;
  const result: Record<string, number> = { ...counts, root: (counts.root || 0) + (counts[rootId] || 0) };
  delete result[rootId];
  return result;
}
