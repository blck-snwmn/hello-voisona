import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { parseArgs } from "node:util";

async function main() {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    allowPositionals: true,
    options: {
      voice: { type: "string", default: "tanaka-san_ja_JP" },
      "voice-version": { type: "string" },
      language: { type: "string", default: "ja_JP" },
      destination: { type: "string", default: "file" },
      "output-dir": { type: "string", default: "output" },
      concat: { type: "string" },
      overwrite: { type: "boolean", default: false },
      help: { type: "boolean" },
    },
  });

  if (values.help) {
    console.log(`Usage: bun run synthesize input.jsonl [options]
  --voice NAME          Voice library (default: tanaka-san_ja_JP)
  --voice-version VER   Voice library version (default: selected by the API)
  --language LANG       Language (default: ja_JP)
  --destination TYPE    file, memory, or audio_device (default: file)
  --output-dir DIR      WAV output directory (default: output)
  --concat FILE         Also save the utterances as one WAV (requires ffmpeg)
  --overwrite           Allow overwriting existing WAV files`);
    return;
  }

  if (positionals.length !== 1) throw new Error("Provide one input JSONL file.");
  if (!["file", "memory", "audio_device"].includes(values.destination)) {
    throw new Error("Destination must be file, memory, or audio_device.");
  }
  if (values.concat && values.destination === "audio_device") {
    throw new Error("--concat requires destination file or memory.");
  }
  if (values.concat && !Bun.which("ffmpeg")) {
    throw new Error("--concat requires ffmpeg on PATH.");
  }

  const username = Bun.env.VOISONA_API_USERNAME;
  const password = Bun.env.VOISONA_API_KEY;
  const baseUrl = (Bun.env.VOISONA_API_URL ?? "http://localhost:32766/api/talk/v1").replace(
    /\/$/,
    "",
  );
  if (!username || !password) {
    throw new Error("Set VOISONA_API_USERNAME and VOISONA_API_KEY before running this command.");
  }

  async function request(path: string, method = "GET", body?: object) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      ...(method === "POST" && body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status}.`);
    return response;
  }

  const lines = (await Bun.file(positionals[0]).text()).split(/\r?\n/);
  const utterances = lines.flatMap((line, index) => {
    if (!line.trim()) return [];
    const lineNumber = index + 1;
    let data;
    try {
      data = JSON.parse(line);
    } catch {
      throw new Error(`Line ${lineNumber}: invalid JSON.`);
    }
    const fields = ["text", "analyzed_text", "global_parameters", "phoneme_durations"];
    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      Object.keys(data).some((key) => !fields.includes(key))
    ) {
      throw new Error(`Line ${lineNumber}: use an object containing only ${fields.join(", ")}.`);
    }
    if (
      !(typeof data.text === "string" && data.text.trim()) &&
      !(typeof data.analyzed_text === "string" && data.analyzed_text.trim())
    ) {
      throw new Error(`Line ${lineNumber}: provide text or analyzed_text.`);
    }
    return [{ lineNumber, data }];
  });
  if (!utterances.length) throw new Error("The input contains no utterances.");

  const savesFiles = values.destination !== "audio_device";
  const outputDir = resolve(values["output-dir"]);
  const outputFiles = utterances.map(({ lineNumber }) =>
    resolve(outputDir, `${String(lineNumber).padStart(4, "0")}.wav`),
  );
  const concatPath = values.concat ? resolve(values.concat) : undefined;
  if (concatPath && outputFiles.includes(concatPath)) {
    throw new Error("The --concat path must differ from the individual WAV paths.");
  }
  if (concatPath && !values.overwrite && (await Bun.file(concatPath).exists())) {
    throw new Error(`${concatPath} already exists. Use --overwrite to replace it.`);
  }
  if (savesFiles) await mkdir(outputDir, { recursive: true });

  for (const [index, { lineNumber, data }] of utterances.entries()) {
    const outputPath = outputFiles[index];
    if (savesFiles && !values.overwrite && (await Bun.file(outputPath).exists())) {
      throw new Error(
        `Line ${lineNumber}: ${outputPath} already exists. Use --overwrite to replace it.`,
      );
    }

    let requestPath: string | undefined;
    try {
      const created = await (
        await request("/speech-syntheses", "POST", {
          ...data,
          language: values.language,
          voice_name: values.voice,
          voice_version: values["voice-version"],
          destination: values.destination,
          ...(values.destination === "file"
            ? {
                output_file_path: outputPath,
                can_overwrite_file: values.overwrite,
              }
            : {}),
        })
      ).json();
      if (
        !created ||
        typeof created !== "object" ||
        !("uuid" in created) ||
        typeof created.uuid !== "string"
      ) {
        throw new Error("The API response is missing a synthesis UUID.");
      }
      requestPath = `/speech-syntheses/${encodeURIComponent(created.uuid)}`;

      const deadline = Date.now() + 300_000;
      while (true) {
        const status = await (await request(requestPath)).json();
        if (
          !status ||
          typeof status !== "object" ||
          !("state" in status) ||
          typeof status.state !== "string"
        ) {
          throw new Error("The API response is missing a synthesis state.");
        }
        if (status.state === "succeeded") break;
        if (status.state === "failed") throw new Error("Speech synthesis failed.");
        if (Date.now() >= deadline)
          throw new Error("Speech synthesis timed out after five minutes.");
        await Bun.sleep(250);
      }

      if (values.destination === "memory") {
        const wav = await (await request(`${requestPath}/wav`)).arrayBuffer();
        await writeFile(outputPath, Buffer.from(wav), { flag: values.overwrite ? "w" : "wx" });
      }
      console.log(`Line ${lineNumber}: ${savesFiles ? outputPath : "played"}`);
    } catch (error) {
      throw new Error(
        `Line ${lineNumber}: ${error instanceof Error ? error.message : "Speech synthesis failed."}`,
      );
    } finally {
      if (requestPath) {
        await request(requestPath, "DELETE").catch(() => {
          console.error(`Warning: could not remove ${requestPath}.`);
        });
      }
    }
  }

  if (concatPath) {
    const temporaryDir = await mkdtemp(resolve(outputDir, ".concat-"));
    try {
      const listPath = resolve(temporaryDir, "inputs.txt");
      await writeFile(
        listPath,
        outputFiles.map((path) => `file '../${basename(path)}'\n`).join(""),
      );
      await mkdir(dirname(concatPath), { recursive: true });
      const ffmpeg = Bun.spawn(
        [
          "ffmpeg",
          "-hide_banner",
          "-loglevel",
          "error",
          "-nostdin",
          "-f",
          "concat",
          "-safe",
          "0",
          "-i",
          listPath,
          "-c",
          "copy",
          "-f",
          "wav",
          values.overwrite ? "-y" : "-n",
          concatPath,
        ],
        { stdin: "ignore", stdout: "ignore", stderr: "inherit" },
      );
      if ((await ffmpeg.exited) !== 0)
        throw new Error("WAV concatenation failed. Individual WAV files have been kept.");
      console.log(`Combined: ${concatPath}`);
    } finally {
      await rm(temporaryDir, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Speech synthesis failed.");
  process.exitCode = 1;
});
