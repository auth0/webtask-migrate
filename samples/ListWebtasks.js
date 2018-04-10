require('dotenv').config();
const _ = require('lodash');
const fs = require('fs');

const { TokenStore, Token, Deployment, WebtaskDownloader } = require('../src');

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

const downloaderOptions = { namesOnly: true };
const downloader = new WebtaskDownloader(deployment, downloaderOptions);

// Handle error events
let errorCount = 0;
const errorFile = `${outputDir}/listWebtasks.errors.csv`;
const errorStream = fs.createWriteStream(errorFile, { flags: 'a' });
downloader.on('error', error => {
    errorStream.write(`${error}\n`);
    errorCount++;
});

// Handle webtask events
let webtaskCount = 0;
const tenants = {};

const tenantsFile = `${outputDir}/tenants.csv`;
const tenantsStream = fs.createWriteStream(tenantsFile, { flags: 'a' });

const webtasksFile = `${outputDir}/tenants.webtasks.csv`;
const webtasksStream = fs.createWriteStream(webtasksFile, { flags: 'a' });

downloader.on('webtask', webtask => {
    const { tenantName, webtaskName } = webtask;
    webtasksStream.write(`${tenantName},${webtaskName}\n`);
    if (!tenants[tenantName]) {
        tenantsStream.write(`${tenantName}\n`);
        tenants[tenantName] = 1;
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

    tenantsStream.close();
    webtasksStream.close();
    errorStream.close();
    process.exit(0);
});

// Start downloading
downloader.download();
