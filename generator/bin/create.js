#!/usr/bin/env node

import { spawn } from "node:child_process";
import {
    copyFile,
    mkdir,
    readFile,
    readdir,
    writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createInterface } from "node:readline/promises";

const templateDirectory = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../template",
);

async function copyTemplate(source, destination) {
    await mkdir(destination, { recursive: true });

    for (const entry of await readdir(source, { withFileTypes: true })) {
        const sourcePath = path.join(source, entry.name);
        const destinationPath = path.join(destination, entry.name);

        if (entry.isDirectory()) {
            await copyTemplate(sourcePath, destinationPath);
        } else if (entry.isFile()) {
            await copyFile(sourcePath, destinationPath);
        } else {
            throw new Error(`Unsupported template entry: ${sourcePath}`);
        }
    }
}

function installDependencies(destination) {
    return new Promise((resolve, reject) => {
        const windows = process.platform === "win32";
        const command = windows ? (process.env.ComSpec ?? "cmd.exe") : "npm";
        const args = windows ? ["/d", "/s", "/c", "npm install"] : ["install"];
        const child = spawn(command, args, {
            cwd: destination,
            stdio: "inherit",
        });

        child.once("error", reject);
        child.once("exit", (code, signal) => {
            if (code === 0) {
                resolve();
            } else {
                reject(
                    new Error(
                        signal
                            ? `npm install was terminated by ${signal}`
                            : `npm install exited with code ${code}`,
                    ),
                );
            }
        });
    });
}

function createPrompt() {
    const prompt = createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return {
        async ask(label, defaultValue) {
            const suffix = defaultValue ? ` (${defaultValue})` : "";
            const answer = await prompt.question(`${label}${suffix}: `);
            return answer.trim() || defaultValue;
        },
        close() {
            prompt.close();
        },
    };
}

function getDefaults(targetDirectory) {
    const directoryName = path.basename(path.resolve(targetDirectory));
    const packageName =
        directoryName
            .toLowerCase()
            .replace(/[^a-z0-9._-]+/g, "-")
            .replace(/^[._-]+|[._-]+$/g, "") || "userscript";
    const displayName = packageName
        .replace(/^@[^/]+\//, "")
        .split(/[-_.]+/)
        .filter(Boolean)
        .map((word) => word[0].toUpperCase() + word.slice(1))
        .join(" ");

    return {
        packageName,
        version: "1.0.0",
        description: "UserScript development environment",
        author: "",
        license: "ISC",
        userscriptName: displayName || "UserScript",
        namespace: "",
        match: "",
        grant: "none",
    };
}

async function collectProjectDetails(defaults, ask) {
    const fields = [
        ["packageName", "Package name"],
        ["version", "Version"],
        ["description", "Description"],
        ["author", "Author"],
        ["license", "License"],
        ["userscriptName", "UserScript name"],
        ["namespace", "UserScript namespace"],
        ["match", "UserScript @match pattern"],
        ["grant", "UserScript @grant"],
    ];
    const details = {};

    for (const [key, label] of fields) {
        details[key] = await ask(label, defaults[key]);
    }

    for (const key of [
        "version",
        "description",
        "userscriptName",
        "namespace",
        "match",
        "grant",
    ]) {
        if (/[\r\n]/.test(details[key])) {
            throw new Error(`${key} must not contain a line break.`);
        }
    }

    return details;
}

async function configureProject(destination, details) {
    const packagePath = path.join(destination, "package.json");
    const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
    packageJson.name = details.packageName;
    packageJson.version = details.version;
    packageJson.description = details.description;
    packageJson.author = details.author;
    packageJson.license = details.license;
    await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

    const entryPath = path.join(destination, "src", "userscript.user.ts");
    const entry = await readFile(entryPath, "utf8");
    const metadata = [
        "// ==UserScript==",
        `// @name         ${details.userscriptName}`,
        ...(details.namespace ? [`// @namespace    ${details.namespace}`] : []),
        `// @version      ${details.version}`,
        `// @description  ${details.description}`,
        ...(details.match ? [`// @match        ${details.match}`] : []),
        `// @grant        ${details.grant}`,
        "// ==/UserScript==",
    ].join("\n");
    const configuredEntry = entry.replace(
        /^\/\/ ==UserScript==[\s\S]*?^\/\/ ==\/UserScript==/m,
        metadata,
    );
    if (configuredEntry === entry) {
        throw new Error("Could not find the UserScript metadata template.");
    }
    await writeFile(entryPath, configuredEntry);
}

export async function createProject(
    targetDirectory,
    {
        install = true,
        template = templateDirectory,
        log = console,
        details = getDefaults(targetDirectory),
    } = {},
) {
    const destination = path.resolve(targetDirectory);
    await mkdir(destination, { recursive: true });

    if ((await readdir(destination)).length > 0) {
        throw new Error(`Target directory is not empty: ${destination}`);
    }

    await copyTemplate(template, destination);
    await configureProject(destination, details);
    log.log(`Project created at ${destination}`);

    if (install) {
        try {
            await installDependencies(destination);
        } catch (error) {
            log.error(
                `Dependencies could not be installed. Run "npm install" in ${destination} to retry.`,
            );
            throw error;
        }
    }

    log.log(`\nNext steps:\n  cd "${destination}"\n  npm run dev`);
}

function printHelp() {
    console.log(
        [
            "Usage: npm create @wiinuk/userscript [directory] [options]",
            "",
            "Options:",
            "  -y, --yes      Use defaults and skip all prompts",
            "  --skip-install  Create the project without running npm install",
            "  --help          Show this help",
        ].join("\n"),
    );
}

export async function main(args, { ask: askOverride } = {}) {
    if (args.includes("--help") || args.includes("-h")) {
        printHelp();
        return;
    }

    const unknownOptions = args.filter(
        (argument) =>
            argument.startsWith("-") &&
            argument !== "--skip-install" &&
            argument !== "--yes" &&
            argument !== "-y" &&
            argument !== "--help" &&
            argument !== "-h",
    );
    if (unknownOptions.length > 0) {
        throw new Error(`Unknown option: ${unknownOptions[0]}`);
    }

    const directories = args.filter((argument) => !argument.startsWith("-"));
    if (directories.length > 1) {
        throw new Error("Provide only one target directory.");
    }

    const yes = args.includes("--yes") || args.includes("-y");
    const prompt = yes || askOverride ? undefined : createPrompt();
    const ask = askOverride ?? prompt?.ask;

    try {
        const targetDirectory = directories[0]
            ? directories[0]
            : yes
              ? "userscript"
              : await ask("Project directory", "userscript");
        const defaults = getDefaults(targetDirectory);
        const details = yes
            ? defaults
            : await collectProjectDetails(defaults, ask);

        await createProject(targetDirectory, {
            install: !args.includes("--skip-install"),
            details,
        });
    } finally {
        prompt?.close();
    }
}

if (
    process.argv[1] &&
    pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
    main(process.argv.slice(2)).catch((error) => {
        console.error(`\n${error.message}`);
        process.exitCode = 1;
    });
}
