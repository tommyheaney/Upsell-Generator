import { GoogleGenAI, Type } from '@google/genai';
import { ProductData, RecommendationResult } from '../types';

if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const BATCH_SIZE = 5; // Process 5 products per API call
const CONCURRENT_BATCHES = 4; // Run up to 4 API calls in parallel

const recommendationSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      'VS Child ID': {
        type: Type.STRING,
        description: 'The VS Child ID of the original product.',
      },
      'Upselling 1 (Customers Also Bought)': {
        type: Type.ARRAY,
        description: 'An array of exactly 8 "VS Parent ID"s for complimentary products.',
        items: { type: Type.STRING },
      },
      'Upselling 2 (You May Also Like)': {
        type: Type.ARRAY,
        description: 'An array of exactly 8 "VS Parent ID"s for recommended "you may also like" products.',
        items: { type: Type.STRING },
      },
    },
    required: ['VS Child ID', 'Upselling 1 (Customers Also Bought)', 'Upselling 2 (You May Also Like)'],
  },
};

const processBatch = async (batch: ProductData[], fullCatalogSummary: string): Promise<RecommendationResult[]> => {
    const model = 'gemini-2.5-flash';
    
    const productsToProcess = batch.map(p => ({
        vsParentId: p['VS Parent ID'],
        vsChildId: p['VS Child ID'],
        title: p['Parent Product Title'],
        category: p['Categories'],
    }));

    const prompt = `
        You are a world-class bathroom product merchandiser with an exceptional eye for detail. Your task is to generate two sets of product recommendations for a batch of bathroom products, following a strict set of rules.

        **CRITICAL INSTRUCTION: You MUST only use "VS Parent ID"s that are explicitly listed in the "Full Product Catalog Summary" provided. Do not invent, guess, or hallucinate any IDs. Using an ID not found in the summary is a critical failure.**

        ---

        **Detailed Merchandising Logic:**

        Your recommendations must be logical, customer-friendly, and create a cohesive bathroom design.

        1.  **Match Finishes & Colors:** This is your top priority. If a product is "Brushed Gold", ALL recommendations (taps, wastes, showers, mirrors) must also be "Brushed Gold" if available. The same applies to "Matt Black", "Chrome", "Polished White", etc.
        2.  **Match Product Ranges:** Where possible, group items from the same product range (e.g., recommend "Faro" accessories for a "Faro" tap).
        3.  **Logical Sizing:** For basins, recommend mirrors or vanity units of a similar or compatible width. Avoid recommending huge items for small items.
        4.  **Specific Product Type Rules:**
            *   **For any Basin:** Always recommend a compatible tap and a waste. If it's a countertop basin, suggest a tall monobloc tap or a wall-mounted tap. Check the title for "no overflow" and suggest an "unslotted" waste; otherwise, suggest a "slotted" waste.
            *   **For any Freestanding Bath:** ALWAYS recommend a freestanding (floor-standing) tap. You can also include a wall-mounted bath filler as a secondary option.
            *   **For any Toilet:** Recommend a matching toilet seat if the title doesn't state it's included.
            *   **For any Shower Enclosure:** Recommend a compatible shower tray and a shower waste.
            *   **For any Shelf (especially countertop shelves):** Recommend a compatible Countertop Basin, a Tall Monobloc Tap or a Wall-Mounted Tap, a matching color Unslotted Basin Waste, a Wall-Hung Toilet, and a matching color Flush Plate.

        ---

        **Recommendation Categories:**

        -   **"Upselling 1 (Customers Also Bought)":** These are ESSENTIAL, complimentary items needed for the product to function. Example: A basin needs a tap and waste. A toilet needs a seat.
        -   **"Upselling 2 (You May Also Like)":** These are STYLISTIC, "complete the look" items that match the original product's style and finish. Example: For a "Matt Black" basin tap, suggest a matching "Matt Black" mirror, towel rail, and vanity unit.

        ---

        Here is the Full Product Catalog Summary (format: VS Parent ID: Parent Product Title) for you to select recommendation IDs from:
        ---
        ${fullCatalogSummary}
        ---

        Now, using ONLY IDs from the summary above and applying the detailed logic, generate recommendations for the following batch of products. Ensure each recommendation list has exactly 8 "VS Parent ID"s.

        Product Batch to Process:
        ${JSON.stringify(productsToProcess, null, 2)}
    `;

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: recommendationSchema,
                temperature: 0.5,
            },
        });

        const jsonText = response.text;
        const parsedResult = JSON.parse(jsonText);
        
        return parsedResult.map((item: any) => ({
            vsChildId: String(item['VS Child ID']),
            upselling1: item['Upselling 1 (Customers Also Bought)'],
            upselling2: item['Upselling 2 (You May Also Like)'],
        }));
    } catch (error) {
        console.error("Error processing batch with Gemini API:", error);
        // Return a result with error indicators for the failed batch
        // so the main process can continue or be stopped gracefully.
        return batch.map(p => ({
            vsChildId: String(p['VS Child ID']),
            upselling1: ['API_ERROR'],
            upselling2: ['API_ERROR'],
        }));
    }
}

export const generateRecommendations = async (
    products: ProductData[],
    onProgress: (processed: number, total: number) => void,
    onResultBatch: (batch: RecommendationResult[]) => void,
    signal: AbortSignal
): Promise<void> => {

    const fullCatalogSummary = products.map(p => {
        const parentId = p['VS Parent ID'];
        const title = p['Parent Product Title'];
        return `${parentId}: ${title}`;
    }).filter((value, index, self) => self.indexOf(value) === index)
    .join('\n');

    const batches: ProductData[][] = [];
    for (let i = 0; i < products.length; i += BATCH_SIZE) {
        batches.push(products.slice(i, i + BATCH_SIZE));
    }

    let processedCount = 0;
    
    // Create a pool of workers that will process batches concurrently
    const workerPromises = new Array(CONCURRENT_BATCHES).fill(Promise.resolve());

    let batchIndex = 0;

    async function processNextBatch(workerId: number) {
      while(batchIndex < batches.length) {
        if (signal.aborted) {
            console.log(`Worker ${workerId} stopping due to signal.`);
            return;
        }

        const currentBatchIndex = batchIndex++;
        const batch = batches[currentBatchIndex];
        if (!batch) continue;

        const results = await processBatch(batch, fullCatalogSummary);
        
        if (signal.aborted) {
            console.log(`Worker ${workerId} stopping after batch due to signal.`);
            return;
        }

        // Use a critical section for state updates to prevent race conditions
        processedCount += batch.length;
        onResultBatch(results);
        onProgress(processedCount, products.length);
      }
    }

    await Promise.all(
        workerPromises.map((_, i) => processNextBatch(i))
    );

    // Ensure the progress bar completes if not aborted
    if (!signal.aborted) {
        onProgress(products.length, products.length);
    }
};