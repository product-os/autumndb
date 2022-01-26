const fs = require("fs");
const path = require("path");
const { compile } = require("json-schema-to-typescript");
const { sortBy, get, filter, identity } = require("lodash");

const args = process.argv.slice(2);

const inputDir =
	args.length > 0 ? args[0] : path.resolve(__dirname, "../lib/schemas");

const outputDir =
	args.length > 1 ? args[1] : path.resolve(__dirname, "../lib/contracts");

const bannerComment = `/*
 * This file was automatically generated by 'npm run types'.
 *
 * DO NOT MODIFY IT BY HAND!
 */

`;

const typeInterfacePrefix = `

// tslint:disable: array-type

export * from './contract';
import { ContractDefinition, Contract } from './contract';

`;

const ensureExists = async (path, mask, cb) => {
	if (typeof mask == "function") {
		// Allow the `mask` parameter to be optional
		cb = mask;
		mask = 0o744;
	}
	await fs.mkdir(path, mask, function (err) {
		if (err) {
			if (err.code == "EEXIST") {
				// Ignore the error if the folder already exists
				return;
			}
			// Something else went wrong
			throw err;
		}
	});
};

/**
 * Generates TypeScript interface definition files for any type contracts in the given list of contracts.
 * The generated files will be written to a types.ts file, which will be deleted and re-created
 * as part of this function's actions.
 *
 * @param outputPath - the output path into which interface definition files should be written
 * @param contracts - a list of contracts. An interface definition file will be generated for every
 *                    _type_ contract.
 */
const generateContractInterfaces = async (outputPath, contracts) => {
	await ensureExists(outputPath, 0o744);

	await fs.promises.rm(outputPath, {
		recursive: true,
	});

	await fs.promises.writeFile(outputPath, bannerComment + typeInterfacePrefix);

	// Append to file
	const results = await Promise.all(
		sortBy(contracts, "slug")
			.filter((contract) => {
				return contract.type === "type@1.0.0";
			})
			.map(async (contract) => {
				// Not sure if we need to worry about anything other than "data".
				// Maybe include other fields whose definition differs from base Contract.
				const schema = get(
					contract,
					["data", "schema", "properties", "data"],
					{}
				);
				schema.title = `${contract.slug}-data`;

				let compiled = null;

				try {
					compiled = await compile(schema, contract.slug, {
						ignoreMinAndMaxItems: true,
						style: {
							bracketSpacing: true,
							printWidth: 120,
							semi: true,
							singleQuote: true,
							tabWidth: 2,
							trailingComma: "all",
							useTabs: true,
						},
						bannerComment: "",
					});
				} catch (error) {
					console.log(
						`✗ ${contract.slug}: ${error}`
					);
					return false;
				}
				console.log(`✓ ${contract.slug}`);

				const contractName = compiled.match(/interface ([a-zA-Z]+)Data/)[1];

				// Add definitions for the contract and contract defintion
				compiled += `
export interface ${contractName}ContractDefinition
	extends ContractDefinition<${contractName}Data> {}

export interface ${contractName}Contract
	extends Contract<${contractName}Data> {}

`;
				// Output file to local path
				await fs.promises.appendFile(outputPath, compiled);
				return true;
			})
	);

	return results;
};

const exclude = ["user-settings.json"];

const schemas = fs
	.readdirSync(inputDir)
	.filter((file) => file.split(".")[1] === "json")
	.filter((file) => !exclude.find((el) => el === file))
	.map((file) => require(path.join(inputDir, file)));

console.log(
		`Generating TS interface from JSON schema...
------------------------------------`)

generateContractInterfaces(path.join(outputDir, "index.ts"), schemas).then(
	(results) => {
		const succeeded = filter(results, identity);
		console.log(
			`------------------------------------
Generated ${succeeded.length} contract interfaces (${
	results.length - succeeded.length
} failed)`
		);

		if (results.length - succeeded.length > 0)  {
			process.exit(1)
		}
	}
);
