#!/usr/bin/env node
import cli from "../../../dist/cli.js";
process.exitCode = await cli.runCli(["document", ...process.argv.slice(2)]);
