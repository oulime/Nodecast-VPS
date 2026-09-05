const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const searchRouter = require('../server/routes/search');

async function run() {
    const {
        normalizeCategories,
        normalizeAllowedItems,
        getCountrySearchScope,
        getCountryItemAssignment,
        resolveSearchCategory,
        searchSnapshot
    } = searchRouter._test;

    const wildcard = normalizeCategories([{
        sourceId: 7,
        categoryId: '*',
        packageId: '__velora_country_memberships__',
        priority: false
    }]);
    assert.equal(wildcard.length, 1);
    assert.equal(wildcard[0].categoryId, '*');
    assert.equal(wildcard[0].priority, false);

    const wildcardPackage = { packageId: 'custom-country-package', priority: false };
    const exactPackage = { packageId: 'provider-package', priority: true };
    const categoryMap = new Map([
        ['42', exactPackage],
        ['*', wildcardPackage]
    ]);
    const sourceAwareMovie = normalizeAllowedItems(['vod:7:501']);
    assert.equal(
        resolveSearchCategory({ stream_id: 501, category_id: '42' }, categoryMap, 7, 'movie', new Set()),
        exactPackage
    );
    assert.equal(
        resolveSearchCategory({ stream_id: 501, category_id: '99' }, categoryMap, 7, 'movie', sourceAwareMovie),
        wildcardPackage
    );
    assert.equal(
        resolveSearchCategory({ stream_id: 502, category_id: '99' }, categoryMap, 7, 'movie', sourceAwareMovie),
        null
    );

    const franceScope = getCountrySearchScope('country_france', 'movie');
    assert.ok(franceScope);
    assert.equal(franceScope.byRawItem.size, 0);
    assert.equal(getCountryItemAssignment(franceScope, 7, 'legacy-id-without-source'), null);

    const snapshotResult = await searchSnapshot(wildcard, 'movie', 'film', 10);
    assert.deepEqual(snapshotResult, { available: false, results: [] });

    const bundlePath = path.join(__dirname, '..', 'public', 'assets', 'main-JkackQV-custom-package-v7.js');
    const bundle = fs.readFileSync(bundlePath, 'utf8');
    assert.match(bundle, /categoryId:"\*",packageId:"__velora_country_memberships__"/);
    assert.match(bundle, /priority:!1/);
    assert.match(bundle, /JSON\.stringify\(\{query:e,type:type,countryId:r,limit:500\}\)/);
    assert.doesNotMatch(bundle, /countryId:r,categories:/);
    assert.doesNotMatch(bundle, /allowedItems:\[\.\.\.d\.keys\(\)\]/);
    assert.match(bundle, /Ze\(String\(l\.id\)\)\?Dh\(String\(l\.id\)\)/);
    assert.doesNotMatch(bundle, /source:"browser-memory-cache"/);
    assert.match(bundle, /source:"vps-search-cache"/);
    assert.match(bundle, /#vel-media-package-menu \[data-package-id\]/);

    console.log('Search regression tests passed.');
    process.exit(0);
}

run().catch(error => {
    console.error(error);
    process.exit(1);
});
