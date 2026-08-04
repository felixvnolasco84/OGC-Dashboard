export type IncomingPlanFile = {
  file: File;
  relativePath: string;
};

type FileSystemEntryLike = {
  isDirectory: boolean;
  isFile: boolean;
  name: string;
  file?: (
    successCallback: (file: File) => void,
    errorCallback?: (error: DOMException) => void,
  ) => void;
  createReader?: () => {
    readEntries: (
      successCallback: (entries: FileSystemEntryLike[]) => void,
      errorCallback?: (error: DOMException) => void,
    ) => void;
  };
};

async function readDirectory(
  reader: ReturnType<NonNullable<FileSystemEntryLike["createReader"]>>,
) {
  const entries: FileSystemEntryLike[] = [];
  while (true) {
    const batch = await new Promise<FileSystemEntryLike[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    if (batch.length === 0) return entries;
    entries.push(...batch);
  }
}

async function collectEntry(
  entry: FileSystemEntryLike,
  parentPath: string,
): Promise<IncomingPlanFile[]> {
  if (entry.isFile && entry.file) {
    const file = await new Promise<File>((resolve, reject) => {
      entry.file?.(resolve, reject);
    });
    return [{
      file,
      relativePath: [parentPath, file.name].filter(Boolean).join("/"),
    }];
  }

  if (entry.isDirectory && entry.createReader) {
    const directoryPath = [parentPath, entry.name].filter(Boolean).join("/");
    const children = await readDirectory(entry.createReader());
    return (
      await Promise.all(children.map((child) => collectEntry(child, directoryPath)))
    ).flat();
  }

  return [];
}

export async function collectDroppedPlanFiles(dataTransfer: DataTransfer) {
  const entries: FileSystemEntryLike[] = [];
  Array.from(dataTransfer.items).forEach((item) => {
    const entry = (
      item as unknown as { webkitGetAsEntry?: () => unknown }
    ).webkitGetAsEntry?.();
    if (entry) entries.push(entry as FileSystemEntryLike);
  });

  if (entries.length > 0) {
    const collected = (
      await Promise.all(entries.map((entry) => collectEntry(entry, "")))
    ).flat();
    if (collected.length > 0) return collected;
  }

  return Array.from(dataTransfer.files).map((file) => ({
    file,
    relativePath: file.webkitRelativePath || file.name,
  }));
}
