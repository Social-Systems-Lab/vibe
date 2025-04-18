import { Elysia } from "elysia";

const app = new Elysia().get("/", () => "Hello World").listen(3000);

console.log(`Listening on http://localhost:3000 ...`);
