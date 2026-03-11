const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const fs = require('fs');

async function test() {
    console.log(pdfjsLib.OPS);
}

test().catch(console.error);
