/** Money values arrive from the API as decimal strings (e.g. "180.00") to avoid float rounding. */
export type Money = string;

export type ProductStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
export type ProductSort = 'newest' | 'price_asc' | 'price_desc' | 'name';

export interface Category {
  id: number;
  name: string;
  name_ar?: string | null;
  slug: string;
  description: string | null;
  description_ar?: string | null;
  image_url?: string | null;
  /** image_url, or a product photo from the category (public listing). */
  cover_image_url?: string | null;
}

export interface ProductImage {
  id: number;
  image_url: string;
  alt_text: string | null;
  colour: string | null;
  sort_order: number;
}

export interface ColourOption {
  name: string;
  hex: string | null;
}

export interface ProductCard {
  id: number;
  name: string;
  name_ar?: string | null;
  slug: string;
  price: Money;
  base_price: Money;
  sale_price: Money | null;
  category_slug: string | null;
  image_url: string | null;
  image_alt: string | null;
  hover_image_url: string | null;
  colours: ColourOption[];
  in_stock: boolean;
  total_available: number;
  is_new_arrival: boolean;
}

export interface PublicVariant {
  id: number;
  sku: string;
  colour: string;
  colour_hex: string | null;
  size: string;
  available_quantity: number;
}

export interface SizeGuideContent {
  unit?: string;
  columns?: string[];
  rows?: string[][];
}

export interface SizeGuide {
  id: number;
  name: string;
  content: SizeGuideContent;
}

export interface ProductDetail extends ProductCard {
  description: string | null;
  description_ar?: string | null;
  category_name: string | null;
  category_name_ar?: string | null;
  meta_title: string | null;
  meta_description: string | null;
  images: ProductImage[];
  variants: PublicVariant[];
  size_guide: SizeGuide | null;
}

export interface ProductPage {
  items: ProductCard[];
  total: number;
  page: number;
  page_size: number;
}

export interface Collection {
  id: number;
  name: string;
  name_ar?: string | null;
  slug: string;
  description: string | null;
  description_ar?: string | null;
  image_url: string | null;
  /** image_url, or a photo of one of its products. */
  cover_image_url: string | null;
  product_count: number;
}

export interface ProductQuery {
  category?: string;
  collection?: string;
  q?: string;
  featured?: boolean;
  new?: boolean;
  sort?: ProductSort;
  size?: string[];
  colour?: string[];
  min_price?: number;
  max_price?: number;
  in_stock?: boolean;
  exclude?: number;
  page?: number;
  page_size?: number;
}

export interface ProductFacets {
  sizes: string[];
  colours: ColourOption[];
  min_price: Money | null;
  max_price: Money | null;
}

/** Whole-number percentage saved by a sale price (e.g. 200 → 160 is 20). Null when not on sale. */
export function percentOff(base: Money | number, sale: Money | number | null | undefined): number | null {
  const b = Number(base);
  const s = Number(sale);
  if (sale === null || sale === undefined || sale === '' || !(b > 0) || !(s < b)) return null;
  return Math.max(1, Math.round((1 - s / b) * 100));
}
