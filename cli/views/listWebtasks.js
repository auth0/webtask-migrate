const _ = require('lodash');
const chalk = require('chalk');

module.exports = listWebtasks;

function listWebtasks(webtasks) {

    let maxTenantName = 0;
    let maxWebtaskName = 0;

    for (const tenantName in webtasks) {
        maxTenantName = _.max([maxTenantName, tenantName.length]);
        maxWebtaskName = _.max([maxWebtaskName, ..._.map(webtasks[tenantName], name => name.length)]);
    }

    console.log();
    console.log(chalk.cyan(
        _.padEnd('Container', maxTenantName),
        '   ',
        _.padEnd('Webtask', maxWebtaskName)));

    for (const tenantName in webtasks) {
        const webtaskNames = webtasks[tenantName];
        const tenantNames = [tenantName];
        while (webtaskNames.length) {
            console.log(
                _.padEnd(tenantNames.pop() || '',
                maxTenantName), '   ',
                _.padEnd(webtaskNames.pop(), maxWebtaskName));
        }
    }

    console.log();
}
