import assert from 'node:assert/strict';
import { config } from '../shared/config.js';
import { predictionCatalogRelease, rawPredictionCatalog } from '../worker/prediction-catalog.generated.js';

assert.equal(config.predictionsEnabled, false, 'Paused deployment requires predictionsEnabled === false. Use npm run deploy when enabled.');
assert.equal(predictionCatalogRelease.contractId, 'PROJECT_SIXTH_PREDICTION_OPS');
assert.ok(Array.isArray(rawPredictionCatalog), 'The retained prediction catalog must remain readable.');
console.log(`Paused deployment: predictions disabled; retaining ${rawPredictionCatalog.length} catalog records without importing new data.`);
