'use strict';

const Assert = require('assert');
const _ = require('lodash');

const CodeAnalyzer = require('./CodeAnalyzer');
const Client = require('./Client');
const Deployment = require('./Deployment');
const Webtask = require('./Webtask');

const codeAnalyzer = new CodeAnalyzer();

const githubWebtaskName = 'f913423c57f4356921eb2efb55aa0237';

const Warning = {
    analysisFailed: 'analysisFailed',
    activeCron: 'activeCron',
    unknownCompiler: 'unknownCompiler',
    unknownVersion: 'unknownVersion',
    dynamicRequire: 'dynamicRequire',
    unknownGlobal: 'unknownGlobal',
    unsupportedClaim: 'unsupportedClaim',
    hostDetected: 'hostDetected',
    githubDetected: 'githubDetected',
};

const knownVersions = {
    acorn: '3.3.0',
    async: '2.2.0',
    babel: '5.4.7',
    dotenv: '0.4.0',
    ejs: '2.4.1',
    joi: '6.10.0',
    jws: '3.1.0',
    lodash: '3.10.1',
    'lru-cache': '2.5.0',
    'magic-string': '0.16.0',
    mkdirp: '0.5.1',
    npm: '2.15.6',
    'raw-body': '2.2.0',
    request: '2.74.0',
    sandboxjs: '3.1.0',
    tripwire: '4.1.0',
    uuid: '2.0.1',
    'webtask-tools': '3.2.1',
    'auth0-api-jwt-rsa-validation': '0.0.1',
    'auth0-authz-rules-api': '1.0.8',
    'auth0-ext-compilers': '5.4.0',
    'auth0-oauth2-express': '0.0.1',
    edge: '5.0.0',
    '@webtask/middleware-compiler': '1.3.0',
};

const staticMessages = {
    analysisFailed: [
        'Failed to analyze the code.',
        'This may be because the code has a syntax error',
        'or because a compiler is being used to transpile',
        'from non-javascript text into javascript code.',
    ].join(' '),
    activeCron: [
        "The CRON job state is 'active' on both the new",
        'and old deployments and will run in both environments.',
        'Consider disabling the CRON job in one of the deployments.',
    ].join(' '),
    hostDetected: [
        `The webtask uses a host value to support a custom domain name.`,
        'Update the CNAME record with your hosting service to support the new deployment.',
    ].join(' '),
    githubDetected: [
        `The webtask uses github integration.`,
        'Re-enable github integration on the new deployment.',
    ].join(' '),
};

function parseVerquireSpec(spec) {
    let name;
    let version;

    const atIndex = spec.indexOf('@', 1);
    if (atIndex === -1) {
        name = spec;
    } else {
        name = spec.substring(0, atIndex);
        version = spec.substring(atIndex + 1);
    }

    let slashIndex = name.indexOf('/', 1);
    if (slashIndex >= 0) {
        if (name[0] === '@') {
            slashIndex = name.indexOf('/', slashIndex + 1);
        }
        if (slashIndex >= 0) {
            name = name.substring(0, slashIndex);
        }
    }

    return { name, version };
}

function tryDetermineVersion(modulesList, declaredModules, name) {
    const verquireModules = modulesList.verquireModules || {};
    if (Array.isArray(verquireModules[name]) && verquireModules[name].length) {
        return verquireModules[name][0];
    }

    for (const declaredModule of declaredModules) {
        if (declaredModule.name === name) {
            return declaredModule.version;
        }
    }

    return knownVersions[name] || null;
}

function createWarning(warningType, codeType, entry) {
    codeType = codeType || '';
    const value = entry ? entry.value || '' : '';
    const line = entry ? entry.line || 0 : 0;
    const column = entry ? entry.column || 0 : 0;

    let message;

    const staticMessage = staticMessages[warningType];
    if (staticMessage) {
        message = staticMessage;
    }

    if (warningType === Warning.unknownVersion) {
        message = [
            `A require for module '${value}' was`,
            `detected in the code at line '${line}', position '${column}'.`,
            'Analysis was unable to determine the module version.',
            'Ensure that the given module is declared as a dependency via metadata.',
        ].join(' ');
    }

    if (warningType === Warning.dynamicRequire) {
        message = [
            'A dynamic require was detected in the code',
            `at line '${line}', position '${column}'.`,
            'Analysis was unable to determine the module name and version.',
            'Ensure that the given module is declared as a dependency via metadata.',
        ].join(' ');
    }

    if (warningType === Warning.unsupportedClaim) {
        message = [
            `The token claim, '${value}', is not supported on the new deployment.`,
            'Ensure that the webtask still executes as expected on the new deployment.',
        ].join(' ');
    }

    if (warningType === Warning.unknownCompiler) {
        message = [
            `The compiler, '${value}', was detected.`,
            'Ensure that the given npm module for the compiler is declared as a dependency via metadata.',
        ].join(' ');
    }

    if (warningType === Warning.unknownGlobal) {
        message = [
            `An unknown global, '${value}', was detected in the code`,
            `at line '${line}', position '${column}'.`,
            'Analysis was unable to determine if this global is an',
            'assumed dependency in the code.',
            'If so, ensure that the given module is declared as a dependency via metadata.',
        ].join(' ');
    }

    return {
        warningType,
        codeType,
        value,
        line,
        column,
        message,
    };
}

function analyzeClaims(webtask, analysis, results) {
    const claims = webtask.getClaims();
    const claimKeys = _.keys(claims);
    if (claimKeys.length) {
        const argsLength =
            analysis && analysis.exportFunctionArguments
                ? analysis.exportFunctionArguments.length
                : 0;
        for (const claim of claimKeys) {
            if (claims[claim] == 1) {
                if (
                    (claim === 'pb' && (argsLength == 3 || argsLength == 0)) ||
                    claim === 'mb'
                ) {
                    const warning = createWarning(
                        Warning.unsupportedClaim,
                        '',
                        { value: claim }
                    );
                    results.warnings.push(warning);
                }
            }
        }
    }
}

function analyzeComplier(modulesList, compiler, declaredModules, results) {
    const required = parseVerquireSpec(compiler);
    let name = required.name;
    let version = required.version;

    if (!version) {
        version = tryDetermineVersion(modulesList, declaredModules, name);
    }

    if (version) {
        results.dependencies.push({ name, version });
    } else {
        const warning = createWarning(Warning.unknownCompiler, 'compiler', {
            value: compiler,
        });
        results.warnings.push(warning);
    }
}

function analyzeCode(modulesList, code, declaredModules, results, codeType) {
    const { nativeModuleNames } = modulesList;
    const { warnings, dependencies } = results;

    const analysis = codeAnalyzer.analyze(code);
    if (analysis.status === 'failed') {
        const warning = createWarning(Warning.analysisFailed, codeType);
        warnings.push(warning);
        return null;
    }

    for (const entry of analysis.globals) {
        const warning = createWarning(Warning.unknownGlobal, codeType, entry);
        warnings.push(warning);
    }

    for (const entry of analysis.dynamicRequires) {
        const warning = createWarning(Warning.dynamicRequire, codeType, entry);
        warnings.push(warning);
    }

    for (const entry of analysis.requires) {
        const required = parseVerquireSpec(entry.value);
        const name = required.name;
        let version = required.version;

        if (!version) {
            if (nativeModuleNames && nativeModuleNames.indexOf(name) !== -1) {
                continue;
            }

            version = tryDetermineVersion(modulesList, declaredModules, name);
        }

        if (version) {
            dependencies.push({ name, version });
        } else {
            const warning = createWarning(
                Warning.unknownVersion,
                codeType,
                entry
            );
            warnings.push(warning);
        }
    }

    return analysis;
}

async function analyzeGithub(webtaskAnalyzer, tenant, webtaskName, results) {
    const deployment = webtaskAnalyzer._deployment;
    const name = githubWebtaskName;
    const options = { includeStorage: true };

    let githubWebtask;
    try {
        githubWebtask = await deployment.downloadWebtask(tenant, name, options);
    } catch (error) {
        // do nothing
    }

    if (githubWebtask) {
        const data = githubWebtask.getStorageData();
        if (data) {
            let parsedData;
            try {
                parsedData = JSON.parse(data);
            } catch (error) {
                // do nothing
            }
            if (parsedData) {
                for (const key of _.keys(parsedData)) {
                    const value = parsedData[key];
                    if (key === webtaskName && _.isObject(parsedData[key])) {
                        const warning = createWarning(Warning.githubDetected);
                        results.warnings.push(warning);
                        return;
                    }
                }
            }
        }
    }
}

async function getCompilerCode(webtaskAnalyzer, compiler) {
    let code = null;
    if (
        _.startsWith(compiler, 'https://') ||
        _.startsWith(compiler, 'http://')
    ) {
        const client = new Client(compiler);
        try {
            code = await client.request('GET');
        } catch (error) {
            // do nothing
        }
    }
    return code;
}

async function loadModulesList(tenantName, webtaskAnalyzer) {
    const deployment = webtaskAnalyzer._deployment;
    const tokenStore = deployment.getTokenStore();

    const token = await tokenStore.getToken(tenantName);

    const client = deployment.getClient().clone();
    const containerName = token.isMasterToken()
        ? 'auth0-test-container'
        : tenantName;
    const path = `/api/run/${encodeURIComponent(containerName)}`;
    const body = [
        `const Path = require('path');`,
        `const nativeModuleNames = Object.keys(process.binding('natives'));`,
        `var verquireModules = [];`,
        `try {`,
        `verquireModules = require(Path.join(process.env.VERQUIRE_DIR, 'packages.json'));`,
        `} catch (error) {}`,
        `module.exports = cb => { cb(null, { nativeModuleNames, verquireModules }); }`,
    ].join('\n');

    let result;
    try {
        result = await client.request('POST', path, token, body);
    } catch (error) {
        const message = [
            'Failed to download provision modules list',
            `due to the following error: ${error.message}`,
        ].join(' ');
        throw new Error(message);
    }

    const parsedResult = JSON.parse(result);
    return parsedResult;
}

async function getModulesList(tenantName, webtaskAnalyzer) {
    if (webtaskAnalyzer._modulesListPromise) {
        return webtaskAnalyzer._modulesListPromise;
    }
    webtaskAnalyzer._modulesListPromise = loadModulesList(
        tenantName,
        webtaskAnalyzer
    );
    return await webtaskAnalyzer._modulesListPromise;
}

class WebtaskAnalyzer {
    constructor(deployment, options) {
        Assert.ok(
            deployment instanceof Deployment,
            'deployment(Deployment) required'
        );

        options = options || {};
        Assert.ok(_.isObject(options), 'options(Object) invalid Type');
        const warnOnClaims = options.warnOnClaims || false;

        this._deployment = deployment;
        this._warnOnClaims = warnOnClaims;
        this._modulesListPromise = null;
    }

    async analyze(tenantName, webtaskName, webtask) {
        Assert.ok(_.isString(webtaskName), 'webtaskName(string) required');
        Assert.ok(_.isString(tenantName), 'tenantName(string) required');
        Assert.ok(webtask instanceof Webtask, 'webtask(Webtask) required');

        const modulesList = await getModulesList(tenantName, this);
        const results = {
            warnings: [],
            dependencies: [],
        };

        const code = webtask.getCode();
        const declaredModules = webtask.getDependencies();
        const analysis = analyzeCode(
            modulesList,
            code,
            declaredModules,
            results,
            'webtask'
        );

        if (this._warnOnClaims) {
            analyzeClaims(webtask, analysis, results);
        }

        const compiler = webtask.getCompiler();
        if (compiler) {
            const compilerCode = await getCompilerCode(this, compiler);
            if (compilerCode) {
                analyzeCode(
                    modulesList,
                    compilerCode,
                    declaredModules,
                    results,
                    'compiler'
                );
            } else {
                analyzeComplier(
                    modulesList,
                    compiler,
                    declaredModules,
                    results
                );
            }
        }

        const cron = webtask.getCron();
        if (cron && cron.state === 'active') {
            results.warnings.push(createWarning(Warning.activeCron));
        }

        const host = webtask.getHost();
        if (host) {
            results.warnings.push(createWarning(Warning.hostDetected));
        }

        await analyzeGithub(this, tenantName, webtaskName, results);

        return results;
    }
}

module.exports = WebtaskAnalyzer;
