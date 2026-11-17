import yauzl from "yauzl";

export interface ZipEntry {
  path: string;
  contents: string;
  mtime: Date;
  mode: number;
}

export async function readZipEntries(filePath: string): Promise<ZipEntry[]> {
  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true }, (error, opened) => {
      if (error || !opened) {
        reject(error ?? new Error(`Could not open zip: ${filePath}`));
        return;
      }
      resolve(opened);
    });
  });

  const entries: ZipEntry[] = [];
  return new Promise<ZipEntry[]>((resolve, reject) => {
    zip.on("error", reject);
    zip.on("end", () => resolve(entries));
    zip.on("entry", (entry: yauzl.Entry) => {
      if (entry.fileName.endsWith("/")) {
        zip.readEntry();
        return;
      }
      zip.openReadStream(entry, (error, stream) => {
        if (error || !stream) {
          reject(error ?? new Error(`Could not read ${entry.fileName}`));
          return;
        }
        const chunks: Buffer[] = [];
        stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("end", () => {
          entries.push({
            path: entry.fileName,
            contents: Buffer.concat(chunks).toString("utf8"),
            mtime: entry.getLastModDate(),
            mode: entry.externalFileAttributes >>> 16,
          });
          zip.readEntry();
        });
        stream.on("error", reject);
      });
    });
    zip.readEntry();
  });
}
