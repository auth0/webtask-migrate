const Assert = require('assert');

function getContext() {
    require('dotenv').config({path: './test/.env'});
    Assert.ok(
        process.env.TEST_MASTER_TOKEN,
        'Environment variable TEST_MASTER_TOKEN must be defined.'
    );
    Assert.ok(
        process.env.TEST_DEPLOYMENT_URL,
        'Environment variable TEST_DEPLOYMENT_URL must be defined.'
    );
    Assert.ok(
        process.env.TEST_TENANT_TOKEN_1,
        'Environment variable TEST_TENANT_TOKEN_1 must be defined.'
    );
    Assert.ok(
        process.env.TEST_TENANT_1,
        'Environment variable TEST_TENANT_1 must be defined.'
    );
    Assert.ok(
        process.env.TEST_TENANT_TOKEN_2,
        'Environment variable TEST_TENANT_TOKEN_2 must be defined.'
    );
    Assert.ok(
        process.env.TEST_TENANT_2,
        'Environment variable TEST_TENANT_1 must be defined.'
    );

    return {
        masterTokenString: process.env.TEST_MASTER_TOKEN,
        deploymentUrl: process.env.TEST_DEPLOYMENT_URL,
        tenant1: {
            name: process.env.TEST_TENANT_1,
            tokenString: process.env.TEST_TENANT_TOKEN_1
        },
        tenant2: {
            name: process.env.TEST_TENANT_2,
            tokenString: process.env.TEST_TENANT_TOKEN_2
        },

    };
}

module.exports = getContext();
