FROM denoland/deno:latest

# Create working directory
WORKDIR /app

# Copy source
COPY . .

# Cache dependencies
RUN deno cache --lock=deno.lock main.ts
RUN deno cache --lock=deno.lock auth-routes.ts
RUN deno cache --lock=deno.lock data-routes.ts
RUN deno cache --lock=deno.lock crypto-utils.ts

# Run the app
CMD ["deno", "run", "--allow-net", "--allow-env", "--allow-read", "main.ts"]
