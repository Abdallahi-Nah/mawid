import { estimateCostUsd } from './ai-pricing';

describe('estimateCostUsd', () => {
  it('prices input and output tokens separately', () => {
    // 1M in + 1M out on the big model = 0.59 + 0.79
    expect(estimateCostUsd('llama-3.3-70b-versatile', 1_000_000, 1_000_000)).toBeCloseTo(1.38);
    expect(estimateCostUsd('llama-3.1-8b-instant', 2_000_000, 0)).toBeCloseTo(0.1);
  });
  it('is 0 for a model without a known price', () => {
    expect(estimateCostUsd('some-new-model', 5_000_000, 5_000_000)).toBe(0);
  });
});
