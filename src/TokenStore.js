'use strict';

const Assert = require('assert');
const EventEmitter = require('events');
const _ = require('lodash');

const Token = require('./Token');

class TokenStore extends EventEmitter {
    constructor() {
        super();
        this._tokens = {};
        this._masterToken = null;
    }

    async addToken(token, tenantName) {
        Assert.ok(token instanceof Token, 'token(Token) required');
        Assert.ok(!token.isWebtaskToken(), 'webtask tokens can not be stored');
        if (tenantName) {
            Assert.ok(_.isString(tenantName), 'tenantName(string) invalid type');
        }

        if (!tenantName && token.isMasterToken()) {
            this._masterToken = token;
        } else {
            tenantName = tenantName || token.getTenantName();
            this._tokens[tenantName] = token;
        }

        this.emit('token', token);
    }

    async getMasterToken() {
        return this._masterToken || null;
    }

    async getTenantNames() {
        return _.keys(this._tokens);
    }

    async getTenantToken(tenantName) {
        Assert.ok(_.isString(tenantName), 'tenantName(string) required');
        return this._tokens[tenantName] || null;
    }

    async getToken(tenantName) {
        let token = null;
        if (tenantName) {
            token = await this.getTenantToken(tenantName);
        }
        if (!token) {
            token = await this.getMasterToken();
        }
        if (!token) {
            const message = tenantName
                ? `No tenant token with name, '${tenantName}'.`
                : 'No master token.';
            throw new Error(message);
        }
        return token;
    }
}

module.exports = TokenStore;
