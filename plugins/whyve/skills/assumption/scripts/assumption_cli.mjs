#!/usr/bin/env node
import cli from "../../../dist/cli.js";
process.exitCode = await cli.runCli(["assumption", ...process.argv.slice(2)]);
