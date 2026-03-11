import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { RenderParameters } from 'pdfjs-dist/types/src/display/api';
import { EditorLayer } from './EditorLayer';
import type { TextItem } from './EditorLayer';
import './PDFViewer.css';

// Use a bundled local worker URL that matches pdfjs-dist v5 (.mjs worker).
pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

const mergeTextItems = (items: TextItem[]): TextItem[] => {
    if (items.length === 0) return [];

    // Pre-pass: Remove duplicate text items (fake bold/shadow effects drawn multiple times slightly offset)
    const uniqueItems: TextItem[] = [];
    for (const item of items) {
        const isDuplicate = uniqueItems.some(u =>
            u.str === item.str &&
            Math.abs(u.x - item.x) < item.fontSize * 0.2 &&
            Math.abs(u.y - item.y) < item.fontSize * 0.2
        );
        if (!isDuplicate) {
            uniqueItems.push(item);
        }
    }

    // Sort items top-to-bottom (remember Y is from bottom in PDF), then left-to-right.
    // We use a larger fuzz factor (e.g., half the average font size) to group lines.
    const sorted = [...uniqueItems].sort((a, b) => {
        // PDFJS text extraction Y coordinates can fluctuate slightly.
        const yTolerance = Math.max(a.fontSize, b.fontSize) * 0.4;
        if (Math.abs(b.y - a.y) > yTolerance) {
            return b.y - a.y; // Sort descending because higher Y is "higher" on the page in math terms
        }
        return a.x - b.x;
    });

    const merged: TextItem[] = [];
    let current = { ...sorted[0] };

    for (let i = 1; i < sorted.length; i++) {
        const item = sorted[i];

        // Loosen font requirements. Often, PDFs break text into separate spans even with the exact same visual font.
        // We mainly care if they are on the same line and close to each other horizontally.
        const yTolerance = Math.max(current.fontSize, item.fontSize) * 0.4;
        const sameLine = Math.abs(current.y - item.y) < yTolerance;

        // Ensure we don't merge texts with different styles (e.g. regular and bold)
        // Also ensure we don't merge if colors are different (to preserve DNA)
        const sameFont = current.fontName === item.fontName &&
            current.isBold === item.isBold &&
            current.isItalic === item.isItalic &&
            Math.abs(current.fontSize - item.fontSize) < 2;
            
        const sameColor = !current.color || !item.color || 
            (current.color.length === item.color?.length && current.color.every((c, i) => c === item.color?.[i]));

        // Gap calculations
        const endOfCurrent = current.x + current.width;
        const gap = item.x - endOfCurrent;

        // Check for exact overlap (fake bold effect in PDFs drawn twice)
        // If the new item is placed almost exactly where the current item is, and has the exact same text.
        const isOverlap = gap <= -current.width * 0.8 && current.str === item.str;
        if (sameLine && isOverlap) {
            // Ignore this item, it's a duplicate layer
            continue;
        }

        // Allow merging if they are touching (gap is very small or negative) REGARDLESS of minor font style differences,
        // because it's a single word violently split by the PDF generator. We restrict negative gap to avoid treating overlaps as touching.
        const isTouching = gap > -current.width * 0.5 && gap <= current.fontSize * 0.1;

        // Otherwise, allow merging if gap is moderately sized (implies a space), BUT only if they share the same font style AND color.
        // We use a tight gap threshold (1.5x font size) to prevent merging columns or table cells.
        if (sameLine && sameFont && sameColor && (isTouching || (gap > -current.fontSize && gap < current.fontSize * 1.5))) {
            // Determine if we need to insert a space.
            const hasSpaceStr = current.str.endsWith(' ') || item.str.startsWith(' ');
            // If there's no explicit space character, but the gap is larger than ~20% of a font size, infer a space.
            const needsSpace = !hasSpaceStr && gap > (current.fontSize * 0.25);
            const spaceStr = needsSpace ? ' ' : '';

            // Update bounding box to encompass both.
            current.str = current.str + spaceStr + item.str;
            current.width = (item.x + item.width) - current.x;

            // Calculate raw PDF width using the original unscaled transform X (index 4)
            current.pdfWidth = (item.transform[4] + item.pdfWidth) - current.transform[4];

            // Adjust bounds (expand to fit the largest fragment)
            current.y = Math.min(current.y, item.y);
            current.height = Math.max(current.height, item.height);
            // We keep current's fontSize and fontName as the "primary" for this block.
        } else {
            merged.push(current);
            current = { ...item };
        }
    }
    merged.push(current);

    return merged;
};

interface PDFViewerProps {
    file: File | null;
    activeTool: string;
    modifications: Record<string, string>;
    onTextChange: (id: string, newText: string) => void;
    onTextLayoutAnalyzed: (pages: TextItem[][]) => void;
}

export const PDFViewer: React.FC<PDFViewerProps> = ({
    file,
    activeTool,
    modifications,
    onTextChange,
    onTextLayoutAnalyzed
}) => {
    const [numPages, setNumPages] = useState<number>(0);
    const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
    const [pagesTextItems, setPagesTextItems] = useState<TextItem[][]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        if (!file) return;

        let isCancelled = false;

        const loadPdf = async () => {
            setLoadError(null);
            try {
                const arrayBuffer = await file.arrayBuffer();
                const loadingTask = pdfjsLib.getDocument(arrayBuffer);
                const pdfDoc = await loadingTask.promise;
                if (isCancelled) return;
                setPdf(pdfDoc);
                setNumPages(pdfDoc.numPages);

                const allPagesText: TextItem[][] = [];
                for (let i = 1; i <= pdfDoc.numPages; i++) {
                    const page = await pdfDoc.getPage(i);
                    const textContent = await page.getTextContent();
                    const viewport = page.getViewport({ scale: 1.5 });

                    let items: TextItem[] = textContent.items.flatMap((item, index) => {
                        if (!('str' in item)) {
                            return [];
                        }

                        const transform = pdfjsLib.Util.transform(
                            viewport.transform,
                            item.transform
                        );
                        const style = textContent.styles[item.fontName];
                        const fontNameLower = (item.fontName || '').toLowerCase();
                        const fontFamilyLower = (style?.fontFamily || '').toLowerCase();

                        // Strict check for bold indicators in the font metadata
                        const isBold = /(?:bold|black|heavy|demi|semibold)/i.test(fontNameLower) ||
                            /(?:bold|black|heavy|demi|semibold)/i.test(fontFamilyLower);

                        const isItalic = /(?:italic|oblique)/i.test(fontNameLower) ||
                            /(?:italic|oblique)/i.test(fontFamilyLower);

                        // pdfjs-dist TextItem has a 'color' property (Uint8ClampedArray [r, g, b])
                        const colorMap = (item as any).color;
                        if (index === 0) {
                            console.log("DEBUG FIRST ITEM:", Object.keys(item), (item as any).color, (item as any).fillColor);
                        }

                        return [{
                            id: `${i}-${index}`,
                            str: item.str,
                            x: transform[4],
                            y: transform[5],
                            width: item.width * viewport.scale,
                            height: item.height * viewport.scale,
                            fontName: item.fontName,
                            fontFamily: style?.fontFamily ?? '',
                            isBold,
                            isItalic,
                            fontSize: Math.sqrt(item.transform[0] ** 2 + item.transform[1] ** 2) * viewport.scale,
                            transform: item.transform,
                            color: colorMap ? Array.from(colorMap) as number[] : undefined,
                            pdfWidth: item.width,
                            pdfFontSize: Math.sqrt(item.transform[0] ** 2 + item.transform[1] ** 2)
                        }];
                    });
                    items = mergeTextItems(items);
                    allPagesText.push(items);
                }

                if (isCancelled) return;
                setPagesTextItems(allPagesText);
                onTextLayoutAnalyzed(allPagesText);
            } catch (error) {
                console.error('Failed to load PDF:', error);
                if (isCancelled) return;
                setPdf(null);
                setNumPages(0);
                setPagesTextItems([]);
                onTextLayoutAnalyzed([]);
                setLoadError('Failed to load this PDF. Please try another file.');
            }
        };

        loadPdf();
        return () => {
            isCancelled = true;
        };
    }, [file, onTextLayoutAnalyzed]);

    return (
        <div className="pdf-viewer-container">
            {loadError && <p>{loadError}</p>}
            {Array.from({ length: numPages }, (_, i) => (
                <Page
                    key={i + 1}
                    pdf={pdf}
                    pageNum={i + 1}
                    items={pagesTextItems[i] || []}
                    modifications={modifications}
                    onTextChange={onTextChange}
                    activeTool={activeTool}
                />
            ))}
        </div>
    );
};

interface PageProps {
    pdf: pdfjsLib.PDFDocumentProxy | null;
    pageNum: number;
    items: TextItem[];
    modifications: Record<string, string>;
    onTextChange: (id: string, newText: string) => void;
    activeTool: string;
}

const Page: React.FC<PageProps> = ({ pdf, pageNum, items, modifications, onTextChange, activeTool }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [viewport, setViewport] = useState<pdfjsLib.PageViewport | null>(null);

    useEffect(() => {
        if (!pdf || !canvasRef.current) return;

        const renderPage = async () => {
            const page = await pdf.getPage(pageNum);
            const vp = page.getViewport({ scale: 1.5 });
            setViewport(vp);

            const canvas = canvasRef.current!;
            const context = canvas.getContext('2d')!;

            // Handle High-DPI/Retina displays for sharp rendering
            const pixelRatio = window.devicePixelRatio || 1;
            canvas.width = vp.width * pixelRatio;
            canvas.height = vp.height * pixelRatio;

            // Set pure CSS dimensions to match the logical viewport size
            canvas.style.width = `${vp.width}px`;
            canvas.style.height = `${vp.height}px`;

            const renderContext: RenderParameters = {
                canvas,
                canvasContext: context,
                viewport: vp,
                transform: [pixelRatio, 0, 0, pixelRatio, 0, 0], // Scale up the rendering
            };

            await page.render(renderContext).promise;
        };

        renderPage();
    }, [pdf, pageNum]);

    return (
        <div id={`pdf-page-${pageNum}`} className="pdf-page-wrapper glass-panel">
            <canvas ref={canvasRef} />
            {viewport && (
                <EditorLayer
                    items={items}
                    modifications={modifications}
                    onTextChange={onTextChange}
                    width={viewport.width}
                    height={viewport.height}
                    activeTool={activeTool}
                />
            )}
        </div>
    );
};
