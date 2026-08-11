const fs = require('fs');
const path = require('path');

const bundlePath = path.join(__dirname, '..', 'public', 'assets', 'main-JkackQV-custom-package-v7.js');
let source = fs.readFileSync(bundlePath, 'utf8');
let changed = false;

function replaceAllRequired(search, replacement, label) {
    const count = source.split(search).length - 1;
    if (count < 1) throw new Error(`Missing bundle anchor: ${label}`);
    source = source.split(search).join(replacement);
    changed = true;
    return count;
}

const mediaHelpers = 'function __velMediaCategoryId(s,e){if(!Ze(s))return s;const t=String((e==null?void 0:e.source_id)??""),r=String((e==null?void 0:e.category_id)??"");if(t&&r){const n=G==="movies"?_.vodCategories:_.seriesCategories,i=n.find(a=>{const o=String(a.nodecast_source_id??a.source_id??""),l=String(a.raw_category_id??mp(String(a.category_id??""),o).categoryId??"");return o===t&&l===r});return String((i==null?void 0:i.category_id)??N_(t,r))}const n=Jn((e==null?void 0:e.original_name)??(e==null?void 0:e.name)??"");return wc().packages.find(i=>Jn(i.name)===n)?.id??s}function __velExactMediaPackageStreams(s){const e=es.find(v=>String(v.id)===String(s));if(!e||!_||(G!=="movies"&&G!=="series"))return null;const t=G==="movies"?_.vodStreamsByCat:_.seriesStreamsByCat,r=[],n=v=>{const p=String(v??"");p&&!r.includes(p)&&r.push(p)},i=String(e.source_id??""),a=String(e.category_id??"");n(__velMediaCategoryId(s,e)),n(a);if(i&&a)n(N_(i,a));const o=Jn(e.original_name??e.name),l=wc().packages.find(v=>Jn(v.name)===o);l&&n(l.id);for(const v of r){const p=t.get(v);if(p!=null&&p.length)return[...p]}return null}';

if (!source.includes('function __velMediaCategoryId(')) {
    const anchor = 'function Dh(s){if(!_)return[];';
    if (!source.includes(anchor)) throw new Error('Missing bundle anchor: media helpers');
    source = source.replace(anchor, `${mediaHelpers}${anchor}`);
    changed = true;
}

const sourceAwareCategory = '__velMediaCategoryId(s,t)';
const nameBasedCategories = [
    'Ze(s)?(wc().packages.find(c=>Jn(c.name)===Jn(t.name))?.id??s):s',
    'Ze(s)?(wc().packages.find(u=>Jn(u.name)===Jn(t.name))?.id??s):s'
];
for (const nameBasedCategory of nameBasedCategories) {
    if (source.includes(nameBasedCategory)) {
        replaceAllRequired(nameBasedCategory, sourceAwareCategory, 'media category resolution');
    }
}
if (!source.includes(sourceAwareCategory)) {
    throw new Error('Missing installed media category resolution.');
}

const strictCurationReturn = '(e.has(o)||e.has(l))&&!n.has(o)&&(n.add(o),r.push(a))}return r}';
const sourceAwareReturn = '(e.has(o)||e.has(l))&&!n.has(o)&&(n.add(o),r.push(a))}if(r.length)return r;const i=__velExactMediaPackageStreams(s);return i??r}';
if (source.includes(strictCurationReturn)) {
    replaceAllRequired(strictCurationReturn, sourceAwareReturn, 'source-aware media fallback');
} else if (!source.includes(sourceAwareReturn)) {
    throw new Error('Missing installed source-aware media fallback.');
}

if (changed) {
    fs.writeFileSync(bundlePath, source);
    process.stdout.write('Installed source-aware movie and series package loading.\n');
} else {
    process.stdout.write('Source-aware movie and series package loading is already installed.\n');
}
