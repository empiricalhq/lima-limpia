# Email package

`@lima-garbage/email` contains the React Email templates used by the API. It
exports the password reset renderer.

## Use the renderer

```ts
import { renderPasswordReset } from "@lima-garbage/email";

const html = await renderPasswordReset({
  userName: "María Pérez",
  resetUrl: "https://example.com/reset?token=abc123",
});
```

`resetUrl` is required. `userName` is optional.

## Preview a template

Run this from the repository root:

```sh
bun --filter @lima-garbage/email dev
```

The preview server runs on port `3001`.

Templates live in [`templates`](templates). Add a renderer export when a new
template needs to be used by another package.
