require('dotenv').config();
const _ = require('lodash');
const fs = require('fs');

const { TokenStore, Token, Deployment, WebtaskMigrator } = require('../src');

// Enviroment variables
const fromDeploymentUrl = process.env.FROM_DEPLOYMENT_URL;
const toDeploymentUrl = process.env.TO_DEPLOYMENT_URL;
const tokenString = process.env.TOKEN;
const tenantName = process.env.TENANT || null;

// Ensure output dir
const outputDir = `./output/${process.env.OUTPUT}`;
if (!fs.existsSync(outputDir)) {
    if (!fs.existsSync('./output')) {
        fs.mkdirSync('./output');
    }
    fs.mkdirSync(outputDir);
}

// Setup
const startTime = Date.now();
const tokenStore = new TokenStore();
tokenStore.addToken(new Token(tokenString, tenantName));

const fromDeployment = new Deployment(tokenStore, fromDeploymentUrl);
const toDeployment = new Deployment(tokenStore, toDeploymentUrl);

const migratorOptions = {
    includeStorage: true,
    includeCron: true,
    includeSecrets: true,
    ignoreClaims: true,
    dryRun: true,
    generateReport: false,
};

const migrator = new WebtaskMigrator(
    fromDeployment,
    toDeployment,
    migratorOptions
);

// File Streams
const append = { flags: 'a' };
const errorFile = `${outputDir}/migrateWebtasks.errors.csv`;
const errorStream = fs.createWriteStream(errorFile,append );

const migrateFile = `${outputDir}/tenants.webtasks.migrate.csv`;
const migrateStream = fs.createWriteStream(migrateFile, append);

const warningsFile = `${outputDir}/migrate.warnings.csv`;
const warningsStream = fs.createWriteStream(warningsFile, append);

const webtasksWarningsFile = `${outputDir}/tenants.webtasks.migrate.warnings.csv`;
const webtasksWarningsStream = fs.createWriteStream(webtasksWarningsFile, append);

// Counters and gobal data
let webtaskCount = 0;
let errorCount = 0;
const warningLabels = {};

let offset = 0;
const limit = 100;

async function onWebtask(tenantName, webtaskName) {

    let results;
    try {
        results = await migrator.migrate(tenantName, webtaskName);
    } catch (error) {
        errorStream.write(`${error.message}\n`);
        errorCount++;
    }

    if (results) {
        const { status, message, warnings } = results;
        migrateStream.write(
            `${tenantName},${webtaskName},${status},"${message}"\n`
        );

        if (warnings) {
            for (const warning of results.warnings) {
                const { warningType, value, message } = warning;
                webtasksWarningsStream.write(
                    `${tenantName},${webtaskName},${warningType},${value},"${message}"\n`
                );
                const warningLabel = `${warningType}:${value}`;
                if (!warningLabels[warningLabel]) {
                    warningsStream.write(`${warningType},${value}\n`);
                    warningLabels[warningLabel] = 1;
                }
            }
        }
    }

    webtaskCount++;
    if (webtaskCount % 10 === 0) {
        console.log('Processed: ', webtaskCount);
    }
}

async function execute() {
    const options = { offset, limit };
    offset += limit;
    webtasks = await fromDeployment.listWebtasks(tenantName, options);
    if (webtasks.length) {
        offset += webtasks.length;
        for (const { tenantName, webtaskName } of webtasks) {
            await onWebtask(tenantName, webtaskName);
        }
        await execute();
    }
}

Promise.all(_.times(10, execute))
    .then(() => {
        console.log('--- Completed ---');
        console.log(`Processed: ${webtaskCount}`);
        console.log(`Errors: ${errorCount}`);

        const duration = Date.now() - startTime;
        const durationInMinutes = duration / (60 * 1000);
        console.log(`Duration: ${durationInMinutes.toFixed(2)} min`);

        errorStream.close();
        migrateStream.close();
        warningsStream.close();
        webtasksWarningsStream.close();
    })
    .catch(error => {
        console.log('--- Error ---');
        console.log(error);
        process.exit(1);
    });
