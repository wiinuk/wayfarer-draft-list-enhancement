//spell-checker: words Niantic Userscript

import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as esbuild from "esbuild";
import WebSocket, { WebSocketServer } from "ws";
import type { Plugin, ResolvedConfig, ViteDevServer } from "vite";

export interface UserscriptOptions {
    entry: string;
    name?: string;
    developmentOutput?: string;
    host?: string;
    port?: number;
    installPath?: string;
    openInstallPage?: boolean;
    output?: string;
}

const reloadMessage = "reload";

function changeExt(filePath: string, newExtWithDot: string) {
    const parsed = path.parse(filePath);
    return path.format({
        ...parsed,
        base: undefined,
        ext: newExtWithDot,
    });
}

function removeAllExtensions(filePath: string): string {
    let currentPath = filePath;
    let ext = path.extname(currentPath);

    while (ext !== "") {
        currentPath = currentPath.slice(0, -ext.length);
        ext = path.extname(currentPath);
    }

    return currentPath;
}

function toValidLibName(input: string): string {
    const cleaned = input.replace(/[^a-zA-Z0-9_$]/g, " ");
    const words = cleaned.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
        return "AppLibrary";
    }

    let pascalCaseName = words
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join("");

    if (/^[0-9]/.test(pascalCaseName)) {
        pascalCaseName = `_${pascalCaseName}`;
    }

    return pascalCaseName;
}

export function userscript(options: UserscriptOptions): Plugin {
    const entryFileName = path.basename(options.entry);
    const outputFileName = changeExt(entryFileName, ".js");
    const developmentOutput = path.join(
        options.developmentOutput ?? "dev",
        changeExt(entryFileName, ".debug.js"),
    );

    let config: ResolvedConfig;
    let entryPath: string;
    let outputPath: string;
    let development = false;
    let webSocketServer: WebSocketServer | undefined;
    let buildPromise = Promise.resolve();

    const host = options.host ?? process.env.WS_HOST ?? "127.0.0.1";
    const port = options.port ?? Number(process.env.WS_PORT ?? 35729);
    const installUrlPath =
        options.installPath ?? `/__userscript__/${outputFileName}`;

    return {
        name: "userscript",

        config() {
            return {
                build: {
                    lib: {
                        entry: options.entry,
                        name:
                            options.name ??
                            toValidLibName(removeAllExtensions(entryFileName)),
                        formats: ["iife"],
                        fileName: outputFileName,
                    },
                },
            };
        },

        configResolved(resolvedConfig) {
            config = resolvedConfig;
            development = resolvedConfig.command === "serve";
            entryPath = path.resolve(config.root, options.entry);
            readUserscriptHeader(entryPath);
            outputPath = path.resolve(
                config.root,
                development
                    ? developmentOutput
                    : path.join(
                          options.output ?? path.dirname(entryPath),
                          outputFileName,
                      ),
            );
        },

        async closeBundle() {
            if (development) {
                return;
            }

            await buildUserscript(entryPath, outputPath, "", 0, false);
        },

        configureServer(server) {
            if (!development) {
                return;
            }

            const wsServer = new WebSocketServer({ host, port });
            webSocketServer = wsServer;
            wsServer.on("connection", () => {
                console.log("[userscript] client connected");
            });
            wsServer.on("error", (error) => {
                console.error("[userscript] WebSocket server error:", error);
            });
            console.log(`[userscript] listening on ws://${host}:${port}`);

            server.middlewares.use(installUrlPath, (_request, response) => {
                response.setHeader("Content-Type", "application/javascript");
                response.end(
                    `${addRequire(readUserscriptHeader(entryPath), pathToFileURL(outputPath).href)}\n`,
                );
            });

            const rebuild = () => {
                buildPromise = buildPromise
                    .then(() =>
                        buildUserscript(
                            entryPath,
                            outputPath,
                            host,
                            port,
                            true,
                        ),
                    )
                    .catch((error) => {
                        console.error("[userscript] build failed:", error);
                    });
                return buildPromise;
            };

            server.watcher.on("change", (file) => {
                const changedPath = path.resolve(file);
                const rootPath = path.resolve(config.root);
                if (
                    changedPath.includes(
                        `${path.sep}node_modules${path.sep}`,
                    ) ||
                    !changedPath.startsWith(`${rootPath}${path.sep}`) ||
                    changedPath === outputPath
                ) {
                    return;
                }

                void rebuild().then(() => notifyReload(webSocketServer));
            });

            server.httpServer?.once("close", () => {
                wsServer.close();
                webSocketServer = undefined;
            });

            if (options.openInstallPage !== false) {
                void rebuild().then(() => {
                    if (server.httpServer?.listening) {
                        openInstallPage(server, installUrlPath);
                    } else {
                        server.httpServer?.once("listening", () => {
                            openInstallPage(server, installUrlPath);
                        });
                    }
                });
            } else {
                void rebuild();
            }
        },
    };
}

function readUserscriptHeader(entryPath: string): string {
    const source = readFileSync(entryPath, "utf8");
    const match = source.match(
        /^(\uFEFF?\/\/ ==UserScript==\r?\n[\s\S]*?\r?\n\/\/ ==\/UserScript==)(?:\r?\n|$)/,
    );
    if (!match) {
        throw new Error(
            `[userscript] entry does not contain a UserScript header: ${entryPath}`,
        );
    }
    return match[1];
}

function addRequire(header: string, requireUrl: string): string {
    return header.replace(
        /(\r?\n)(\/\/ ==\/UserScript==)$/,
        `$1// @require      ${requireUrl}$1$2`,
    );
}

async function buildUserscript(
    entryPath: string,
    outputPath: string,
    host: string,
    port: number,
    includeReloadClient: boolean,
): Promise<void> {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await esbuild.build({
        bundle: true,
        entryPoints: [entryPath],
        format: "iife",
        outfile: outputPath,
        platform: "browser",
        banner: {
            js: `${readUserscriptHeader(entryPath)}\n`,
        },
        sourcemap: includeReloadClient ? "inline" : false,
        ...(includeReloadClient
            ? { footer: { js: createReloadClient(host, port) } }
            : {}),
    });
    console.log(`[userscript] built ${outputPath}`);
}

function notifyReload(webSocketServer: WebSocketServer | undefined): void {
    for (const client of webSocketServer?.clients ?? []) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(reloadMessage);
        }
    }
}

function openInstallPage(server: ViteDevServer, installUrlPath: string): void {
    const baseUrl = server.resolvedUrls?.local[0];
    if (!baseUrl) {
        return;
    }

    const installUrl = new URL(installUrlPath, baseUrl).href;
    const command: [string, string[]] =
        process.platform === "win32"
            ? ["cmd", ["/c", "start", "", installUrl]]
            : process.platform === "darwin"
              ? ["open", [installUrl]]
              : ["xdg-open", [installUrl]];
    execFile(command[0], command[1], (error) => {
        if (error) {
            console.warn(`[userscript] could not open ${installUrl}:`, error);
        }
    });
    console.log(`[userscript] install page: ${installUrl}`);
}

function createReloadClient(host: string, port: number): string {
    return `;(function(){try{let connected=false;var ws=new WebSocket("ws://${host}:${port}");ws.addEventListener("open",function(){connected=true;});ws.addEventListener("message",function(event){if(event.data==="${reloadMessage}")location.reload();});ws.addEventListener("close",function(){if(connected){setTimeout(function(){location.reload();},100);}});}catch(error){console.warn("userscript reload ws failed",error);}})();`;
}
