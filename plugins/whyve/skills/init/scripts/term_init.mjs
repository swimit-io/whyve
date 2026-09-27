#!/usr/bin/env node
import cli from "../../../dist/cli.js";
process.exitCode = await cli.runCli(["term", "init", ...process.argv.slice(2)]);
