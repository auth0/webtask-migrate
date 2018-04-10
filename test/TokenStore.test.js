const Assert = require('assert');
const { TokenStore, Token, Deployment } = require('../src');
const Context = require('./context');

describe('TokenStore', function() {
    describe('addToken()', function() {
        it('should expect token parameter', async function() {
            const tokenStore = new TokenStore();
            const masterToken = new Token(Context.masterTokenString);
            tokenStore.addToken(masterToken);
        });
        it('should validate token parameter', async function() {
            const tokenStore = new TokenStore();
            let message;
            try {
                await tokenStore.addToken({});
            } catch (error) {
                message = error.message;
            }
            Assert.strictEqual(message, 'token(Token) required');
        });
        it('should store a master token if added', async function() {
            const tokenStore = new TokenStore();
            const masterToken = new Token(Context.masterTokenString);
            await tokenStore.addToken(masterToken);
            const actual = await tokenStore.getMasterToken();
            Assert.strictEqual(actual, masterToken);
        });
        it('should store a tenant token if added', async function() {
            const tokenStore = new TokenStore();
            const tenantToken = new Token(Context.tenant1.tokenString);
            await tokenStore.addToken(tenantToken);
            const actual = await tokenStore.getTenantToken(Context.tenant1.name);
            Assert.strictEqual(actual, tenantToken);
        });
        it('should raise an event for the added token', async function() {
            const tokenStore = new TokenStore();

            let actual = null;
            tokenStore.on('token', token => actual = token);

            const masterToken = new Token(Context.masterTokenString);
            await tokenStore.addToken(masterToken);
            Assert.strictEqual(actual, masterToken);
        });
    });
});
