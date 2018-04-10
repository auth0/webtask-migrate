const Assert = require('assert');
const Decode = require('jwt-decode');
const _ = require('lodash');

const webtaskClaims = [ 'jti', 'iat', 'ca', 'dd', 'ten', 'jtn', 'url', 'etcx', 'host' ];

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
        return this._claims.dd === 3;
    }

    isTenantToken() {
        return this._claims.dd === 2;
    }

    isWebtaskToken() {
        return this._claims.dd === 1;
    }

    getAllClaims() {
        return _.clone(this._claims);
    }

    getWebtaskClaims() {
        const claimsToOmit = _.clone(webtaskClaims);
        if (this._claims.pb === 2) {
            claimsToOmit.push('pb');
        }
        if (this._claims.dr === 1) {
            claimsToOmit.push('dr');
        }
        if (this._claims.dd === 0) {
            claimsToOmit.push('dd');
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
