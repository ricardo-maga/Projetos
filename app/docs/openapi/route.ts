import { createContentNonce } from '@/lib/security/contentSecurityPolicy';

const swagger = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.36.0';

export function GET() {
  const nonce = createContentNonce();
  return new Response(`<!doctype html>
<html lang="pt">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>ERP OpenAPI Swagger UI</title>
    <link rel="stylesheet" href="${swagger}/swagger-ui.css"
      integrity="sha384-z/AtSaOHGn5MJ5auAHXUypohywlIWLBZo1jeGmhdpVIbCnFhxAH92cwdV41oyINc" crossorigin="anonymous">
    <style nonce="${nonce}">
      body { margin: 0; background-color: Canvas; color: CanvasText; color-scheme: light; font-family: sans-serif; }
      .swagger-ui .topbar { display: none; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script nonce="${nonce}" src="${swagger}/swagger-ui-bundle.js"
      integrity="sha384-fUpRgC19yPykTqzdrUbdAg8NTiu16NEKf9U12J+IJWCg8/1mEI8f2+PEIz60Wyd+" crossorigin="anonymous"></script>
    <script nonce="${nonce}">
      SwaggerUIBundle({
        url: '/api/v1/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        validatorUrl: null,
        presets: [SwaggerUIBundle.presets.apis],
      });
    </script>
  </body>
</html>`, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': [
        "default-src 'none'",
        `script-src 'nonce-${nonce}'`,
        `style-src 'nonce-${nonce}' https://cdn.jsdelivr.net`,
        "img-src 'self' data:",
        "font-src 'self' data:",
        "connect-src 'self'",
        "frame-ancestors 'self'",
        "base-uri 'none'",
        "form-action 'self'",
      ].join('; '),
    },
  });
}
