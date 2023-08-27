#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { generateContractInterfaces } from './generate-contract-interfaces';

const packageJson = JSON.parse(
	fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'),
);

const program = new Command()
	.name(packageJson.name)
	.version(packageJson.version, '-v, --version');

program
	.command('generate-contract-interfaces')
	.description('Generate contract type interfaces')
	.option('-i, --input [path]', 'Path to built contracts', 'build/contracts')
	.option(
		'-o, --output [path]',
		'Path to output directory',
		'lib/types/contracts',
	)
	.action(async (options) => {
		await generateContractInterfaces(options.input, options.output);
	});

program.parse();
