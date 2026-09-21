const username = Bun.env.VOISONA_API_USERNAME;
const password = Bun.env.VOISONA_API_KEY;
const baseUrl = Bun.env.VOISONA_API_URL ?? "http://localhost:32766/api/talk/v1";

if (!username || !password) {
  console.error("Set VOISONA_API_USERNAME and VOISONA_API_KEY before running this command.");
  process.exit(1);
}

try {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/voices`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    console.error(`Could not list voices: HTTP ${response.status}.`);
    process.exit(1);
  }

  console.log(JSON.stringify(await response.json(), null, 2));
} catch {
  console.error("Could not read the API response. Check that VoiSona Talk is running with the REST API enabled.");
  process.exit(1);
}
