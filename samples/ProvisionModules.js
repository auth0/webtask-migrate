require('dotenv').config();
const _ = require('lodash');
const fs = require('fs');

const { TokenStore, Token, Deployment, ModuleProvisioner } = require('../src');

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

const inputFilePath = `${outputDir}/modules.csv`;
if (!fs.existsSync(inputFilePath)) {
    console.log('Execute the \'AnalyzeWebtasks\' sample first to collect module data.');
    process.exit(1);
}

const inputFile = fs.readFileSync(inputFilePath);
const modules = [];
for (const line of _.split(inputFile, '\n')) {
    const segments = _.split(line, ',');
    if (segments.length === 2) {
        modules.push({ name: segments[0], version: segments[1] });
    }
}

const provisioner = new ModuleProvisioner(deployment, modules);

// Handle error events
let errorCount = 0;
const errorFile = `${outputDir}/provisionModules.errors.csv`;
const errorStream = fs.createWriteStream(errorFile, { flags: 'a' });
provisioner.on('error', error => {
    errorStream.write(`${error}\n`);
    errorCount++;
});

// Handle module events
let moduleCount = 0;
let failedCount = 0;

const modulesStateFile = `${outputDir}/modules.state.csv`;
const modulesStateStream = fs.createWriteStream(modulesStateFile, { flags: 'a' });

provisioner.on('module', aModule => {
    const { name, version } = aModule;
    modulesStateStream.write(`${name},${version},available\n`);
    moduleCount++;
    if (moduleCount % 5 === 0) {
        console.log('Processed: ', moduleCount);
    }
});

provisioner.on('failed', aModule => {
    const { name, version } = aModule;
    modulesStateStream.write(`${name},${version},failed\n`);
    moduleCount++;
    failedCount++;
    if (moduleCount % 5 === 0) {
        console.log('Processed: ', moduleCount);
    }
});

// Handle done event
provisioner.on('done', () => {
    console.log('--- Completed ---');
    console.log(`Processed: ${moduleCount}`);
    console.log(`Failed to Provision: ${failedCount}`);
    console.log(`Errors: ${errorCount}`);

    const duration = Date.now() - startTime;
    const durationInMinutes = duration/(60 * 1000);
    console.log(`Duration: ${durationInMinutes.toFixed(2)} min`);

    modulesStateStream.close();
    errorStream.close();
    process.exit(0);
});

// Start downloading
provisioner.provision();
