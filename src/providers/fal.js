const ENDPOINT = "https://fal.run/fal-ai/ideogram/v3";

function hexToRgbObj(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function buildBody({ prompt, palette, negative, count }) {
  return {
    prompt,
    num_images: count,
    negative_prompt: negative.join(", "),
    color_palette: {
      members: palette.map((hex) => ({
        rgb: hexToRgbObj(hex),
        color_weight: 1,
      })),
    },
  };
}

export function describeRequest(req) {
  return [
    `POST ${ENDPOINT}`,
    `Authorization: Key $FAL_KEY`,
    `Content-Type: application/json`,
    ``,
    JSON.stringify(buildBody(req), null, 2),
  ].join("\n");
}

export async function generate(req) {
  const key = process.env.FAL_KEY;
  if (!key) {
    throw new Error("FAL_KEY not set. Set $FAL_KEY and retry.");
  }
  const body = buildBody(req);
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Key ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`fal.ai ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const urls = (data.images || []).map((i) => i.url).filter(Boolean);
  if (!urls.length) {
    throw new Error(`fal.ai returned no images: ${JSON.stringify(data)}`);
  }
  const out = [];
  for (let i = 0; i < urls.length; i++) {
    const r = await fetch(urls[i]);
    const buf = Buffer.from(await r.arrayBuffer());
    out.push({ name: `candidate-${i + 1}.png`, buffer: buf });
  }
  return out;
}
