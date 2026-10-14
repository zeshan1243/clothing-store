// Production build. Before deploying, set apiBaseUrl to the deployed API (see DEPLOYMENT.md) and
// brandName to the real brand.
export const environment = {
  production: true,
  apiBaseUrl: 'https://clothing-store-api-ste1.onrender.com/api/v1',
  brandName: 'Brand Name',
  currency: 'QAR',
  // Display only; the API calculates the authoritative delivery fee at checkout.
  // Mirror of FREE_DELIVERY_THRESHOLD on the API (null = no free delivery). Display only.
  freeDeliveryThreshold: null as number | null,
  whatsappNumber: '97400000000',
  // Optional campaign photo for the home hero (AVIF/WebP, < 200KB). null = graphic hero.
  heroImageUrl: null as string | null,
};
