import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock 'use client' directive — not meaningful in node/jsdom test env
vi.mock('../lib/hooks/use-packages', async () => {
  // Re-import with mocked dependencies
  return await import('../lib/hooks/use-packages');
});

// Capture the mutationFn / queryFn that hooks register, without a real React context
const capturedMutations: Record<string, { mutationFn: Function; onSuccess?: Function }> = {};
const capturedQueries: Record<string, { queryFn: Function; queryKey: unknown[] }> = {};
const mockInvalidateQueries = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useMutation: vi.fn((config: { mutationFn: Function; onSuccess?: Function }) => {
    // Return the config so callers (our hooks) get back what they expect
    return config;
  }),
  useQuery: vi.fn((config: { queryFn: Function; queryKey: unknown[] }) => config),
  useQueryClient: vi.fn(() => ({ invalidateQueries: mockInvalidateQueries })),
}));

const mockApiFetch = vi.fn();
vi.mock('../lib/api-client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  apiUpload: vi.fn(),
  ApiError: class ApiError extends Error {
    code: string; status: number;
    constructor(code: string, message: string, status: number) {
      super(message); this.code = code; this.status = status;
    }
  },
}));

// Import after mocks are set up
import {
  useResearchPackage,
  useExportPackage,
  useRegenerateDraft,
  useRegenerateVisual,
} from '../lib/hooks/use-packages';

describe('useResearchPackage', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('calls POST /content-packages/:id/research with the package id', async () => {
    const packageId = 'pkg-abc-123';
    mockApiFetch.mockResolvedValueOnce({ package_id: packageId, status: 'pending', job_id: 'job-1' });

    const hook = useResearchPackage();
    await hook.mutationFn(packageId);

    expect(mockApiFetch).toHaveBeenCalledWith(
      `/content-packages/${packageId}/research`,
      { method: 'POST' },
    );
  });

  it('invalidates the package query key on success', async () => {
    const packageId = 'pkg-abc-123';
    const responseData = { package_id: packageId, status: 'pending', job_id: 'job-1' };

    const hook = useResearchPackage();
    await hook.onSuccess?.(responseData, packageId, undefined);

    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['packages', packageId] });
  });

  it('returns the API response shape', async () => {
    const packageId = 'pkg-xyz';
    const expected = { package_id: packageId, status: 'pending', job_id: 'job-42' };
    mockApiFetch.mockResolvedValueOnce(expected);

    const hook = useResearchPackage();
    const result = await hook.mutationFn(packageId);

    expect(result).toEqual(expected);
  });
});

describe('useExportPackage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('calls POST /content-packages/:id/export', async () => {
    const packageId = 'pkg-export-1';
    mockApiFetch.mockResolvedValueOnce({ package_id: packageId, status: 'exporting', job_id: 'job-2' });

    const hook = useExportPackage();
    await hook.mutationFn(packageId);

    expect(mockApiFetch).toHaveBeenCalledWith(
      `/content-packages/${packageId}/export`,
      { method: 'POST' },
    );
  });

  it('invalidates the package query key on success', async () => {
    const packageId = 'pkg-export-1';
    const responseData = { package_id: packageId, status: 'exporting', job_id: 'job-2' };

    const hook = useExportPackage();
    await hook.onSuccess?.(responseData, packageId, undefined);

    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['packages', packageId] });
  });
});

describe('useRegenerateDraft', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('calls POST /drafts/:id/regenerate with the instruction in the body', async () => {
    const draftId = 'draft-1';
    const instruction = 'make it shorter';
    mockApiFetch.mockResolvedValueOnce({ draft_id: draftId, status: 'regenerating', job_id: 'j' });

    const hook = useRegenerateDraft();
    await hook.mutationFn({ draftId, instruction });

    expect(mockApiFetch).toHaveBeenCalledWith(
      `/drafts/${draftId}/regenerate`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ instruction }),
      }),
    );
  });

  it('invalidates all packages queries on success', async () => {
    const hook = useRegenerateDraft();
    await hook.onSuccess?.({ draft_id: 'd', status: 'regenerating', job_id: 'j' }, { draftId: 'd', instruction: '' }, undefined);
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['packages'] });
  });
});

describe('useRegenerateVisual', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('calls POST /visuals/:id/regenerate with optional body fields', async () => {
    const visualId = 'vis-1';
    mockApiFetch.mockResolvedValueOnce({ visual_id: visualId, status: 'regenerating', job_id: 'j' });

    const hook = useRegenerateVisual();
    await hook.mutationFn({ visualId, body: { instruction: 'brighter colors' } });

    expect(mockApiFetch).toHaveBeenCalledWith(
      `/visuals/${visualId}/regenerate`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ instruction: 'brighter colors' }),
      }),
    );
  });
});
