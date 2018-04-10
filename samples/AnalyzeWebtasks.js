require('dotenv').config();
const _ = require('lodash');
const fs = require('fs');

const {
    TokenStore,
    Token,
    Client,
    Deployment,
    WebtaskDownloader,
} = require('../src');

// Enviroment variables
const deploymentName = process.env.DEPLOYMENT;
const deploymentUrl = process.env.DEPLOYMENT_URL;
const masterTokenString = process.env.MASTER_TOKEN;

// Ensure output dir
const outputDir = `./output/${deploymentName}`;
if (!fs.existsSync(outputDir)) {
    if (!fs.existsSync('./output')) {
        fs.mkdirSync('./output');
    }
    fs.mkdirSync(outputDir);
}

// Setup
const startTime = Date.now();
const tokenStore = new TokenStore();
tokenStore.addToken(new Token(masterTokenString));

const deploymentOptions = { maxConcurrency: 50 };
const deployment = new Deployment(tokenStore, deploymentUrl, deploymentOptions);

const downloaderOptions = {
    includeStorage: false,
    includeCron: false,
    includeSecrets: false,
    runAnalysis: true,
    filter: ({tenantName, webtaskName}) => {
        return !_.startsWith(tenantName, 'auth0-')
    }
};
const downloader = new WebtaskDownloader(deployment, downloaderOptions);

// Handle error events
let errorCount = 0;
const errorFile = `${outputDir}/analyzeWebtasks.errors.csv`;
const errorStream = fs.createWriteStream(errorFile, { flags: 'a' });
downloader.on('error', error => {
    errorStream.write(`${error.message}\n`);
    errorCount++;
});

// Handle webtask events
let webtaskCount = 0;

const compilers = {};
const compilersFile = `${outputDir}/compilers.csv`;
const compilersStream = fs.createWriteStream(compilersFile, { flags: 'a' });
const webtaksCompilersFile = `${outputDir}/tenants.webtasks.compilers.csv`;
const webtasksCompilersStream = fs.createWriteStream(webtaksCompilersFile, { flags: 'a' });

const modules = {};
const modulesFile = `${outputDir}/modules.csv`;
const modulesStream = fs.createWriteStream(modulesFile, { flags: 'a' });
const webtasksModulesFile = `${outputDir}/tenants.webtasks.modules.csv`;
const webtasksModulesStream = fs.createWriteStream(webtasksModulesFile, { flags: 'a' });

const warnings = {}
const warningsFile = `${outputDir}/warnings.csv`;
const warningsStream = fs.createWriteStream(warningsFile, { flags: 'a' });
const webtasksWarningsFile = `${outputDir}/tenants.webtasks.warnings.csv`;
const webtasksWarningsStream = fs.createWriteStream(webtasksWarningsFile, { flags: 'a' });

downloader.on('webtask', webtaskInfo => {

    // Compiler analysis
    const { tenantName, webtaskName, webtask, analysis } = webtaskInfo;
    const compiler = webtask.getCompiler();
    if (compiler) {
        webtasksCompilersStream.write(`${tenantName},${webtaskName},${compiler}\n`);
        if (!compilers[compiler]) {
            compilersStream.write(`${compiler}\n`);
            compilers[compiler] = 1;
        }
    }

    // Dependency analysis
    webtask.addDependencies(analysis.dependencies);
    const dependencies = webtask.getDependencies();
    for(const dependency of dependencies) {
        const { name, version } = dependency;
        webtasksModulesStream.write(`${tenantName},${webtaskName},${name},${version}\n`);
        const moduleString = `${name}@${version}`;
        if (!modules[moduleString]) {
            modulesStream.write(`${name},${version}\n`);
            modules[moduleString] = 1;
        }
    }

    // Warnings analysis
    for(const warning of analysis.warnings) {
        const { warningType, value } = warning;
        webtasksWarningsStream.write(`${tenantName},${webtaskName},${warningType},${value}\n`);
        const warningString = `${warningType}::${value}`;
        if (!warnings[warningString]) {
            warningsStream.write(`${warningType},${value}\n`);
            warnings[warningString] = 1;
        }
    }

    webtaskCount++;
    if (webtaskCount % 100 === 0) {
        console.log('Processed: ', webtaskCount);
    }
});

// Handle done event
downloader.on('done', () => {
    console.log('--- Completed ---');
    console.log(`Processed: ${webtaskCount}`);
    console.log(`Errors: ${errorCount}`);

    const duration = Date.now() - startTime;
    const durationInMinutes = duration/(60 * 1000);
    console.log(`Duration: ${durationInMinutes.toFixed(2)} min`);

    errorStream.close();
    compilersStream.close();
    webtasksCompilersStream.close();
    modulesStream.close();
    webtasksModulesStream.close();
    warningsStream.close();
    webtasksWarningsStream.close();
    process.exit(0);
});

// Start downloading
downloader.download();
