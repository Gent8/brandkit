const ENDPOINT = "https://external.api.recraft.ai/v1/images/vectorize";

export async function vectorize(pngBuffer) {
  const key = process.env.RECRAFT_API_TOKEN || process.env.RECRAFT_API_KEY;
  if (!key) {
    throw new Error("Recraft key not set. Set $RECRAFT_API_TOKEN (or $RECRAFT_API_KEY) and retry.");
  }
  const fd = new FormData();
  fd.append("file", new Blob([pngBuffer], { type: "image/png" }), "input.png");
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: fd,
  });
  if (!res.ok) {
    throw new Error(`Recraft vectorize ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const url = data.image && data.image.url;
  if (!url) {
    throw new Error(`Recraft vectorize returned no url: ${JSON.stringify(data)}`);
  }
  const r = await fetch(url);
  return await r.text();
}

export function describeRequest() {
  return `POST ${ENDPOINT}\nAuthorization: Bearer $RECRAFT_API_TOKEN  (or $RECRAFT_API_KEY)\n(multipart: file=<png>)`;
}
