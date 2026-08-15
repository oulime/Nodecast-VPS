const assert = require('assert/strict');
const express = require('express');
const veloraData = require('../server/routes/veloraData');
const { getDb } = require('../server/db/sqlite');

async function main() {
    getDb();
    const app = express();
    app.use('/api/velora-db', veloraData);
    const server = await new Promise(resolve => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    const base = `http://127.0.0.1:${server.address().port}/api/velora-db/rest/v1`;
    const testId = `test_${Date.now()}`;
    const testSourceId = 999999;
    const testStreamId = `${Date.now()}`;
    const testStreamId2 = `${Number(testStreamId) + 1}`;
    const testItemId = `${testSourceId}:movie:${testStreamId}`;
    const testItemId2 = `${testSourceId}:movie:${testStreamId2}`;
    const testLiveStreamId = `${Number(testStreamId) + 2}`;
    const testLiveStreamId2 = `${Number(testStreamId) + 3}`;
    const testLiveItemId = `${testSourceId}:live:${testLiveStreamId}`;
    const testLiveItemId2 = `${testSourceId}:live:${testLiveStreamId2}`;

    try {
        let response = await fetch(`${base.replace('/rest/v1', '')}/admin/stream-curation-map`);
        assert.equal(response.status, 200);
        const curationMap = await response.json();
        assert.ok(Array.isArray(curationMap.rows));
        assert.equal(response.headers.get('x-velora-country-package-cache'), 'vps-local-derived');

        response = await fetch(`${base.replace('/rest/v1', '')}/country-package-cache`);
        assert.equal(response.status, 200);
        let countryPackageCache = await response.json();
        assert.equal(countryPackageCache.version, 3);
        assert.ok(Array.isArray(countryPackageCache.packages));
        assert.ok(Array.isArray(countryPackageCache.memberships.rows));

        response = await fetch(`${base}/admin_countries?select=id,name&name=eq.France`);
        assert.equal(response.status, 200);
        let rows = await response.json();
        assert.equal(rows[0].name, 'France');

        response = await fetch(`${base}/admin_countries?select=id,name`);
        assert.equal(response.status, 200);
        rows = await response.json();
        assert.ok(rows.length >= 100, `expected complete country catalogue, received ${rows.length}`);

        response = await fetch(
            `${base}/canonical_countries?select=display_name&match_key=like.__visible__:*`
        );
        assert.equal(response.status, 200);
        rows = await response.json();
        assert.deepEqual(
            rows.map(row => row.display_name).sort(),
            ['Autres', 'France']
        );

        response = await fetch(`${base}/admin_countries?select=id`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Prefer: 'return=representation'
            },
            body: JSON.stringify({ id: testId, name: 'Test local' })
        });
        assert.equal(response.status, 201);
        rows = await response.json();
        assert.equal(rows[0].id, testId);

        response = await fetch(`${base.replace('/rest/v1', '')}/country-package-cache`);
        assert.equal(response.status, 200);
        countryPackageCache = await response.json();
        assert.ok(countryPackageCache.countries.some(row => row.id === testId));

        response = await fetch(`${base}/admin_countries?id=eq.${testId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                Prefer: 'return=representation'
            },
            body: JSON.stringify({ name: 'Test SQLite' })
        });
        assert.equal(response.status, 200);
        rows = await response.json();
        assert.equal(rows[0].name, 'Test SQLite');

        response = await fetch(`${base}/admin_countries?id=eq.${testId}`, {
            headers: { Accept: 'application/vnd.pgrst.object+json' }
        });
        assert.equal(response.status, 200);
        const single = await response.json();
        assert.equal(single.id, testId);

        response = await fetch(`${base}/admin_country_package_order?on_conflict=country_id,ui_tab`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Prefer: 'resolution=merge-duplicates,return=representation'
            },
            body: JSON.stringify({
                country_id: testId,
                ui_tab: 'live',
                package_order: ['one', 'two']
            })
        });
        assert.equal(response.status, 201);
        rows = await response.json();
        assert.deepEqual(rows[0].package_order, ['one', 'two']);

        response = await fetch(`${base}/admin_countries?id=eq.${testId}`, {
            method: 'DELETE'
        });
        assert.equal(response.status, 204);
        response = await fetch(`${base}/admin_country_package_order?country_id=eq.${testId}`, {
            method: 'DELETE'
        });
        assert.equal(response.status, 204);

        const sourcePackageId = `${testId}_source`;
        const targetPackageId = `${testId}_target`;
        const insertTestItem = getDb().prepare(`
            INSERT INTO playlist_items (
                id, source_id, item_id, type, name, category_id,
                stream_icon, provider_order, is_hidden
            ) VALUES (?, ?, ?, 'movie', ?, 'test_category', '', ?, 0)
        `);
        insertTestItem.run(testItemId, testSourceId, testStreamId, 'Test movie 1', 1);
        insertTestItem.run(testItemId2, testSourceId, testStreamId2, 'Test movie 2', 2);
        response = await fetch(`${base}/admin_packages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify([
                { id: sourcePackageId, country_id: testId, name: 'Source movies', source_id: testSourceId,
                    category_id: 'test_category', kind: 'vod', is_parent: false },
                { id: targetPackageId, country_id: testId, name: 'Target movies', kind: 'vod', is_parent: false }
            ])
        });
        assert.equal(response.status, 201);

        const mediaBase = base.replace('/rest/v1', '');
        response = await fetch(`${mediaBase}/admin/package-media-items?countryId=${testId}&packageId=${sourcePackageId}&kind=vod`);
        assert.equal(response.status, 200);
        let mediaPayload = await response.json();
        assert.equal(mediaPayload.items.length, 2);
        assert.equal(String(mediaPayload.items[0].stream_id), testStreamId);

        response = await fetch(`${mediaBase}/admin/memberships/bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                countryId: testId,
                targetPackageId,
                kind: 'vod',
                items: [testStreamId, testStreamId2].map(streamId => ({
                    sourceId: testSourceId,
                    streamId,
                    fromPackageId: sourcePackageId
                }))
            })
        });
        assert.equal(response.status, 200);
        const bulkPayload = await response.json();
        assert.equal(bulkPayload.count, 2);

        response = await fetch(`${mediaBase}/admin/package-media-items?countryId=${testId}&packageId=${sourcePackageId}&kind=vod`);
        mediaPayload = await response.json();
        assert.equal(mediaPayload.items.length, 0);
        response = await fetch(`${mediaBase}/admin/package-media-items?countryId=${testId}&packageId=${targetPackageId}&kind=vod`);
        mediaPayload = await response.json();
        assert.equal(mediaPayload.items.length, 2);
        assert.ok(mediaPayload.items.every(item => item.origin_package_id === sourcePackageId));

        response = await fetch(`${mediaBase}/admin/media-membership`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                countryId: testId,
                sourceId: testSourceId,
                streamId: testStreamId,
                fromPackageId: targetPackageId,
                targetPackageId: sourcePackageId,
                kind: 'vod'
            })
        });
        assert.equal(response.status, 200);
        response = await fetch(`${mediaBase}/admin/package-media-items?countryId=${testId}&packageId=${sourcePackageId}&kind=vod`);
        mediaPayload = await response.json();
        assert.equal(mediaPayload.items.length, 1);

        const sourceLivePackageId = `${testId}_live_source`;
        const targetLivePackageId = `${testId}_live_target`;
        const insertLiveItem = getDb().prepare(`
            INSERT INTO playlist_items (
                id, source_id, item_id, type, name, category_id,
                stream_icon, provider_order, is_hidden
            ) VALUES (?, ?, ?, 'live', ?, 'test_live_category', '', ?, 0)
        `);
        insertLiveItem.run(testLiveItemId, testSourceId, testLiveStreamId, 'Test channel 1', 1);
        insertLiveItem.run(testLiveItemId2, testSourceId, testLiveStreamId2, 'Test channel 2', 2);
        response = await fetch(`${base}/admin_packages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify([
                { id: sourceLivePackageId, country_id: testId, name: 'Source live', source_id: testSourceId,
                    category_id: 'test_live_category', kind: 'live', is_parent: false },
                { id: targetLivePackageId, country_id: testId, name: 'Target live', kind: 'live', is_parent: false }
            ])
        });
        assert.equal(response.status, 201);

        response = await fetch(`${mediaBase}/admin/memberships/bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                countryId: testId,
                targetPackageId: targetLivePackageId,
                kind: 'live',
                items: [testLiveStreamId, testLiveStreamId2].map(streamId => ({
                    sourceId: testSourceId,
                    streamId,
                    fromPackageId: sourceLivePackageId
                }))
            })
        });
        assert.equal(response.status, 200);
        const liveBulkPayload = await response.json();
        assert.equal(liveBulkPayload.count, 2);

        response = await fetch(`${mediaBase}/admin/package-live-channels?countryId=${testId}&packageId=${targetLivePackageId}`);
        assert.equal(response.status, 200);
        const livePayload = await response.json();
        assert.equal(livePayload.channels.length, 2);
        assert.ok(livePayload.channels.every(channel => channel.origin_package_id === sourceLivePackageId));

        response = await fetch(`${base.replace('/rest/v1', '')}/country-package-cache`);
        assert.equal(response.status, 200);
        countryPackageCache = await response.json();
        assert.ok(!countryPackageCache.countries.some(row => row.id === testId));

        console.log('Velora local SQLite data API tests passed');
    } finally {
        getDb().prepare(
            `DELETE FROM velora_admin_rows WHERE json_extract(data, '$.id') = ? OR json_extract(data, '$.country_id') = ?`
        ).run(testId, testId);
        getDb().prepare(`DELETE FROM playlist_items WHERE id IN (?, ?, ?, ?)`)
            .run(testItemId, testItemId2, testLiveItemId, testLiveItemId2);
        veloraData.invalidateCountryPackageCache();
        await new Promise(resolve => server.close(resolve));
    }
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
