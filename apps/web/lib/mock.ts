// Mock data for the design phase. Texts live in messages/*.json (mock.*).
export const business = {
  slug: 'salon-nour',
  brand: 'indigo',
  rating: '4.9',
  reviewCount: 128,
  hours: '09:00 – 18:00',
  services: [
    { id: 'cut', minutes: 45, price: 300 },
    { id: 'beard', minutes: 20, price: 150 },
    { id: 'color', minutes: 90, price: 800 },
    { id: 'care', minutes: 60, price: 500 },
  ],
  team: [
    { id: 'one', rating: '4.9' },
    { id: 'two', rating: '4.8' },
    { id: 'three', rating: '4.7' },
  ],
  reviews: [
    { id: '1', rating: 5 },
    { id: '2', rating: 5 },
    { id: '3', rating: 4 },
  ],
} as const;

export type MockState = 'loading' | 'empty' | 'error' | undefined;

export function parseState(value: string | string[] | undefined): MockState {
  return value === 'loading' || value === 'empty' || value === 'error' ? value : undefined;
}
