export const extractBackgroundColor = async (
    pdfDocProxy: any,
    pageIndex: number,
    x: number,
    y: number,
    height: number
): Promise<number[]> => {
    try {
        const page = await pdfDocProxy.getPage(pageIndex + 1); // pdfjs is 1-indexed
        const viewport = page.getViewport({ scale: 1.0 });

        // Create a temporary canvas
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        if (!context) return [255, 255, 255]; // Default white

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({
            canvasContext: context,
            viewport: viewport,
        }).promise;

        // Map PDF coordinates to Canvas coordinates
        // PDF coordinates: (0,0) is usually bottom-left
        // Canvas coordinates: (0,0) is top-left
        
        // Get transform to convert PDF coords to Canvas coords
        // We need to account for the viewport transform
        // However, simpler approach: use the viewport.convertToViewportPoint
        
        // Let's calculate the center of the text item in PDF coords
        // Text Y in PDF is baseline. We want a bit above it.
        const pdfX = x;
        const pdfY = y + (height * 0.5); // Sample middle of text height

        const [canvasX, canvasY] = viewport.convertToViewportPoint(pdfX, pdfY);

        // Safety check bounds
        const safeX = Math.max(0, Math.min(canvas.width - 1, Math.floor(canvasX)));
        const safeY = Math.max(0, Math.min(canvas.height - 1, Math.floor(canvasY)));

        const pixel = context.getImageData(safeX, safeY, 1, 1).data;
        
        return [pixel[0], pixel[1], pixel[2]];
    } catch (error) {
        console.error("Failed to extract background color:", error);
        return [255, 255, 255]; // Fallback to white
    }
};
