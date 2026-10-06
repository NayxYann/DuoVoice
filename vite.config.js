import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        linux: fileURLToPath(new URL("linux.html", import.meta.url)),
        main: fileURLToPath(new URL("index.html", import.meta.url)),
        tray: fileURLToPath(new URL("tray.html", import.meta.url)),
        trayMenu: fileURLToPath(new URL("tray-menu.html", import.meta.url))
      }
    }
  }
});
