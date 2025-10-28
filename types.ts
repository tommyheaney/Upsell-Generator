
export interface ProductData {
  [key: string]: string | number;
}

export interface RecommendationResult {
  vsChildId: string;
  upselling1: string[]; // Array of VS Parent IDs for "Customers Also Bought"
  upselling2: string[]; // Array of VS Parent IDs for "You May Also Like"
}
