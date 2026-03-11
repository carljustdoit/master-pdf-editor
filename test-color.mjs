import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';

async function test() {
    const files = fs.readdirSync('./public');
    const pdfs = files.filter(f => f.endsWith('.pdf'));
    let pdfPath;
    if (pdfs.length > 0) {
        pdfPath = './public/' + pdfs[0];
    } else {
        console.log("No PDFs found in public/");
        return;
    }

    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const doc = await pdfjsLib.getDocument({ data, standardFontDataUrl: './node_modules/pdfjs-dist/standard_fonts/' }).promise;
    const page = await doc.getPage(1);

    const content = await page.getTextContent();
    console.log("TextContent Item 0:", content.items[0]);
    console.log("Style length:", Object.keys(content.styles).length);

    const opList = await page.getOperatorList();
    console.log("opList keys:", Object.keys(opList));
    console.log("fnArray length:", opList.fnArray.length);

    let lastFillColor = null;
    let textColors = [];

    // 59 is setFillRGBColor, 82 is showText, 83 is showSpacedText
    for (let i = 0; i < opList.fnArray.length; i++) {
        const fn = opList.fnArray[i];
        const args = opList.argsArray[i];
        if (fn === pdfjsLib.OPS.setFillRGBColor) {
            lastFillColor = args;
        } else if (fn === pdfjsLib.OPS.setFillColorN) {
            lastFillColor = args;
        } else if (fn === pdfjsLib.OPS.setFillGray) {
            lastFillColor = args;
        } else if (fn === pdfjsLib.OPS.showText || fn === pdfjsLib.OPS.showSpacedText) {
            if (textColors.length < 5) {
                textColors.push({ color: lastFillColor, stringMatches: !!args });
            }
        }
    }
    console.log("First 5 text colors from stream:", textColors);
}

test().catch(console.error);
