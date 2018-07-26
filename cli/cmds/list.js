const tasks = require('../tasks');
const views = require('../views');
const { TokenStore, Token, Deployment} = require('../../src');

const command = {
    command: 'list',
    desc: 'List the all the webtasks in the Webtask deployment',
    builder,
    handler,
};

function builder(yargs) {
    yargs
        .option('deploymentUrl', {
            describe: 'The base URL of the webtask deployment',
            alias: 'd',
        })
        .option('masterToken', {
            describe: 'The master token of the webtask deployment',
            alias: 'm',
        })
        .demand('deploymentUrl', 'A deploymentUrl must be provided')
        .demand('masterToken', 'A masterToken must be provided');
}

async function handler({ deploymentUrl, masterToken }) {
    const tokenStore = new TokenStore();
    tokenStore.addToken(new Token(masterToken));

    const deployment = new Deployment( tokenStore, deploymentUrl);
    const webtasks = await tasks.listWebtasks(deployment);
    views.listWebtasks(webtasks);
}

module.exports = command;
