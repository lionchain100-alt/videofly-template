import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const base='http://localhost:3001';
const request=(path,init={})=>fetch(base+path,{redirect:'manual',signal:AbortSignal.timeout(60000),...init});
for(const path of ['/zh','/zh/buy-credits','/zh/pricing']){const response=await request(path);assert.equal(response.status,200);assert((await response.text()).includes('Laconic'));}
const config=await (await request('/api/v1/payments')).json();assert.equal(config.data.providers.length,4);assert.equal(config.data.subscriptions.length,6);
for(const provider of ['stripe','creem'])assert.equal(config.data.providers.find(p=>p.id===provider).enabled,false);
for(const path of ['/ui-studio','/ui-preview'])assert.equal((await request(path)).status,404);
assert.equal((await request('/api/ui-studio/config')).status,403);
assert.equal((await request('/api/v1/subscriptions')).status,401);
for(const provider of ['stripe','creem']){const response=await request('/api/webhooks/'+provider,{method:'POST',body:'{}',headers:{'Content-Type':'application/json'}});assert.equal(response.status,503);}
const login=await request('/zh/login');assert.equal(login.status,200);assert(!(await login.text()).includes('local-password'));
const result={testedAt:new Date().toISOString(),productionPages:true,newProvidersStillDisabled:true,studioAndLocalPasswordClosed:true,unauthorizedSubscriptionsDenied:true,realProviderCalls:0};
await writeFile('docs/project-state/aud-004-production-results.json',JSON.stringify(result,null,2)+'\n');console.log('PASS production purchase/pricing/home pages, four-channel catalog, disabled new providers, private subscriptions and production Studio/password isolation.');
