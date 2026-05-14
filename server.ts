import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { createExpressApp } from "./src/server/app";

const port = 3000;
const isProd = process.env.NODE_ENV === "production";

async function startServer() {
  const app = createExpressApp();

  // Vite middleware for development
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

startServer();
