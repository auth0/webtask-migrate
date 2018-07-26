const _ = require('lodash');
const chalk = require('chalk');

module.exports = listAnalysis;

function listAnalysis(analysis) {

    console.log();

    if (analysis.dependencies.length) {

        console.log(chalk.cyan('Detected Dependencies'));
        for(const dependency of analysis.dependencies) {
            console.log(`${dependency.name}@${dependency.version}`);
        }
    } else {
        console.log(chalk.cyan('No Detected Dependencies'));
    }

    console.log();

    if (analysis.warnings.length) {

        console.log(chalk.cyan('Warnings'));
        for(const warning of analysis.warnings) {
            console.log(chalk.yellow(`[ ${warning.warningType} ]`), warning.message);
        }
    } else {
        console.log(chalk.cyan('No Warnings'));
    }

    console.log();
}
