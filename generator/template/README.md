# UserScript project

## Getting started

Set the `@match` pattern in `src/userscript.user.ts` to the pages where your
script should run, then add your script logic in `src/main.ts`.

Run the development server to build the script and enable live reload:

```sh
npm run dev
```

The development server opens an install page. Install it with a userscript
manager, then visit a URL matching the `@match` metadata.

Create a production userscript with:

```sh
npm run build
```

This writes `userscript.user.js` in the project root. Run type checks, lint, and
format validation with:

```sh
npm run check
```
