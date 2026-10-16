import { resolve } from "node:path";
import { defineConfig } from "vite";

const pages = [
    "index.html",
    "login.html",
    "register.html",
    "forgot-password.html",
    "reset-password.html",
    "songs.html",
    "add-song.html",
    "edit-song.html",
    "song.html",
    "sets.html",
    "create-set.html",
    "set.html"
];

export default defineConfig({
    build: {
        rollupOptions: {
            input: Object.fromEntries(
                pages.map((page) => [page.replace(".html", ""), resolve(process.cwd(), page)])
            )
        }
    }
});
