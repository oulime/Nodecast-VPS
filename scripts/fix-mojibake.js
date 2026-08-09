const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

const targets = process.argv.slice(2);
if (!targets.length) {
    throw new Error('Pass at least one UTF-8 text file to repair.');
}

const suspiciousLead = /[ÃÂâðÅÆÐÑ]/;

function repairPass(text) {
    let output = '';
    let replacements = 0;
    for (let index = 0; index < text.length;) {
        let replacement = null;
        let consumed = 0;
        if (suspiciousLead.test(text[index])) {
            for (let length = Math.min(8, text.length - index); length >= 2; length -= 1) {
                const candidate = text.slice(index, index + length);
                const decoded = iconv.encode(candidate, 'win1252').toString('utf8');
                const decodedPoints = [...decoded];
                if (decoded !== candidate && !decoded.includes('\uFFFD') && decodedPoints.length === 1
                    && decodedPoints[0].codePointAt(0) >= 0x80) {
                    replacement = decoded;
                    consumed = length;
                    break;
                }
            }
        }
        if (replacement !== null) {
            output += replacement;
            index += consumed;
            replacements += 1;
        } else {
            output += text[index];
            index += 1;
        }
    }
    return { text: output, replacements };
}

for (const target of targets) {
    const resolved = path.resolve(target);
    let text = fs.readFileSync(resolved, 'utf8');
    let total = 0;
    for (let pass = 0; pass < 3; pass += 1) {
        const repaired = repairPass(text);
        text = repaired.text;
        total += repaired.replacements;
        if (!repaired.replacements) break;
    }
    fs.writeFileSync(resolved, text, 'utf8');
    console.log(`${target}: repaired ${total} sequence(s)`);
}
