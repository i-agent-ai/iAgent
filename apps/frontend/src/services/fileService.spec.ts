import { fileService } from './fileService';

describe('fileService', () => {
  beforeEach(() => {
    // @ts-ignore
    global.fetch = jest.fn();
  });

  it('serializes listFiles query params (page mode)', async () => {
    // @ts-ignore
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ items: [], page: 1, total: 0 }) });
    await fileService.listFiles({ q: 'doc', mimetype: 'image/png', sortBy: 'size', sortOrder: 'asc', page: 1, limit: 10 });
    expect((global.fetch as any).mock.calls[0][0]).toContain('q=doc');
    expect((global.fetch as any).mock.calls[0][0]).toContain('mimetype=image%2Fpng');
    expect((global.fetch as any).mock.calls[0][0]).toContain('sortBy=size');
    expect((global.fetch as any).mock.calls[0][0]).toContain('sortOrder=asc');
    expect((global.fetch as any).mock.calls[0][0]).toContain('page=1');
    expect((global.fetch as any).mock.calls[0][0]).toContain('limit=10');
  });

  it('uses cursor when provided', async () => {
    // @ts-ignore
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ items: [], nextCursor: undefined }) });
    await fileService.listFiles({ cursor: 'abc', limit: 20 });
    const url = (global.fetch as any).mock.calls[0][0] as string;
    expect(url).toContain('cursor=abc');
    expect(url).toContain('limit=20');
    expect(url).not.toContain('page=');
  });

  it('PATCH renameFile and PUT replaceFile', async () => {
    // @ts-ignore
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    await fileService.renameFile('id1', { filename: 'new' });
    expect((global.fetch as any).mock.calls[0][0]).toContain('/id1/rename');
    expect((global.fetch as any).mock.calls[0][1].method).toBe('PATCH');

    await fileService.replaceFile('id2', new File(["x"], 'a.txt', { type: 'text/plain'}));
    expect((global.fetch as any).mock.calls[1][0]).toContain('/id2');
    expect((global.fetch as any).mock.calls[1][1].method).toBe('PUT');
  });
});


