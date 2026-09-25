import { PlatformContext, PlatformClients, PlatformHttpClient } from 'jfrog-workers';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { BeforeDownloadRequest, DownloadStatus, RepoType } from './types';
import runWorker from './worker';

const NVD_META_NEWER =
    'lastModifiedDate:2024-06-01T12:00:00.000+00:00\nfileSize:1234\n';
const NVD_META_OLDER =
    'lastModifiedDate:2024-01-01T00:00:00.000+00:00\nfileSize:1234\n';

const ARTIFACT_LAST_UPDATED_RECENT = '2024-05-01T00:00:00.000+0000';
const ARTIFACT_LAST_UPDATED_OLD = '2024-01-01T00:00:00.000+0000';

function makeContext(
    axiosData: string,
    storageData: object | null,
    storageStatus = 200,
): DeepMocked<PlatformContext> {
    const platformHttp = createMock<PlatformHttpClient>({
        get: jest.fn().mockResolvedValue({ status: storageStatus, data: storageData }),
        delete: jest.fn().mockResolvedValue({ status: 204 }),
    });
    return createMock<PlatformContext>({
        clients: createMock<PlatformClients>({
            axios: { get: jest.fn().mockResolvedValue({ data: axiosData }) } as any,
            platformHttp,
        }),
    });
}

function makeRequest(overrides: Partial<BeforeDownloadRequest> = {}): BeforeDownloadRequest {
    return {
        repoPath: undefined,
        headers: {},
        userContext: undefined,
        metadata: {
            repoPath: { key: 'nvd-remote', path: 'nvdcve-2.0-modified.json.gz', id: 'nvd-remote:nvdcve-2.0-modified.json.gz', isRoot: false, isFolder: false },
            repoType: RepoType.REPO_TYPE_REMOTE,
            originalRepoPath: undefined,
            name: 'nvdcve-2.0-modified.json.gz',
            headOnly: false,
            checksum: false,
            recursive: false,
            modificationTime: 0,
            directoryRequest: false,
            metadata: false,
            lastModified: 0,
            ifModifiedSince: 0,
            servletContextUrl: '',
            uri: '',
            clientAddress: '',
            zipResourcePath: '',
            zipResourceRequest: false,
            replaceHeadRequestWithGet: false,
        },
        ...overrides,
    };
}

describe('evict-stale-nvd-cache', () => {
    it('proceeds without eviction when no cached artifact exists (404)', async () => {
        const context = createMock<PlatformContext>({
            clients: createMock<PlatformClients>({
                axios: { get: jest.fn().mockResolvedValue({ data: NVD_META_NEWER }) } as any,
                platformHttp: createMock<PlatformHttpClient>({
                    get: jest.fn().mockRejectedValue({ status: 404 }),
                }),
            }),
        });
        const result = await runWorker(context, makeRequest());
        expect(result.status).toBe(DownloadStatus.DOWNLOAD_PROCEED);
        expect(result.message).toMatch(/nothing to evict/i);
    });

    it('evicts cached artifact when NVD feed is newer', async () => {
        const context = makeContext(NVD_META_NEWER, { lastUpdated: ARTIFACT_LAST_UPDATED_OLD });
        const result = await runWorker(context, makeRequest());
        expect(result.status).toBe(DownloadStatus.DOWNLOAD_PROCEED);
        expect(result.message).toMatch(/evicted/i);
        expect(context.clients.platformHttp.delete).toHaveBeenCalled();
    });

    it('keeps cached artifact when it is still fresh', async () => {
        const context = makeContext(NVD_META_OLDER, { lastUpdated: ARTIFACT_LAST_UPDATED_RECENT });
        const result = await runWorker(context, makeRequest());
        expect(result.status).toBe(DownloadStatus.DOWNLOAD_PROCEED);
        expect(result.message).toMatch(/fresh/i);
        expect(context.clients.platformHttp.delete).not.toHaveBeenCalled();
    });

    it('returns DOWNLOAD_WARN when NVD fetch fails', async () => {
        const context = createMock<PlatformContext>({
            clients: createMock<PlatformClients>({
                axios: { get: jest.fn().mockRejectedValue(new Error('network error')) } as any,
                platformHttp: createMock<PlatformHttpClient>(),
            }),
        });
        const result = await runWorker(context, makeRequest());
        expect(result.status).toBe(DownloadStatus.DOWNLOAD_WARN);
    });

    it('skips check for non-remote repos', async () => {
        const context = makeContext(NVD_META_NEWER, { lastUpdated: ARTIFACT_LAST_UPDATED_OLD });
        const request = makeRequest();
        request.metadata!.repoType = RepoType.REPO_TYPE_LOCAL;
        const result = await runWorker(context, request);
        expect(result.status).toBe(DownloadStatus.DOWNLOAD_PROCEED);
        expect(result.message).toMatch(/not a remote repo/i);
        expect(context.clients.platformHttp.delete).not.toHaveBeenCalled();
    });

    it('skips check for folder requests', async () => {
        const context = makeContext(NVD_META_NEWER, { lastUpdated: ARTIFACT_LAST_UPDATED_OLD });
        const request = makeRequest();
        request.metadata!.repoPath!.isFolder = true;
        const result = await runWorker(context, request);
        expect(result.status).toBe(DownloadStatus.DOWNLOAD_PROCEED);
        expect(result.message).toMatch(/not a file download/i);
    });
});
