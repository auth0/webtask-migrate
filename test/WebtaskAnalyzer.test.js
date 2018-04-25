const Assert = require('assert');
const fs = require('fs');
const {
    WebtaskAnalyzer,
    Deployment,
    TokenStore,
    Token,
    Webtask,
} = require('../src');
const Context = require('./context');

describe('WebtaskAnalyzer', function() {
    describe('constructor()', function() {
        it('should expect deployment parameter', function() {
            const tokenStore = new TokenStore();
            const deployment = new Deployment(
                tokenStore,
                Context.deploymentUrl
            );
            new WebtaskAnalyzer(deployment);
        });
        it('should validate deployment parameter', function() {
            let message;
            try {
                new WebtaskAnalyzer({});
            } catch (error) {
                message = error.message;
            }
            Assert.strictEqual(message, 'deployment(Deployment) required');
        });
    });
    describe('analyze()', function() {
        it('should add a dependency for a built-in module', async function() {
            const tokenStore = new TokenStore();
            await tokenStore.addToken(new Token(Context.masterTokenString));
            const deployment = new Deployment(
                tokenStore,
                Context.deploymentUrl
            );
            const analyzer = new WebtaskAnalyzer(deployment);

            const webtask = new Webtask('require("lodash");');
            const result = await analyzer.analyze('foo', 'bar', webtask);
            Assert.equal(result.warnings.length, 0);
            Assert.equal(result.dependencies.length, 1);
            Assert.equal(result.dependencies[0].name, 'lodash');
            Assert.equal(result.dependencies[0].version, '3.10.1');
        });
        it('should ignore native module', async function() {
            const tokenStore = new TokenStore();
            await tokenStore.addToken(new Token(Context.masterTokenString));
            const deployment = new Deployment(
                tokenStore,
                Context.deploymentUrl
            );
            const analyzer = new WebtaskAnalyzer(deployment);

            const webtask = new Webtask('require("crypto");');
            const result = await analyzer.analyze('foo', 'bar', webtask);
            Assert.equal(result.warnings.length, 0);
            Assert.equal(result.dependencies.length, 0);
        });
        it('should parse verequire correctly', async function() {
            const tokenStore = new TokenStore();
            await tokenStore.addToken(new Token(Context.masterTokenString));
            const deployment = new Deployment(
                tokenStore,
                Context.deploymentUrl
            );
            const analyzer = new WebtaskAnalyzer(deployment);

            const webtask = new Webtask('require("lodash@4.17.5");');
            const result = await analyzer.analyze('foo', 'bar', webtask);
            Assert.equal(result.warnings.length, 0);
            Assert.equal(result.dependencies.length, 1);
            Assert.equal(result.dependencies[0].name, 'lodash');
            Assert.equal(result.dependencies[0].version, '4.17.5');
        });
        it('should parse sub-modules correctly', async function() {
            const tokenStore = new TokenStore();
            await tokenStore.addToken(new Token(Context.masterTokenString));
            const deployment = new Deployment(
                tokenStore,
                Context.deploymentUrl
            );
            const analyzer = new WebtaskAnalyzer(deployment);

            const webtask = new Webtask('require("babel-runtime/regenerator");');
            const result = await analyzer.analyze('foo', 'bar', webtask);
            Assert.equal(result.warnings.length, 0);
            Assert.equal(result.dependencies.length, 1);
            Assert.equal(result.dependencies[0].name, 'babel-runtime');
            Assert.equal(result.dependencies[0].version, '6.3.19');
        });
        it('should parse modules names with an org correctly', async function() {
            const tokenStore = new TokenStore();
            await tokenStore.addToken(new Token(Context.masterTokenString));
            const deployment = new Deployment(
                tokenStore,
                Context.deploymentUrl
            );
            const analyzer = new WebtaskAnalyzer(deployment);

            const webtask = new Webtask('require("@webtask/middleware-compiler");');
            const result = await analyzer.analyze('foo', 'bar', webtask);
            Assert.equal(result.warnings.length, 0);
            Assert.equal(result.dependencies.length, 1);
            Assert.equal(result.dependencies[0].name, '@webtask/middleware-compiler');
            Assert.equal(result.dependencies[0].version, '1.3.0');
        });
        it('should warn with bad code', async function() {
            const tokenStore = new TokenStore();
            await tokenStore.addToken(new Token(Context.masterTokenString));
            const deployment = new Deployment(
                tokenStore,
                Context.deploymentUrl
            );
            const analyzer = new WebtaskAnalyzer(deployment);

            const webtask = new Webtask(
                'const m = "lodash";\nwhaaaa _ = require(m);'
            );
            const result = await analyzer.analyze('foo', 'bar', webtask);
            Assert.equal(result.warnings.length, 1);
            Assert.equal(result.dependencies.length, 0);
            Assert.equal(result.warnings[0].warningType, 'analysisFailed');
            Assert.equal(result.warnings[0].codeType, 'webtask');
            Assert.equal(result.warnings[0].line, 0);
            Assert.equal(result.warnings[0].column, 0);
            Assert.ok(result.warnings[0].message);
        });
        it('should warn with dynamic requires', async function() {
            const tokenStore = new TokenStore();
            await tokenStore.addToken(new Token(Context.masterTokenString));
            const deployment = new Deployment(
                tokenStore,
                Context.deploymentUrl
            );
            const analyzer = new WebtaskAnalyzer(deployment);

            const webtask = new Webtask(
                'const m = "lodash";\nconst _ = require(m);'
            );
            const result = await analyzer.analyze('foo', 'bar', webtask);
            Assert.equal(result.warnings.length, 1);
            Assert.equal(result.dependencies.length, 0);
            Assert.equal(result.warnings[0].warningType, 'dynamicRequire');
            Assert.equal(result.warnings[0].codeType, 'webtask');
            Assert.equal(result.warnings[0].line, 2);
            Assert.equal(result.warnings[0].column, 10);
            Assert.ok(result.warnings[0].message);
        });
        it('should warn with unknown global', async function() {
            const tokenStore = new TokenStore();
            await tokenStore.addToken(new Token(Context.masterTokenString));
            const deployment = new Deployment(
                tokenStore,
                Context.deploymentUrl
            );
            const analyzer = new WebtaskAnalyzer(deployment);

            const webtask = new Webtask('let something = specialGlobal');
            const result = await analyzer.analyze('foo', 'bar', webtask);
            Assert.equal(result.warnings.length, 1);
            Assert.equal(result.dependencies.length, 0);
            Assert.equal(result.warnings[0].warningType, 'unknownGlobal');
            Assert.equal(result.warnings[0].value, 'specialGlobal');
            Assert.equal(result.warnings[0].codeType, 'webtask');
            Assert.equal(result.warnings[0].line, 1);
            Assert.equal(result.warnings[0].column, 16);
            Assert.ok(result.warnings[0].message);
        });
        it('should warn for an unknown module version', async function() {
            const tokenStore = new TokenStore();
            await tokenStore.addToken(new Token(Context.masterTokenString));
            const deployment = new Deployment(
                tokenStore,
                Context.deploymentUrl
            );
            const analyzer = new WebtaskAnalyzer(deployment);

            const webtask = new Webtask("const x = require('xyz')");
            const result = await analyzer.analyze('foo', 'bar', webtask);
            Assert.equal(result.warnings.length, 1);
            Assert.equal(result.dependencies.length, 0);
            Assert.equal(result.warnings[0].warningType, 'unknownVersion');
            Assert.equal(result.warnings[0].codeType, 'webtask');
            Assert.equal(result.warnings[0].value, 'xyz');
            Assert.equal(result.warnings[0].line, 1);
            Assert.equal(result.warnings[0].column, 10);
            Assert.ok(result.warnings[0].message);
        });
        it('should not warn for an unknown module version declared as a dependency', async function() {
            const tokenStore = new TokenStore();
            await tokenStore.addToken(new Token(Context.masterTokenString));
            const deployment = new Deployment(
                tokenStore,
                Context.deploymentUrl
            );
            const analyzer = new WebtaskAnalyzer(deployment);

            const webtask = new Webtask("const x = require('xyz')");
            webtask.addDependencies([{ name: 'xyz', version: '1.0.0' }]);

            const result = await analyzer.analyze('foo', 'bar', webtask);
            Assert.equal(result.warnings.length, 0);
            Assert.equal(result.dependencies.length, 1);
            Assert.equal(result.dependencies[0].name, 'xyz');
            Assert.equal(result.dependencies[0].version, '1.0.0');
        });
        it('should warn if there is an active cron job', async function() {
            const tokenStore = new TokenStore();
            await tokenStore.addToken(new Token(Context.masterTokenString));
            const deployment = new Deployment(
                tokenStore,
                Context.deploymentUrl
            );
            const analyzer = new WebtaskAnalyzer(deployment);

            const webtaskOptions = { cron: { state: 'active' } };
            const webtask = new Webtask('const x = 5', webtaskOptions);
            const result = await analyzer.analyze('foo', 'bar', webtask);

            Assert.equal(result.warnings.length, 1);
            Assert.equal(result.dependencies.length, 0);
            Assert.equal(result.warnings[0].warningType, 'activeCron');
            Assert.equal(result.warnings[0].codeType, '');
            Assert.equal(result.warnings[0].line, 0);
            Assert.equal(result.warnings[0].column, 0);
            Assert.ok(result.warnings[0].message);
        });
        it('should not warn if there is an inactive cron job', async function() {
            const tokenStore = new TokenStore();
            await tokenStore.addToken(new Token(Context.masterTokenString));
            const deployment = new Deployment(
                tokenStore,
                Context.deploymentUrl
            );
            const analyzer = new WebtaskAnalyzer(deployment);

            const webtaskOptions = { cron: { state: 'inactive' } };
            const webtask = new Webtask('const x = 5', webtaskOptions);
            const result = await analyzer.analyze('foo', 'bar', webtask);

            Assert.equal(result.warnings.length, 0);
            Assert.equal(result.dependencies.length, 0);
        });
        it('should add warnings for unknown module based compilers', async function() {
            const tokenStore = new TokenStore();
            await tokenStore.addToken(new Token(Context.masterTokenString));
            const deployment = new Deployment(
                tokenStore,
                Context.deploymentUrl
            );
            const analyzer = new WebtaskAnalyzer(deployment);

            const webtaskOptions = {
                meta: { 'wt-compiler': 'webtask-toolz/jade' },
            };
            const webtask = new Webtask('const x = 5', webtaskOptions);
            const result = await analyzer.analyze('foo', 'bar', webtask);
            Assert.equal(result.warnings.length, 1);
            Assert.equal(result.dependencies.length, 0);
            Assert.equal(result.warnings[0].warningType, 'unknownCompiler');
            Assert.equal(result.warnings[0].codeType, 'compiler');
            Assert.equal(result.warnings[0].line, 0);
            Assert.equal(result.warnings[0].column, 0);
            Assert.equal(result.warnings[0].value, 'webtask-toolz/jade');
            Assert.ok(result.warnings[0].message);
        });
        it('should add a dependency for known module based compilers', async function() {
            const tokenStore = new TokenStore();
            await tokenStore.addToken(new Token(Context.masterTokenString));
            const deployment = new Deployment(
                tokenStore,
                Context.deploymentUrl
            );
            const analyzer = new WebtaskAnalyzer(deployment);

            const webtaskOptions = {
                meta: { 'wt-compiler': 'webtask-tools/jade' },
            };
            const webtask = new Webtask('const x = 5', webtaskOptions);
            const result = await analyzer.analyze('foo', 'bar', webtask);
            Assert.equal(result.warnings.length, 0);
            Assert.equal(result.dependencies.length, 1);
            Assert.equal(result.dependencies[0].name, 'webtask-tools');
            Assert.equal(result.dependencies[0].version, '3.2.1');
        });
        it('should add dependencies module based compilers', async function() {
            const tokenStore = new TokenStore();
            await tokenStore.addToken(new Token(Context.masterTokenString));
            const deployment = new Deployment(
                tokenStore,
                Context.deploymentUrl
            );
            const analyzer = new WebtaskAnalyzer(deployment);

            const webtaskOptions = {
                meta: {
                    'wt-compiler': 'typescript/tsc',
                },
            };
            const webtask = new Webtask('const x = 5', webtaskOptions);
            webtask.addDependencies([{ name: 'typescript', version: '1.0.0' }]);

            const result = await analyzer.analyze('foo', 'bar', webtask);

            Assert.equal(result.warnings.length, 0);
            Assert.equal(result.dependencies.length, 1);
            Assert.equal(result.dependencies[0].name, 'typescript');
            Assert.equal(result.dependencies[0].version, '1.0.0');
        });
        it('should add depdndencies for url based compilers', async function() {
            const tokenStore = new TokenStore();
            await tokenStore.addToken(new Token(Context.masterTokenString));
            const deployment = new Deployment(
                tokenStore,
                Context.deploymentUrl
            );
            const analyzer = new WebtaskAnalyzer(deployment);

            const webtaskOptions = {
                meta: {
                    'wt-compiler':
                        'https://raw.githubusercontent.com/tjanczuk/wtc/master/stripe_compiler.js',
                },
            };
            const webtask = new Webtask('const x = 5', webtaskOptions);
            const result = await analyzer.analyze('foo', 'bar', webtask);

            Assert.equal(result.warnings.length, 0);
            Assert.equal(result.dependencies.length, 1);
            Assert.equal(result.dependencies[0].name, 'stripe');
            Assert.equal(result.dependencies[0].version, '3.3.4');
        });
    });
});
