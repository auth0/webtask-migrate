'use strict';

const Assert = require('assert');
const _ = require('lodash');

const Client = require('./Client');
const Webtask = require('./Webtask');
const Token = require('./Token');
const TokenStore = require('./TokenStore');

const maxListLimit = 100;
const maxModules = 50;

function getNames(tenantName, webtaskName) {
    return {
        tenantName,
        webtaskName,
        safeTenant: encodeURIComponent(tenantName),
        safeWebtask: encodeURIComponent(webtaskName),
    };
}

async function uploadWebtask(deployment, names, token, webtask, ignoreClaims) {
    let method;
    let path;
    let body;

    const claims = webtask.getClaims();
    if (ignoreClaims || !_.keys(claims).length) {
        const { safeTenant, safeWebtask } = names;
        path = `api/webtask/${safeTenant}/${safeWebtask}`;
        body = {};
        method = 'PUT';

        const secrets = webtask.getSecrets();
        if (secrets) {
            body.secrets = secrets;
        }
    } else {
        method = 'POST';
        path = 'api/tokens/issue';
        body = claims;
        body.jtn = names.webtaskName;
        body.ten = names.tenantName;
        const secrets = webtask.getSecrets();
        if (secrets) {
            body.ectx = secrets;
        }
    }

    const url = webtask.getCodeUrl();
    if (url) {
        body.url = url;
    } else {
        body.code = webtask.getCode();
    }

    const meta = webtask.getMeta();
    if (meta) {
        body.meta = meta;
    }
    const host = webtask.getHost();
    if (host) {
        body.host = host;
    }

    try {
        await deployment._client.request(method, path, token, body);
    } catch (error) {
        const message = [
            'Failed to upload the webtask',
            `due to the following error: ${error.message}`,
        ].join(' ');
        throw new Error(message);
    }
}

async function uploadStorage(deployment, names, token, webtask, overwrite) {
    const data = webtask.getStorageData();
    if (data) {
        const { safeTenant, safeWebtask } = names;
        const path = `api/webtask/${safeTenant}/${safeWebtask}/data`;
        const body = { data };
        const etag = webtask.getStorageEtag();
        if (!overwrite) {
            body.etag = etag || null;
        }

        try {
            await deployment._client.request('PUT', path, token, body);
        } catch (error) {
            const message = [
                'Failed to upload the storage data to the webtask',
                `due to the following error: ${error.message}`,
            ].join(' ');
            throw new Error(message);
        }
    }
}

async function uploadCron(deployment, names, token, webtask) {
    const cron = webtask.getCron();
    if (cron && _.keys(cron).length) {
        const body = {
            tz: cron.tz,
            meta: cron.meta,
            schedule: cron.schedule,
            state: cron.state
        };
        const { safeTenant, safeWebtask } = names;
        const path = `api/cron/${safeTenant}/${safeWebtask}`;
        try {
            await deployment._client.request('PUT', path, token, body);
        } catch (error) {
            const message = [
                'Failed to create the CRON job',
                `due to the following error: ${error.message}`,
            ].join(' ');
            throw new Error(message);
        }
    }
}

async function startDownloads(deployment, names, options) {
    const tokenStore = deployment._tokenStore;
    const client = deployment._client;

    const token = await tokenStore.getToken(names.tenantName);

    const includeSecrets = options.includeSecrets == true;
    const path = `${names.safeTenant}/${names.safeWebtask}`;
    const webtaskPath = `api/webtask/${path}`;
    const query = `?decrypt=${includeSecrets}&fetch_code=true`;

    const promises = [];
    promises.push(client.request('GET', `${webtaskPath}${query}`, token));
    if (options.includeStorage) {
        promises.push(
            (promises.storage = client.request(
                'GET',
                `${webtaskPath}/data`,
                token
            ))
        );
    }
    if (options.includeCron) {
        promises.push(
            (promises.cron = client.request('GET', `api/cron/${path}`, token))
        );
    }

    try {
        return await Promise.all(promises);
    } catch (error) {
        const message = [
            'Failed to download the webtask',
            `due to the following error: ${error.message}`,
        ].join(' ');
        throw new Error(message);
    }
}

async function listWebtasks(deployment, tenantName, offset, limit) {
    const token = await deployment._tokenStore.getToken(tenantName);

    const path = tenantName
        ? `api/webtask/${encodeURIComponent(tenantName)}`
        : 'api/webtask';
    const query = `?offset=${offset}&limit=${limit}`;

    try {
        return await deployment._client.request('GET', path + query, token);
    } catch (error) {
        const message = [
            'Failed to download the list of webtasks',
            `due to the following error: ${error.message}`,
        ].join(' ');
        throw new Error(message);
    }
}

async function deleteWebtask(deployment, names, token) {
    try {
        await deployment._client.request(
            'DELETE',
            `api/webtask/${names.safeTenant}/${names.webtaskName}`,
            token
        );
    } catch (error) {
        const message = [
            'Failed to delete the webtask',
            `due to the following error: ${error.message}`,
        ].join(' ');
        throw new Error(message);
    }
}

async function provisionModules(deployment, modules, token) {
    const path = 'api/env/node/modules';
    const body = { modules };

    try {
        return await deployment._client.request('POST', path, token, body);
    } catch (error) {
        const message = [
            'Failed to provision the modules',
            `due to the following error: ${error.message}`,
        ].join(' ');
        throw new Error(message);
    }
}

class Deployment {
    constructor(tokenStore, client, options) {
        Assert.ok(
            tokenStore instanceof TokenStore,
            'tokenStore(TokenStore) required'
        );

        if (!(client instanceof Client)) {
            const deploymentUrl = client;
            Assert.ok(
                _.isString(deploymentUrl),
                'deploymentUrl(string) required'
            );
            client = new Client(deploymentUrl, options);
        }

        this._tokenStore = tokenStore;
        this._client = client;
    }

    getDeploymentUrl() {
        return this._client.getDeploymentUrl();
    }

    getClient() {
        return this._client;
    }

    getTokenStore() {
        return this._tokenStore;
    }

    async createTenant(tenantName, claims) {
        Assert.ok(_.isString(tenantName), 'tenantName(string) required');

        claims = claims || {};
        Assert.ok(_.isObject(claims), 'claims(object) invalid type');

        const body = _.cloneDeep(claims);
        body.ten = tenantName;

        const masterToken = await this._tokenStore.getMasterToken();

        const path = '/api/tokens/issue';
        const tokenString = await this._client.request(
            'POST',
            path,
            masterToken,
            body
        );
        const tenantToken = new Token(tokenString);

        await this._tokenStore.addToken(tenantToken);
        return tenantToken;
    }

    async uploadWebtask(tenantName, webtaskName, webtask, options) {
        Assert.ok(_.isString(tenantName), 'tenantName(string) required');
        Assert.ok(_.isString(webtaskName), 'webtaskName(string) required');
        Assert.ok(webtask instanceof Webtask, 'webtask(Webtask) required');
        options = options || {};
        Assert.ok(_.isObject(options), 'options(object) invalid type');

        const ignoreClaims = options.ignoreClaims || false;
        const overwriteStorage = options.overwriteStorage || false;
        const cronOnly = options.cronOnly;

        const names = getNames(tenantName, webtaskName);
        const token = await this._tokenStore.getToken(tenantName);

        if (cronOnly) {
            await uploadCron(this, names, token, webtask);
            return;
        }

        await uploadWebtask(this, names, token, webtask, ignoreClaims);
        await uploadStorage(this, names, token, webtask, overwriteStorage);
        await uploadCron(this, names, token, webtask);
    }

    async downloadWebtask(tenantName, webtaskName, options) {
        Assert.ok(_.isString(tenantName), 'tenantName(string) required');
        Assert.ok(_.isString(webtaskName), 'webtaskName(string) required');

        options = options || {};
        Assert.ok(_.isObject(options), 'options(object) invalid type');

        const names = getNames(tenantName, webtaskName);
        let results = await startDownloads(this, names, options);
        const webtask = results.shift();
        if (!webtask) {
            return null;
        }

        const code = webtask.code;
        const webtaskOptions = {
            secrets: webtask.secrets || {},
            meta: webtask.meta || {},
            token: new Token(webtask.token),
            storage: {},
            cron: {},
        };

        if (options.includeStorage) {
            webtaskOptions.storage = results.shift() || {};

        }

        if (options.includeCron) {
            webtaskOptions.cron = results.shift() || {};
        }

        return new Webtask(code, webtaskOptions);
    }

    async listWebtasks(tenantName, options) {
        if (_.isObject(tenantName)) {
            options = tenantName;
            tenantName = null;
        }

        options = options || {};
        const offset = options.offset || 0;
        const limit = options.limit || maxListLimit;

        Assert(
            limit <= maxListLimit,
            `options.limit(number) max value is ${maxListLimit}`
        );

        const webtasks = await listWebtasks(this, tenantName, offset, limit);

        return _.map(webtasks, webtask => {
            return {
                tenantName: webtask.container,
                webtaskName: webtask.name,
            };
        });
    }

    async deleteWebtask(tenantName, webtaskName) {
        Assert.ok(_.isString(tenantName), 'tenantName(string) required');
        Assert.ok(_.isString(webtaskName), 'webtaskName(string) required');

        const names = getNames(tenantName, webtaskName);
        const token = await this._tokenStore.getToken(tenantName);

        await deleteWebtask(this, names, token);
    }

    async provisionModules(modules, tenantName) {
        Assert.ok(_.isArray(modules), 'modules(array) required');
        Assert.ok(
            modules.length <= maxModules,
            `modules.length max value is ${maxModules}`
        );
        for (const aModule of modules) {
            Assert.ok(_.isString(aModule.name), 'module.name(string) required');
            Assert.ok(
                _.isString(aModule.version),
                'module.version(string) required'
            );
        }
        if (tenantName) {
            Assert.ok(
                _.isString(tenantName),
                'tenantName(string) invalid type'
            );
        }

        const token = await this._tokenStore.getToken(tenantName);
        return await provisionModules(this, modules, token);
    }
}

module.exports = Deployment;
