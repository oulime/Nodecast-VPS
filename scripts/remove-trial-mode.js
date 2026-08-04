const fs = require('fs');
const path = require('path');

const bundlePath = path.join(__dirname, '..', 'public', 'assets', 'main-JkackQV-.js');
let source = fs.readFileSync(bundlePath, 'utf8');

function replaceFunction(startMarker, endMarker, replacement) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start);
    if (start < 0 || end < 0) throw new Error(`Could not locate ${startMarker}`);
    source = source.slice(0, start) + replacement + source.slice(end);
}

const accessPayload = '{allowed:!0,whitelisted:!0,secondsUsed:0,secondsRemaining:86400,limitSeconds:86400,checkoutUrl:""}';
replaceFunction('async function _d()', 'async function AB()', `async function _d(){return{ok:!0,payload:${accessPayload}}}`);
replaceFunction('async function AB()', 'function LB()', `async function AB(){return{ok:!0,payload:${accessPayload}}}`);
replaceFunction('function LB()', 'function ST()', 'function LB(){return!1}');

fs.writeFileSync(bundlePath, source);
console.log('Removed trial enforcement from', bundlePath);
