import {
    PDFDocument,
    rgb
} from 'pdf-lib';
import type { TextItem } from '../components/EditorLayer';

/**
 * Converts text to an image Data URL (PNG).
 */
const textToImage = (text: string, fontSize: number, fontFamily: string, color: number[], isBold: boolean, isItalic: boolean): string => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // Estimate width. Helvetica is wide. Times is narrow.
    // We'll assume a wide font for safety to avoid clipping.
    const width = Math.ceil(text.length * fontSize * 0.8) + 20;
    const height = Math.ceil(fontSize * 2);

    canvas.width = width;
    canvas.height = height;

    // Determine font string
    let fontStyle = 'normal';
    if (isItalic) fontStyle = 'italic';
    if (isBold) fontStyle = 'bold';
    
    const fontName = fontFamily || 'Helvetica';
    // Fallback: Try to use a system font that matches roughly
    // We use 72 DPI canvas, so fontSize in px ~= pt.
    ctx.font = `${fontStyle} ${fontSize}px "${fontName}", Helvetica, Arial, sans-serif`;
    
    // Color
    const r = color ? color[0] / 255 : 0;
    const g = color ? color[1] / 255 : 0;
    const b = color ? color[2] / 255 : 0;
    ctx.fillStyle = `rgb(${r*255}, ${g*255}, ${b*255})`;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Draw text
    // Center vertically roughly
    ctx.fillText(text, 10, fontSize + 5);

    return canvas.toDataURL('image/png');
};

export const exportModifiedPdf = async (
    originalFile: File,
    modifications: Record<string, string>,
    pagesTextItems: TextItem[][]
): Promise<Uint8Array> => {
    const arrayBuffer = await originalFile.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    
    const pageCount = pdfDoc.getPageCount();
    
    // Embed images
    const embeddedImages: Record<string, any> = {};

    for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
        const pageItems = pagesTextItems[pageIndex] ?? [];
        const page = pdfDoc.getPage(pageIndex);

        for (const item of pageItems) {
            const nextText = modifications[item.id];
            if (nextText === undefined || nextText === item.str) continue;

            // 1. Generate Image
            // Use the original text color
            const originalColor = item.color || [0, 0, 0];
            const dataUrl = textToImage(
                nextText, 
                item.pdfFontSize, // Use raw PDF font size
                item.fontFamily || 'Helvetica', 
                originalColor,
                item.isBold,
                item.isItalic
            );

            if (!dataUrl) continue;

            // 2. Embed Image (Cache by string content to save space)
            let image;
            if (embeddedImages[dataUrl]) {
                image = embeddedImages[dataUrl];
            } else {
                // Convert data URL to bytes
                const base64 = dataUrl.split(',')[1];
                const binaryString = atob(base64);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                
                image = await pdfDoc.embedPng(bytes);
                embeddedImages[dataUrl] = image;
            }

            // 3. Calculate dimensions
            // The image size matches the font size roughly, but we need to fit it in the original box
            // Original box width: item.pdfWidth
            // Original box height: item.pdfFontSize
            
            // We scale the image to fit the original text box
            const imgDims = image.scaleToFit(item.pdfWidth, item.pdfFontSize * 1.2);

            // 4. Draw Mask (White box to cover original text)
            // We use the raw PDF coordinates (transform[4] is x, transform[5] is y)
            // PDF coordinate system: (0,0) is bottom-left
            const x = item.transform[4];
            const y = item.transform[5] - (item.pdfFontSize * 0.2); // Adjust for baseline

            page.drawRectangle({
                x: x - 1,
                y: y - 1,
                width: item.pdfWidth + 2,
                height: (item.pdfFontSize * 1.2) + 2,
                color: rgb(1, 1, 1),
                opacity: 1,
            });

            // 5. Draw Image
            page.drawImage(image, {
                x: x,
                y: y,
                width: imgDims.width,
                height: imgDims.height,
            });
        }
    }

    return await pdfDoc.save();
};
