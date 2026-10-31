# @wiinuk/create-userscript

Create a TypeScript and Vite development environment for a UserScript. The
generator asks for npm package details and UserScript metadata, using the
destination directory name as the default project name:

```sh
npm create @wiinuk/userscript
```

Provide a destination directory to skip the directory question; package and
UserScript metadata are still collected interactively:

```sh
npm create @wiinuk/userscript field-notes
```

The generator scaffolds a generic UserScript starter and runs `npm install`.
The target must be empty if it already exists. To skip dependency installation:

```sh
npm create @wiinuk/userscript field-notes -- --skip-install
```

Use `-y` or `--yes` to accept defaults without prompts. The generated UserScript
has no `@match` or `@namespace` metadata unless you provide them, so set an
appropriate `@match` before using it:

```sh
npm create @wiinuk/userscript field-notes -- --yes
```

Implement your script in `src/main.ts`. Run `npm run dev` for a development
build with live reload, `npm run build` for the installable userscript, or
`npm run check` for type checks, linting, and formatting.

To publish this generator as `@wiinuk/create-userscript`, run `npm publish`
from this directory.
