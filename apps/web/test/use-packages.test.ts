import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMutation } from '@tanstack/react-query';

const mockInvalidateQueries = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useMutation: vi.fn((config: unknown) => config),
  useQuery: vi.fn((config: unknown) => config),
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

import {
  useResearchPackage,
  useExportPackage,
  useRegenerateDraft,
  useRegenerateVisual,
} from '../lib/hooks/use-packages';

// Helper: extract the mutationFn/onSuccess that a hook registers with useMutation.
// The mock captures the config object passed to useMutation; we pull it from call args.
function getMutationConfig(callIndex = 0): {
  mutationFn: (...args: unknown[]) => Promise<unknown>;
  onSuccess?: (data: unknown, vars: unknown, ctx: unknown) => void;
} {
  const mockedUseMutation = vi.mocked(useMutation);
  return mockedUseMutation.mock.calls[callIndex]?.[0] as ReturnType<typeof getMutationConfig>;
}

describe('useResearchPackage', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('calls POST /content-packages/:id/research with the package id', async () => {
    const packageId = 'pkg-abc-123';
    mockApiFetch.mockResolvedValueOnce({ package_id: packageId, status: 'pending', job_id: 'job-1' });

    useResearchPackage();
    const { mutationFn } = getMutationConfig();
    await mutationFn(packageId);

    expect(mockApiFetch).toHaveBeenCalledWith(
      `/content-packages/${packageId}/research`,
      { method: 'POST' },
    );
  });

  it('invalidates the package query key on success', async () => {
    const packageId = 'pkg-abc-123';
    const responseData = { package_id: packageId, status: 'pending', job_id: 'job-1' };

    useResearchPackage();
    const { onSuccess } = getMutationConfig();
    await onSuccess?.(responseData, packageId, undefined);

    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['packages', packageId] });
  });

  it('returns the API response shape', async () => {
    const packageId = 'pkg-xyz';
    const expected = { package_id: packageId, status: 'pending', job_id: 'job-42' };
    mockApiFetch.mockResolvedValueOnce(expected);

    useResearchPackage();
    const { mutationFn } = getMutationConfig();
    const result = await mutationFn(packageId);

    expect(result).toEqual(expected);
  });
});

describe('useExportPackage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('calls POST /content-packages/:id/export', async () => {
    const packageId = 'pkg-export-1';
    mockApiFetch.mockResolvedValueOnce({ package_id: packageId, status: 'exporting', job_id: 'job-2' });

    useExportPackage();
    const { mutationFn } = getMutationConfig();
    await mutationFn(packageId);

    expect(mockApiFetch).toHaveBeenCalledWith(
      `/content-packages/${packageId}/export`,
      { method: 'POST' },
    );
  });

  it('invalidates the package query key on success', async () => {
    const packageId = 'pkg-export-1';
    const responseData = { package_id: packageId, status: 'exporting', job_id: 'job-2' };

    useExportPackage();
    const { onSuccess } = getMutationConfig();
    await onSuccess?.(responseData, packageId, undefined);

    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['packages', packageId] });
  });
});

describe('useRegenerateDraft', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('calls POST /drafts/:id/regenerate with the instruction in the body', async () => {
    const draftId = 'draft-1';
    const instruction = 'make it shorter';
    mockApiFetch.mockResolvedValueOnce({ draft_id: draftId, status: 'regenerating', job_id: 'j' });

    useRegenerateDraft();
    const { mutationFn } = getMutationConfig();
    await mutationFn({ draftId, instruction });

    expect(mockApiFetch).toHaveBeenCalledWith(
      `/drafts/${draftId}/regenerate`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ instruction }),
      }),
    );
  });

  it('invalidates all packages queries on success', async () => {
    useRegenerateDraft();
    const { onSuccess } = getMutationConfig();
    await onSuccess?.({ draft_id: 'd', status: 'regenerating', job_id: 'j' }, { draftId: 'd', instruction: '' }, undefined);
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['packages'] });
  });
});

describe('useRegenerateVisual', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('calls POST /visuals/:id/regenerate with optional body fields', async () => {
    const visualId = 'vis-1';
    mockApiFetch.mockResolvedValueOnce({ visual_id: visualId, status: 'regenerating', job_id: 'j' });

    useRegenerateVisual();
    const { mutationFn } = getMutationConfig();
    await mutationFn({ visualId, body: { instruction: 'brighter colors' } });

    expect(mockApiFetch).toHaveBeenCalledWith(
      `/visuals/${visualId}/regenerate`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ instruction: 'brighter colors' }),
      }),
    );
  });
});
