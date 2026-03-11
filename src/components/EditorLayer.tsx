import React, { useEffect, useMemo, useRef, useState } from 'react';
import './EditorLayer.css';

export interface TextItem {
    str: string;
    x: number;
    y: number;
    width: number;
    height: number;
    fontName: string;
    fontFamily: string;
    isBold: boolean;
    isItalic: boolean;
    fontSize: number;
    id: string;
    transform: number[]; // Raw PDF transform [a, b, c, d, e, f]
    color?: number[]; // RGB array [r, g, b]
    pdfWidth: number;
    pdfFontSize: number;
}

interface EditorLayerProps {
    items: TextItem[];
    modifications: Record<string, string>;
    onTextChange: (id: string, newText: string) => void;
    width: number;
    height: number;
    activeTool: string;
}

export const EditorLayer: React.FC<EditorLayerProps> = ({
    items,
    modifications,
    onTextChange,
    width,
    height,
    activeTool
}) => {
    const [activeItemId, setActiveItemId] = useState<string | null>(null);
    const [draftText, setDraftText] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    const activeItem = useMemo(
        () => items.find((item) => item.id === activeItemId) ?? null,
        [activeItemId, items]
    );

    useEffect(() => {
        if (!activeItem) return;
        requestAnimationFrame(() => {
            inputRef.current?.focus();
            inputRef.current?.select();
        });
    }, [activeItem]);

    const commitActiveEdit = () => {
        if (!activeItem) return;
        onTextChange(activeItem.id, draftText);
    };

    const selectItem = (id: string) => {
        if (activeItemId && activeItemId !== id) {
            commitActiveEdit();
        }
        const selected = items.find((item) => item.id === id);
        if (selected) {
            setDraftText(modifications[selected.id] ?? selected.str);
        }
        setActiveItemId(id);
    };

    const closeEditor = () => {
        commitActiveEdit();
        setActiveItemId(null);
    };

    if (activeTool !== 'text' && activeTool !== 'select') {
        return null;
    }

    const getFontFamily = (item: TextItem): string => {
        const combined = `${item.fontName} ${item.fontFamily}`.toLowerCase();

        if (combined.includes('courier') || combined.includes('mono')) {
            return '"Courier New", Courier, monospace';
        }
        if (/times|georgia|cambria|garamond|minion|palatino/i.test(combined) || (combined.includes('serif') && !combined.includes('sans'))) {
            return '"Times New Roman", Times, serif';
        }

        const family = item.fontFamily.trim();
        // If pdfjs extracted a real custom family name that isn't the generic fallback, use it
        if (family && family.toLowerCase() !== 'sans-serif' && family.toLowerCase() !== 'serif') {
            return family;
        }

        return 'Helvetica, Arial, sans-serif';
    };

    return (
        <svg
            className="editor-layer-svg"
            viewBox={`0 0 ${width} ${height}`}
            style={{ width, height }}
        >
            {items.map((item) => (
                <g
                    key={item.id}
                    className="text-item-group"
                    onClick={() => selectItem(item.id)}
                >
                    <rect
                        x={item.x - 2}
                        y={item.y - (item.fontSize * 0.8)}
                        width={Math.max(item.width + 4, 20)}
                        height={item.fontSize * 1.25}
                        className={`text-bounding-box ${activeItemId === item.id ? 'active' : ''}`}
                    />

                    {modifications[item.id] !== undefined && modifications[item.id] !== item.str && activeItemId !== item.id && (
                        <>
                            <rect
                                x={item.x - 2}
                                y={item.y - (item.fontSize * 0.8)}
                                width={Math.max(item.width + 4, 24)}
                                height={item.fontSize * 1.25}
                                className="text-overlay-bg"
                            />
                            <text
                                x={item.x}
                                y={item.y}
                                className="text-overlay-value"
                                style={{
                                    fontSize: `${item.fontSize}px`,
                                    fontFamily: getFontFamily(item),
                                    fontWeight: item.isBold ? 700 : 400,
                                    fontStyle: item.isItalic ? 'italic' : 'normal',
                                    fill: item.color ? `rgb(${item.color[0]}, ${item.color[1]}, ${item.color[2]})` : 'black'
                                }}
                            >
                                {modifications[item.id]}
                            </text>
                        </>
                    )}
                </g>
            ))}

            {activeItem && (
                <foreignObject
                    x={activeItem.x - 2}
                    y={activeItem.y - (activeItem.fontSize * 0.8)}
                    width={Math.max(activeItem.width + 4, 160)}
                    height={activeItem.fontSize * 1.5}
                >
                    <div className="editable-text-container active">
                        <input
                            ref={inputRef}
                            type="text"
                            value={draftText}
                            className="pdf-text-input"
                            style={{
                                fontSize: `${activeItem.fontSize}px`,
                                fontFamily: getFontFamily(activeItem),
                                fontWeight: activeItem.isBold ? 700 : 400,
                                fontStyle: activeItem.isItalic ? 'italic' : 'normal',
                                color: activeItem.color ? `rgb(${activeItem.color[0]}, ${activeItem.color[1]}, ${activeItem.color[2]})` : 'black',
                                width: '100%',
                                height: '100%'
                            }}
                            onChange={(e) => setDraftText(e.target.value)}
                            onBlur={closeEditor}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    closeEditor();
                                }
                                if (e.key === 'Escape') {
                                    setActiveItemId(null);
                                }
                            }}
                        />
                    </div>
                </foreignObject>
            )}
        </svg>
    );
};
