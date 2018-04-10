# Migrate Webtasks between deployments

## Usage

```js
const { Token, TokenStore, Deployment, WebtaskAnalyzer } = require('webtask-migrate');

// inputs
const tenantTokenString = process.env.TENANT_TOKEN;
const fromDeploymentUrl = process.env.FROM_DEPLOYMENT_URL;
const toDeploymentUrl = process.env.TO_DEPLOYMENT_URL;
const tenantName = process.env.TENANT_NAME;
const webtaskName = process.env.WEBTASK_NAME;

// Setup
const tokenStore = new TokenStore();
tokenStore.addToken(new Token(tenantTokenString));

const fromDeployment = new Deployment(tokenStore, fromDeploymentUrl);
const toDeployment = new Deployment(tokenStore, toDeploymentUrl);

const webtaskAnalyzer = new WebtaskAnalyzer(fromDeployment, tenantName);

// Download the webtask
const downloadOptions = {
  includeCron: true,
  includeStorage: true,
  includeSecrets: true
};
const webtask = await fromDeployment.downloadWebtask(tenantName, webtaskName, downloadOptions);

// Run analysis on the webtask
const analysis = await webtaskAnalyzer.analyze(webtask);

// Update the webtask with any missing dependencies
webtask.addDependencies(analysis.dependencies);

// Ensure that all module dependencies are provisioned on the new deployment
await toDeployment.provisionModules(webtask.getDependencies(), tenantName);

// Upload the webtask to the new deployment
await toDeployment.uploadWebtask(tenantName, webtaskName, webtask);
 
// Write out an warnings detected during the analysis
console.log(analysis.warnings)
```

See the samples folder for examples that provide batch processing of webtasks migration

