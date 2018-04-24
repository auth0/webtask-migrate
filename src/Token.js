'use strict';

const Assert = require('assert');
const Decode = require('jwt-decode');
const _ = require('lodash');

const webtaskClaims = [ 'jti', 'iat', 'ca', 'dd', 'dr', 'ten', 'jtn', 'url', 'ectx', 'host' ];

class Token {
    constructor(tokenString, tenantName) {
        Assert.ok(_.isString(tokenString), 'tokenString(string) required');

        this._claims = Decode(tokenString);
        this._state = { tokenString };

        const name = tenantName || this._claims.ten
        if (name) {
            this._state.tenantName = name;
        }
    }

    isMasterToken() {
        return !this._claims.ten;
    }

    isTenantToken() {
        return this._claims.ten && this._claims.ten.length > 0;
    }

    isWebtaskToken() {
        return this.isTenantToken() && this._claims.dd === 0;
    }

    getAllClaims() {
        return _.clone(this._claims);
    }

    getWebtaskClaims() {
        const claimsToOmit = _.clone(webtaskClaims);
        if (this._claims.pb === 2) {
            claimsToOmit.push('pb');
        }
        if (this._claims.mb === 0) {
            claimsToOmit.push('mb');
        }
        return _.omit(this._claims, claimsToOmit);
    }

    getTenantName() {
        return this._state.tenantName || '';
    }

    getWebtaskName() {
        return this._claims.jtn || '';
    }

    getEncodedString() {
        return this._state.tokenString;
    }

    getState() {
        return _.clone(this._state);
    }
}

module.exports = Token;
