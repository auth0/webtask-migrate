const yargs = require('yargs');

yargs
    .commandDir('./cmds')
    .showHelpOnFail(true)
    .demandCommand()
    .wrap(yargs.terminalWidth())
    .help()
    .argv;
