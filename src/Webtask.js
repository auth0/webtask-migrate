'use strict';

const Assert = require('assert');
const hash = require('object-hash');
const _ = require('lodash');

const Token = require('./Token');

class Webtask {
    constructor(code, options) {
        Assert.ok(_.isString(code), 'code(string) required');
        options = options || {};
        Assert.ok(_.isObject(options), 'options(object) invalid type');
        if (options.token) {
            Assert.ok(
                options.token instanceof Token,
                'options.token(Token) invalid type'
            );
        }

        const storage = _.cloneDeep(options.storage || {});
        if (storage.data && !_.isString(storage.data)) {
            storage.data = JSON.stringify(storage.data);
        }

        this._state = {
            code,
            meta: options.meta || {},
            secrets: options.secrets || {},
            storage,
            cron: options.cron || {},
            token: options.token || null,
        };
    }

    getCode() {
        return this._state.code;
    }

    getMeta() {
        return _.cloneDeep(this._state.meta);
    }

    getDependencies() {
        let dependencies;
        try {
            dependencies = JSON.parse(this._state.meta['wt-node-dependencies']);
        } catch (error) {
            // do nothing
        }

        const modules = [];
        if (dependencies) {
            for (const name of _.keys(dependencies)) {
                modules.push({ name, version: dependencies[name] });
            }
        }
        return modules;
    }

    removeDependencies(modules) {
        Assert.ok(_.isArray(modules), 'modules(array) requires');

        let dependencies;
        try {
            dependencies = JSON.parse(this._state.meta['wt-node-dependencies']);
        } catch (error) {
            // do nothing
        }

        dependencies = dependencies || {};

        for (const aModule of modules) {
            Assert.ok(_.isString(aModule.name), 'module.name(string) required');
            Assert.ok(
                _.isString(aModule.version),
                'module.version(string) required'
            );

            delete dependencies[aModule.name];
        }

        this._state.meta['wt-node-dependencies'] = JSON.stringify(dependencies);
    }

    addDependencies(modules) {
        Assert.ok(_.isArray(modules), 'modules(array) requires');

        let dependencies;
        try {
            dependencies = JSON.parse(this._state.meta['wt-node-dependencies']);
        } catch (error) {
            // do nothing
        }

        dependencies = dependencies || {};

        for (const aModule of modules) {
            Assert.ok(_.isString(aModule.name), 'module.name(string) required');
            Assert.ok(
                _.isString(aModule.version),
                'module.version(string) required'
            );

            dependencies[aModule.name] = aModule.version;
        }

        this._state.meta['wt-node-dependencies'] = JSON.stringify(dependencies);
    }

    getCompiler() {
        return this._state.meta['wt-compiler'];
    }

    getSecrets() {
        return _.cloneDeep(this._state.secrets);
    }

    getStorageData() {
        return this._state.storage.data || null;
    }

    getStorageEtag() {
        return this._state.storage.etag || null;
    }

    setStorageData(data) {
        this._state.storage.data = _.isString(data)
            ? data
            : JSON.stringify(data);
    }

    getCron() {
        return _.cloneDeep(this._state.cron);
    }

    getClaims() {
        const token = this._state.token;
        if (token) {
            return this._state.token.getWebtaskClaims();
        }
        return {};
    }

    getHost() {
        const token = this._state.token;
        if (token) {
            const host = this._state.token.getAllClaims().host;
            return host || null;
        }

        return null;
    }

    getCodeUrl() {
        const token = this._state.token;
        if (token) {
            const url = this._state.token.getAllClaims().url;
            if (!_.startsWith(url, 'webtask://')) {
                return url;
            }
        }

        return null;
    }

    isUrlBased() {
        return this.getCodeUrl() !== null;
    }

    getState() {
        return _.cloneDeep(this._state);
    }

    getHash() {
        return hash(this._state);
    }
}

module.exports = Webtask;
