require('dotenv').config();
const _ = require('lodash');
const fs = require('fs');

const { TokenStore, Token, Deployment, WebtaskAnalyzer } = require('../src');

// Enviroment variables
const deploymentUrl = process.env.FROM_DEPLOYMENT_URL;
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

// Options
const warnOnClaims = true;
const includeCron = true;
const includeStorage = true;
const includeSecrets = false;

// Setup
const startTime = Date.now();
const tokenStore = new TokenStore();
tokenStore.addToken(new Token(tokenString, tenantName));

const deployment = new Deployment(tokenStore, deploymentUrl);
const analyzer = new WebtaskAnalyzer(deployment, { warnOnClaims });

// File Streams
const streams = {};

function createStream(name, fileName) {
    const path = `${outputDir}/${fileName}`;
    streams[name] = fs.createWriteStream(path, { flags: 'a' });
}

createStream('error', 'analyzeWebtasks.errors.csv');
createStream('compilers', 'compilers.csv');
createStream('webtaskCompilers', 'tenants.webtasks.compilers.csv');
createStream('claims', 'claims.csv');
createStream('webtaskClaims', 'tenants.webtasks.claims.csv');
createStream('webtaskStorage', 'storage.csv');
createStream('webtaskCron', 'cron.csv');
createStream('modules', 'modules.csv');
createStream('webtaskModules', 'tenants.webtasks.modules.csv');
createStream('warnings', 'warnings.csv');
createStream('webtaskWarnings', 'tenants.webtasks.warnings.csv');

// Counters and gobal data
let webtaskCount = 0;
let errorCount = 0;

const compilers = {};
const claims = {};
const modules = {};
const warnings = {};

let offset = 0;
const limit = 100;

async function onWebtask(tenantName, webtaskName) {

    const webtask = await deployment.downloadWebtask(
        tenantName,
        webtaskName,
        { includeCron, includeStorage, includeSecrets }
    );

    // Compiler
    const compiler = webtask.getCompiler();
    if (compiler) {
        const entry = [tenantName, webtaskName, compiler];
        streams.webtaskCompilers.write(`${entry.join()}\n`);
        if (!compilers[compiler]) {
            streams.compilers.write(`${compiler}\n`);
            compilers[compiler] = 1;
        }
    }

    // Claims
    const webtaskClaims = webtask.getClaims();
    for (const claimName of _.keys(webtaskClaims)) {
        const claimValue = webtaskClaims[claimName];
        const entry = [tenantName, webtaskName, claimName, claimValue];
        streams.webtaskClaims.write(`${entry.join()}\n`);

        const claimString = `${claimName}=${claimValue}`;
        if (!claims[claimString]) {
            streams.claims.write(`${claimString}\n`);
            claims[claimString] = 1;
        }
    }

    // Storage
    const storage = webtask.getStorageData();
    if (storage) {
        streams.webtaskStorage.write(`${tenantName},${webtaskName}\n`);
    }

    // Cron
    const cron = webtask.getStorageData();
    if (cron) {
        const entry = [tenantName, webtaskName, cron.state];
        streams.webtaskCron.write(`${entry.join()}\n`);
    }

    const analysis = await analyzer.analyze(tenantName, webtaskName, webtask);

    // Dependency analysis
    webtask.addDependencies(analysis.dependencies);
    const dependencies = webtask.getDependencies();
    for (const dependency of dependencies) {
        const { name, version } = dependency;
        const entry = [tenantName, webtaskName, name, version];
        streams.webtaskModules.write(`${entry.join()}\n`);
        const moduleString = `${name}@${version}`;
        if (!modules[moduleString]) {
            streams.modules.write(`${name},${version}\n`);
            modules[moduleString] = 1;
        }
    }

    // Warnings analysis
    for (const warning of analysis.warnings) {
        const { warningType, value } = warning;
        const entry = [tenantName, webtaskName, warningType, value];
        streams.webtaskWarnings.write(`${entry.join()}\n`);
        const warningString = `${warningType}::${value}`;
        if (!warnings[warningString]) {
            streams.warnings.write(`${warningType},${value}\n`);
            warnings[warningString] = 1;
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
    webtasks = await deployment.listWebtasks(tenantName, options);
    if (webtasks.length) {
        offset += webtasks.length;
        for (const { tenantName, webtaskName } of webtasks) {
            try {
                await onWebtask(tenantName, webtaskName);
            } catch (error) {
                const entry = [tenantName, webtaskName, error.message];
                streams.error.write(`${entry.join()}\n`);
                errorCount++;
            }
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

        for (const stream of _.values(streams)) {
            stream.close();
        }
    })
    .catch(error => {
        console.log('--- Error ---');
        console.log(error);
        process.exit(1);
    });
