require('dotenv').config();
const _ = require('lodash');
const fs = require('fs');

const { TokenStore, Token, Deployment } = require('../src');

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

// Setup
const startTime = Date.now();
const tokenStore = new TokenStore();
tokenStore.addToken(new Token(tokenString, tenantName));

const deployment = new Deployment(tokenStore, deploymentUrl);

// File Streams
const tenantsFile = `${outputDir}/tenants.csv`;
const tenantsStream = fs.createWriteStream(tenantsFile, { flags: 'a' });

const webtasksFile = `${outputDir}/tenants.webtasks.csv`;
const webtasksStream = fs.createWriteStream(webtasksFile, { flags: 'a' });

// Counters and gobal data
let webtaskCount = 0;
const tenants = {};

let offset = 0;
const limit = 100;

function onWebtask(tenantName, webtaskName) {

    webtasksStream.write(`${tenantName},${webtaskName}\n`);
    if (!tenants[tenantName]) {
        tenantsStream.write(`${tenantName}\n`);
        tenants[tenantName] = 1;
    }
    webtaskCount++;
    if (webtaskCount % 100 === 0) {
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
            onWebtask(tenantName, webtaskName);
        }
        await execute();
    }
}

Promise.all(_.times(10, execute))
    .then(() => {
        console.log('--- Completed ---');
        console.log(`Processed: ${webtaskCount}`);

        const duration = Date.now() - startTime;
        const durationInMinutes = duration / (60 * 1000);
        console.log(`Duration: ${durationInMinutes.toFixed(2)} min`);

        tenantsStream.close();
        webtasksStream.close();
    })
    .catch(error => {
        console.log('--- Error ---');
        console.log(error);
        process.exit(1);
    });
