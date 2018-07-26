const _ = require('lodash');

module.exports = listWebtasks;

async function listWebtasks(deployment) {
    let tenants = {};
    let offset = 0;
    const limit = 100;


    async function execute() {
        const options = { offset, limit };
        offset += limit;
        const webtasks = await deployment.listWebtasks(options);
        if (webtasks.length) {
            for (const webtask of webtasks) {
                tenants[webtask.tenantName] = tenants[webtask.tenantName] || [];
                tenants[webtask.tenantName].push(webtask.webtaskName);
            }
            if (webtasks.length === limit) {
                await execute();
            }
        }
    }

    await Promise.all(_.times(10, execute));
    return tenants;
}
