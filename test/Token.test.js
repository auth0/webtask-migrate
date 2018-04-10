const Assert = require('assert');
const { Token } = require('../src');
const Context = require('./context');

describe('Token', function() {
    describe('constructor()', function() {
        it('should expect tokenString parameter', function() {
            new Token(Context.masterTokenString);
        });
        it('should validate tokenString parameter', function() {
            let message;
            try {
                new Token({});
            } catch (error) {
                message = error.message;
            }
            Assert.strictEqual(message, 'tokenString(string) required');
        });
    });
    describe('isMasterToken()', function() {
        it('should return true for a master token', function() {
            const token = new Token(Context.masterTokenString);
            Assert.ok(token.isMasterToken());
        });
    });
    describe('isTenantToken()', function() {
        it('should return false for a master token', function() {
            const token = new Token(Context.masterTokenString);
            Assert.ok(!token.isTenantToken());
        });
    });
    describe('isWebtaskToken()', function() {
        it('should return false for a master token', function() {
            const token = new Token(Context.masterTokenString);
            Assert.ok(!token.isWebtaskToken());
        });
    });
    describe('getAllClaims()', function() {
        it('should return the token claims', function() {
            const token = new Token(Context.masterTokenString);
            const claims = token.getAllClaims();
            Assert.ok(claims, 'no claims');
            Assert.ok(claims.jti, 'no claims.jti');
            Assert.ok(claims.iat, 'no claims.iat');
            Assert.ok(claims.ca, 'no claims.ca');
            Assert.ok(claims.dd, 'no claims.dd');
        });
    });
    describe('getState()', function() {
        it('should return state for token without a tenant name', function() {
            const token = new Token(Context.masterTokenString);
            const expected = JSON.stringify({
                tokenString: Context.masterTokenString,
            });
            Assert.strictEqual(expected, JSON.stringify(token.getState()));
        });
        it('should return state for token with a tenant name', function() {
            const token = new Token(Context.tenant1.tokenString);
            const expected = JSON.stringify({
                tokenString: Context.tenant1.tokenString,
                tenantName: Context.tenant1.name
            });
            Assert.strictEqual(expected, JSON.stringify(token.getState()));
        });
    });
});
