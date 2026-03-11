/**
 * Font Manager
 * Handles Tier 1 & Tier 2 Font Reconstruction
 */

// Define the experimental LocalFontAccess API types for TypeScript
interface FontData {
    family: string;
    fullName: string;
    postscriptName: string;
    style: string;
    blob(): Promise<Blob>;
}

declare global {
    interface Window {
        queryLocalFonts?(options?: { postscriptNames?: string[] }): Promise<FontData[]>;
    }
}

/**
 * Searches the user's local system for a specific font.
 * Requires the Local Font Access API (Chrome/Edge).
 * Prompts the user for permission on first use.
 */
export const fetchLocalFont = async (fontFamily: string, isBold: boolean, isItalic: boolean): Promise<ArrayBuffer | null> => {
    if (!('queryLocalFonts' in window) || !window.queryLocalFonts) {
        console.warn("Local Font Access API is not supported in this browser.");
        return null; // Fallback to Tier 3 (Generic Standard Fonts)
    }

    try {
        console.log(`[FontManager] Querying local system for: ${fontFamily} (Bold: ${isBold}, Italic: ${isItalic})`);

        // This triggers a permission prompt if not yet granted
        const localFonts = await window.queryLocalFonts();

        const normalize = (name: string) => name.toLowerCase().replace(/[- _]/g, '');
        const normalizedTarget = normalize(fontFamily);

        // 1. Try to find an exact style match ignoring spaces, hyphens, and PSMT suffixes
        const matchingFonts = localFonts.filter(font => {
            const normFamily = normalize(font.family);
            const normFull = normalize(font.fullName);
            return normFamily.includes(normalizedTarget) ||
                normFull.includes(normalizedTarget) ||
                (normFamily.length > 4 && normalizedTarget.includes(normFamily));
        });

        if (matchingFonts.length === 0) {
            console.log(`[FontManager] No local font found matching family: ${fontFamily}`);
            return null;
        }

        let bestMatch = matchingFonts[0]; // Default to first match

        // 2. Refine by weight and style if we have multiple variants
        if (matchingFonts.length > 1) {
            const styleTarget: string[] = [];
            if (isBold) styleTarget.push('bold', 'black', 'heavy', 'demi', 'semibold');
            if (isItalic) styleTarget.push('italic', 'oblique');

            if (styleTarget.length > 0) {
                const styledFont = matchingFonts.find(f => {
                    const styleLower = f.style.toLowerCase();
                    return styleTarget.some(keyword => styleLower.includes(keyword));
                });
                if (styledFont) {
                    bestMatch = styledFont;
                } else if (!isBold && !isItalic) {
                    // Try to find the 'Regular' weight if available
                    const regular = matchingFonts.find(f => f.style.toLowerCase() === 'regular' || f.style.toLowerCase() === 'normal');
                    if (regular) bestMatch = regular;
                }
            } else {
                // Looking for regular
                const regular = matchingFonts.find(f => f.style.toLowerCase() === 'regular' || f.style.toLowerCase() === 'normal');
                if (regular) bestMatch = regular;
            }
        }

        console.log(`[FontManager] Selected best local match: ${bestMatch.fullName} (${bestMatch.style})`);

        // 3. Extract the underlying TTF/OTF binary data
        const blob = await bestMatch.blob();
        return await blob.arrayBuffer();

    } catch (err) {
        if (err instanceof DOMException && err.name === 'NotAllowedError') {
            console.log("[FontManager] User denied local font access permission.");
        } else {
            console.error("[FontManager] Error querying local fonts:", err);
        }
        return null;
    }
};

/**
 * Standard Server-side Fallback Map (Tier 1 Mock)
 * Eventually this would call 'fetch(/fonts/myfont.ttf)'
 * 
 * This serves as the "Cloud Vault" mock.
 */
export const fetchRemoteFallbackFont = async (baseFontName: string): Promise<ArrayBuffer | null> => {
    // In a full production app, you would host professional fonts in an S3 bucket 
    // and maintain a dictionary mapping PDF names to URLs here.
    
    const cloudVault: Record<string, string> = {
        'helvetica': 'https://raw.githubusercontent.com/google/fonts/main/ofl/roboto/Roboto-Regular.ttf',
        'arial': 'https://raw.githubusercontent.com/google/fonts/main/ofl/roboto/Roboto-Regular.ttf', // Using Roboto as generic fallback for Arial
        'times': 'https://raw.githubusercontent.com/google/fonts/main/ofl/roboto/Roboto-Regular.ttf', // Roboto Serif or similar
        'courier': 'https://raw.githubusercontent.com/google/fonts/main/ofl/roboto/Roboto-Regular.ttf',
        'georgia': 'https://raw.githubusercontent.com/google/fonts/main/ofl/roboto/Roboto-Regular.ttf',
    };

    const key = Object.keys(cloudVault).find(k => baseFontName.toLowerCase().includes(k));
    
    if (key) {
        console.log(`[FontManager] Cloud Vault: Fetching fallback for ${baseFontName} from ${cloudVault[key]}`);
        try {
            const response = await fetch(cloudVault[key]);
            if (response.ok) {
                return await response.arrayBuffer();
            }
        } catch (e) {
            console.error("[FontManager] Cloud Vault fetch failed:", e);
        }
    }

    console.log(`[FontManager] Cloud Vault: No match found for ${baseFontName}`);
    return null;
};
