console.log("HTTP server running. Access it at: http://localhost:8000/");

Deno.serve({ port: 8000 }, (_req: Request) => {
  return new Response("Hello World\n");
});
