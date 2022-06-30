#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs';
import * as _ from 'lodash';
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
	.action((options) => {
		generateContractInterfaces(options.input, options.output).then(
			(results) => {
				const succeeded = _.filter(results, _.identity);
				console.log(
					`Generated ${succeeded.length} contract interfaces (${
						results.length - succeeded.length
					} failed)`,
				);

				if (results.length - succeeded.length > 0) {
					process.exit(1);
				}
			},
		);
	});

program.parse();
