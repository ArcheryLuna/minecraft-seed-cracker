// Browser helpers: save a file, fetch an asset.

export function save(data: BlobPart, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function fetchBytes(url: string | URL) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't load ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}
