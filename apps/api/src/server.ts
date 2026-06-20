import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 4000);

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }

  response.writeHead(404, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ error: "not_found" }));
});

if (process.env.NODE_ENV !== "test") {
  server.listen(port, () => {
    console.log(`SketchCatch API listening on port ${port}`);
  });
}

export { server };
