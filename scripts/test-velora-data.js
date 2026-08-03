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

    try {
        let response = await fetch(`${base.replace('/rest/v1', '')}/admin/stream-curation-map`);
        assert.equal(response.status, 200);
        const curationMap = await response.json();
        assert.ok(Array.isArray(curationMap.rows));

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

        console.log('Velora local SQLite data API tests passed');
    } finally {
        getDb().prepare(
            `DELETE FROM velora_admin_rows WHERE json_extract(data, '$.id') = ? OR json_extract(data, '$.country_id') = ?`
        ).run(testId, testId);
        await new Promise(resolve => server.close(resolve));
    }
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
