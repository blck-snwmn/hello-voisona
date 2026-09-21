# hello-voisona

Experiments with [VoiSona](https://voisona.com/), AI software for singing and speech synthesis.

- [VoiSona Song](https://voisona.com/song/): Create singing voices from notes and lyrics.
- [VoiSona Talk](https://voisona.com/talk/): Generate speech from text.

See [talk/](talk/README.md) for setup and usage of the Bun scripts for the local VoiSona Talk REST API.

## Development

Run from the repository root:

```sh
bun install
bun run fmt
bun run fmt:check
bun run lint
```

Linting includes type-aware rules and TypeScript type checking. Use `bun run lint:fix` to apply automatic fixes.
