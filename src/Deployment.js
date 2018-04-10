const Assert = require('assert');
const _ = require('lodash');

const Client = require('./Client');
const Webtask = require('./Webtask');
const Token = require('./Token');
const TokenStore = require('./TokenStore');

const maxListLimit = 100;
const maxModules = 50;

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

        const tenantToken = await this._tokenStore.getTenantToken(tenantName);

        let method;
        let path;
        let body;

        const claims = webtask.getClaims();
        if (ignoreClaims || !_.keys(claims).length) {
            method = 'PUT';
            path = `api/webtask/${tenantName}/${webtaskName}`;
            body = {};
            const secrets = webtask.getSecrets();
            if (secrets) {
                body.secrets = secrets;
            }
        } else {
            method = 'POST';
            path = 'api/tokens/issue';
            body = claims;
            body.jtn = webtaskName;
            body.ten = tenantName;
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

        await this._client.request(method, path, tenantToken, body);

        const storage = webtask.getStorage();
        if (storage) {
            path = `api/webtask/${tenantName}/${webtaskName}/data`;
            await this._client.request('PUT', path, tenantToken, storage);
        }

        const cron = webtask.getCron();
        if (cron) {
            path = `api/cron/${tenantName}/${webtaskName}`;
            await this._client.request('PUT', path, tenantToken, cron);
        }

        return;
    }

    async downloadWebtask(tenantName, webtaskName, options) {
        Assert.ok(_.isString(tenantName), 'tenantName(string) required');
        Assert.ok(_.isString(webtaskName), 'webtaskName(string) required');

        options = options || {};
        Assert.ok(_.isObject(options), 'options(object) invalid type');

        const includeCron = options.includeCron || false;
        const includeStorage = options.includeStorage || false;
        const includeSecrets = options.includeSecrets || false;

        const tokenStore = this._tokenStore;
        const client = this._client;

        const token =
            (await tokenStore.getTenantToken(tenantName)) ||
            (await tokenStore.getMasterToken());

        const promises = [];
        const path = `${tenantName}/${webtaskName}`;
        const webtaskPath = `api/webtask/${path}`;
        const query = `?decrypt=${includeSecrets}&fetch_code=true`;

        promises.push(client.request('GET', `${webtaskPath}${query}`, token));
        if (includeStorage) {
            promises.push(client.request('GET', `${webtaskPath}/data`, token));
        }
        if (includeCron) {
            promises.push(client.request('GET', `api/cron/${path}`, token));
        }

        const results = await Promise.all(promises);
        const webtask = results.shift();
        const code = webtask.code;

        options = {
            secrets: webtask.secrets || {},
            meta: webtask.meta || {},
            token: new Token(webtask.token),
            storage: {},
            cron: {},
        };

        if (includeStorage) {
            const storage = results.shift();
            options.storage = storage;
        }

        if (includeCron) {
            const cron = results.shift();
            if (cron) {
                options.cron = {
                    state: cron.state,
                    schedule: cron.schedule,
                    tz: cron.tz,
                    meta: cron.meta,
                };
            }
        }

        return new Webtask(code, options);
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

        const token = tenantName
            ? await this._tokenStore.getTenantToken(tenantName)
            : await this._tokenStore.getMasterToken();

        const path = tenantName ? `api/webtask/${tenantName}` : 'api/webtask';
        const query = `?offset=${offset}&limit=${limit}`;
        const webtasks = await this._client.request('GET', path + query, token);
        const mapped = _.map(webtasks, webtask => {
            const token = new Token(webtask.token);
            return {
                tenantName: webtask.container,
                webtaskName: webtask.name,
                deployment: this,
                token,
            };
        });

        return mapped;
    }

    async deleteWebtask(tenantName, webtaskName) {
        Assert.ok(_.isString(tenantName), 'tenantName(string) required');
        Assert.ok(_.isString(webtaskName), 'webtaskName(string) required');

        const tenantToken = await this._tokenStore.getTenantToken(tenantName);
        await this._client.request(
            'DELETE',
            `api/webtask/${tenantName}/${webtaskName}`,
            tenantToken
        );
        return;
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

        const token = tenantName
            ? await this._tokenStore.getTenantToken(tenantName)
            : await this._tokenStore.getMasterToken();

        const path = 'api/env/node/modules';
        return await this._client.request('POST', path, token, { modules });
    }
}

module.exports = Deployment;
