import assert from "node:assert/strict";
import {
    mkdtemp,
    mkdir,
    readFile,
    readdir,
    rm,
    writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { createProject, main } from "../bin/create.js";
import packageJson from "../package.json" with { type: "json" };

const temporaryDirectories = [];

test("publishes under the package name resolved by npm create @wiinuk/userscript", () => {
    assert.equal(packageJson.name, "@wiinuk/create-userscript");
    assert.deepEqual(packageJson.bin, {
        "create-userscript": "./bin/create.js",
    });
});

async function createTemporaryDirectory() {
    const directory = await mkdtemp(
        path.join(os.tmpdir(), "userscript-generator-test-"),
    );
    temporaryDirectories.push(directory);
    return directory;
}

afterEach(async () => {
    await Promise.all(
        temporaryDirectories
            .splice(0)
            .map((directory) =>
                rm(directory, { recursive: true, force: true }),
            ),
    );
});

test("creates a generic UserScript project without placeholder metadata", async () => {
    const temporaryDirectory = await createTemporaryDirectory();
    const destination = path.join(temporaryDirectory, "project");
    const messages = [];

    await createProject(destination, {
        install: false,
        log: { log: (message) => messages.push(message) },
    });

    const packageJson = JSON.parse(
        await readFile(path.join(destination, "package.json"), "utf8"),
    );
    const userscript = await readFile(
        path.join(destination, "src", "userscript.user.ts"),
        "utf8",
    );
    const files = await readdir(destination);

    assert.equal(packageJson.name, "project");
    assert.equal(packageJson.scripts.dev, "vite");
    assert.match(userscript, /@name\s+Project/);
    assert.doesNotMatch(userscript, /example|my-userscript/i);
    assert.doesNotMatch(userscript, /@match/);
    assert.ok(files.includes("src"));
    assert.ok(files.includes("README.md"));
    assert.ok(
        await readFile(
            path.join(destination, "src", "vite-plugin-userscript.ts"),
            "utf8",
        ),
    );
    assert.ok(messages.some((message) => message.includes("npm run dev")));
});

test("accepts package and UserScript details through npm-init-style prompts", async () => {
    const temporaryDirectory = await createTemporaryDirectory();
    const destination = path.join(temporaryDirectory, "field-notes");
    const answers = [
        "field-notes",
        "2.3.4",
        "Organize field notes",
        "A. Author",
        "MIT",
        "Field Notes",
        "https://notes.invalid/",
        "https://notes.invalid/*",
        "GM_getValue",
    ];
    const questions = [];

    await main([destination, "--skip-install"], {
        ask: async (question, defaultValue) => {
            questions.push({ question, defaultValue });
            return answers.shift();
        },
    });

    const packageJson = JSON.parse(
        await readFile(path.join(destination, "package.json"), "utf8"),
    );
    const userscript = await readFile(
        path.join(destination, "src", "userscript.user.ts"),
        "utf8",
    );

    assert.equal(questions.length, 9);
    assert.equal(questions[0].defaultValue, "field-notes");
    assert.equal(packageJson.name, "field-notes");
    assert.equal(packageJson.version, "2.3.4");
    assert.equal(packageJson.author, "A. Author");
    assert.equal(packageJson.license, "MIT");
    assert.match(userscript, /@name\s+Field Notes/);
    assert.match(userscript, /@namespace\s+https:\/\/notes\.invalid\//);
    assert.match(userscript, /@match\s+https:\/\/notes\.invalid\/\*/);
    assert.match(userscript, /@grant\s+GM_getValue/);
});

test("the yes aliases skip prompts and derive metadata from the target directory", async () => {
    const temporaryDirectory = await createTemporaryDirectory();

    for (const [flag, directoryName] of [
        ["-y", "quick-script"],
        ["--yes", "another-script"],
    ]) {
        const destination = path.join(temporaryDirectory, directoryName);

        await main([flag, destination, "--skip-install"], {
            ask: async () => {
                throw new Error(`Prompt should not be called with ${flag}.`);
            },
        });

        const packageJson = JSON.parse(
            await readFile(path.join(destination, "package.json"), "utf8"),
        );
        const userscript = await readFile(
            path.join(destination, "src", "userscript.user.ts"),
            "utf8",
        );

        assert.equal(packageJson.name, directoryName);
        assert.match(
            userscript,
            new RegExp(
                `@name\\s+${directoryName
                    .split("-")
                    .map((word) => word[0].toUpperCase() + word.slice(1))
                    .join(" ")}`,
            ),
        );
        assert.doesNotMatch(userscript, /example|my-userscript/i);
        assert.doesNotMatch(userscript, /@match/);
    }
});

test("refuses to write into a non-empty directory", async () => {
    const temporaryDirectory = await createTemporaryDirectory();
    const destination = path.join(temporaryDirectory, "project");
    await mkdir(destination);
    await writeFile(path.join(destination, "existing.txt"), "keep");

    await assert.rejects(
        createProject(destination, { install: false }),
        /Target directory is not empty/,
    );
    assert.equal(
        await readFile(path.join(destination, "existing.txt"), "utf8"),
        "keep",
    );
});
