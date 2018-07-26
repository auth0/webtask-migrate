const fs = require('fs');
const tasks = require('../tasks');
const views = require('../views');
const { TokenStore, Token, Deployment, Webtask, WebtaskAnalyzer } = require('../../src');

const command = {
    command: 'analyze',
    desc: 'Analyze webtasks to detect possible issues with migration',
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
        .option('codeFile', {
            describe: 'The path to a code file to analyze',
            alias: 'f',
        })
        .option('container', {
            describe: 'The container of the webtask to analyze',
            alias: 'c',
        })
        .option('webtask', {
            describe: 'The name of the webtask to analyze',
            alias: 'w',
        })
        .demand('deploymentUrl', 'The --deploymentUrl must be provided')
        .demand('masterToken', 'The --masterToken must be provided');
}

async function handler({ deploymentUrl, masterToken, codeFile, container, webtask }) {
    if (!codeFile) {
        if (!webtask || !container) {
            const message = [
                'Missing required arguments: container, webtask',
                'If the --codeFile value is not provided, both the --container and --webtask values must be.'
            ].join('\n');
            views.showHelp(message);
            process.exit(1);
        }
    }

    const tokenStore = new TokenStore();
    tokenStore.addToken(new Token(masterToken));

    const deployment = new Deployment(tokenStore, deploymentUrl);

    let webtaskInstance;
    if (!codeFile) {
        try {
            webtaskInstance = await deployment.downloadWebtask(container, webtask);
        } catch(error) {
            views.error('Failed to download the given webtask.');
            process.exit(2);
        }
        if (!webtaskInstance) {
            views.error('The given webtask was not found.');
            process.exit(3);
        }
    } else {
        try {
            const code = fs.readFileSync(codeFile).toString();
            webtaskInstance = new Webtask(code);
        } catch (error) {
            views.error(error.message);
            process.exit(4);
        }

    }

    webtask = webtask || '<loaded_code>';
    container = container || '<loaded_code>';

    const analyzer = new WebtaskAnalyzer(deployment);
    const analysis = await analyzer.analyze(container, webtask, webtaskInstance);
    views.listAnalysis(analysis);

}

module.exports = command;
