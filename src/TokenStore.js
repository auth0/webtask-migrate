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

    async addToken(token) {
        Assert.ok(token instanceof Token, 'token(Token) required');
        Assert.ok(!token.isWebtaskToken(), 'webtask tokens can not be stored');

        if (token.isMasterToken()) {
            this._masterToken = token;
        } else {
            const tenantName = token.getTenantName();
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
}

module.exports = TokenStore;
