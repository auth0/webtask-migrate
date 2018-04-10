const Assert = require('assert');
const _ = require('lodash');
const { Analyzer } = require('webtask-analyzer');

const Deployment = require('./Deployment');
const Webtask = require('./Webtask');

const nameVersionRegex = /(\S+)@(\d+\.\d+\.\d+)/;
const WarningTypes = {
    analysisFailed: 'analysisFailed',
    unknownVersion: 'unknownVersion',
    dynamicRequire: 'dynamicRequire',
    unknownGlobal: 'unknownGlobal',
};

function getLineNumber(lines, start) {
    let position = start;
    let line = 0;
    while (
        line < lines.length &&
        (!lines[line] || lines[line].length < position)
    ) {
        if (lines[line]) {
            position -= lines[line].length;
        }
        line++;
    }
    line++;
    return { line, position };
}

function createWarning(warningType, codeType, entry, code, lines) {
    if (warningType === WarningTypes.analysisFailed) {
        return {
            warningType,
            codeType,
            line: 0,
            position: 0,
            message: [
                'Failed to analyze the code.',
                'This may be because the code has a syntax error',
                'or because a compiler is being used to transpile',
                'from non-javascript text into javascript code.',
            ].join(' '),
        };
    }

    if (lines && !lines.length) {
        lines.push(..._.split(code, '\n'));
    }

    const value = entry.spec;
    const { line, position } = getLineNumber(lines, entry.start);
    let message;

    if (warningType === WarningTypes.unknownVersion) {
        message = [
            `A require for module '${value}' was`,
            `detected in the code at line '${line}', position '${position}'.`,
            'Analysis was unable to determine the module version.',
            'Ensure that the given module is declared as a dependency via metadata.',
        ].join(' ');
    }

    if (warningType === WarningTypes.dynamicRequire) {
        message = [
            'A dynamic require was detected in the code',
            `at line '${line}', position '${position}'.`,
            'Analysis was unable to determine the module name and version.',
            'Ensure that the given module is declared as a dependency via metadata.',
        ].join(' ');
    }

    if (warningType === WarningTypes.unknownGlobal) {
        message = [
            `An unknown global, '${value}', was detected in the code`,
            `at line '${line}', position '${position}'.`,
            'Analysis was unable to determine if this global is an',
            'assumed dependency in the code.',
            'If so, ensure that the given module is declared as a dependency via metadata.',
        ].join(' ');
    }

    return {
        warningType,
        codeType,
        value: value || '',
        line,
        position,
        message,
    };
}

async function analyzeCodeDependencies(
    webtaskAnalyzer,
    code,
    declaredModules,
    codeType
) {
    const analyzer = await getDependencyAnalyzer(webtaskAnalyzer);

    const result = { dependencies: [], warnings: [] };
    const lines = [];
    let analysis;
    try {
        analysis = await analyzer.findDependenciesInCode(code);
    } catch (error) {
        const warning = createWarning(WarningTypes.analysisFailed, codeType);
        result.warnings.push(warning);
        return result;
    }

    for (const entry of analysis) {
        let warningType;
        if (entry.type === 'require') {
            const resolved = entry.resolved;
            let name = resolved.name;
            let version = resolved.version;
            if (!version) {
                const match = nameVersionRegex.exec(entry.spec);
                if (match) {
                    name = match[1];
                    version = match[2];
                }
            }
            if (!version) {
                for (const declaredModule of declaredModules) {
                    if (declaredModule.name === name) {
                        version = declaredModule.version;
                        break;
                    }
                }
            }
            if (version) {
                if (version !== '<native>') {
                    result.dependencies.push({ name, version });
                }
            } else {
                warningType = WarningTypes.unknownVersion;
            }
        } else if (entry.type === 'require_dynamic') {
            warningType = WarningTypes.dynamicRequire;
        } else if (
            entry.resolved &&
            !entry.resolved.builtIn &&
            !entry.spec === 'RegExp'
        ) {
            warningType = WarningTypes.unknownGlobal;
        }

        if (warningType) {
            const warning = createWarning(
                warningType,
                codeType,
                entry,
                code,
                lines
            );
            result.warnings.push(warning);
        }
    }

    return result;
}

async function getDependencyAnalyzer(webtaskAnalyzer) {
    if (!webtaskAnalyzer._dependencyAnalyzer) {
        const tenantName = webtaskAnalyzer._tenantName;
        const tokenStore = webtaskAnalyzer._deployment.getTokenStore();

        const tokenInstance = tenantName
            ? await tokenStore.getTenantToken(tenantName)
            : await tokenStore.getMasterToken();
        const containerName = tenantName || 'auth0-wt-run-analysis';
        const clusterUrl = webtaskAnalyzer._deployment.getDeploymentUrl();
        const token = tokenInstance.getEncodedString();

        webtaskAnalyzer._dependencyAnalyzer = new Analyzer({
            clusterUrl,
            containerName,
            token,
        });
    }

    return webtaskAnalyzer._dependencyAnalyzer;
}

class WebtaskAnalyzer {
    constructor(deployment, tenantName) {
        Assert.ok(
            deployment instanceof Deployment,
            'deployment(Deployment) required'
        );
        if (tenantName) {
            Assert.ok(
                _.isString(tenantName),
                'tenantName(string) invalid type'
            );
        }

        this._deployment = deployment;
        this._tenantName = tenantName;
        this._dependencyAnalyzer = null;
    }

    async analyze(webtask) {
        Assert.ok(webtask instanceof Webtask, 'webtask(Webtask) required');

        const code = webtask.getCode();
        const declaredModules = webtask.getDependencies();
        const codeResults = analyzeCodeDependencies(
            this,
            code,
            declaredModules,
            'webtask'
        );

        return codeResults;
    }
}

module.exports = WebtaskAnalyzer;
