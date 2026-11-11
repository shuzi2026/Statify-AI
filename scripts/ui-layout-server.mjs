import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { resolve } from "node:path";
import {
  cleanDocument,
  freshDocument,
  reduceOperation,
} from "../public/whitebox/model.js";
export function uiLayoutPlugin() {
  let queue = Promise.resolve();
  const file = resolve("public/whitebox/defaults.json");
  return {
    name: "statify-ui-layout",
    configureServer(server) {
      const port = server.config.server.port;
      const localOrigin = "http://127.0.0.1:" + port;
      server.middlewares.use("/__ui/layout", (req, res) => {
        const origin = req.headers.origin;
        if (
          origin &&
          origin !== localOrigin &&
          origin !== "http://localhost:" + port
        ) {
          res.writeHead(403);
          res.end();
          return;
        }
        res.setHeader(
          "Access-Control-Allow-Origin",
          origin || localOrigin,
        );
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Cache-Control", "no-store");
        if (req.method === "OPTIONS") {
          res.writeHead(204);
          res.end();
          return;
        }
        if (!["GET", "POST"].includes(req.method)) {
          res.writeHead(405);
          res.end();
          return;
        }
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
          if (body.length > 100000) req.destroy();
        });
        req.on("end", () => {
          queue = queue
            .catch(() => {})
            .then(async () => {
              try {
                let doc;
                try {
                  doc = cleanDocument(JSON.parse(await readFile(file, "utf8")));
                } catch (e) {
                  if (e.code !== "ENOENT") throw e;
                  doc = freshDocument();
                }
                if (req.method === "POST") {
                  doc = reduceOperation(doc, JSON.parse(body));
                  await mkdir(resolve(".ui-layout"), { recursive: true });
                  const temp = resolve(".ui-layout/pending.json");
                  await writeFile(temp, JSON.stringify(doc, null, 2));
                  await rename(temp, file);
                }
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify(doc));
              } catch {
                res.writeHead(400);
                res.end('{"error":"布局配置未写入"}');
              }
            });
        });
      });
    },
  };
}
