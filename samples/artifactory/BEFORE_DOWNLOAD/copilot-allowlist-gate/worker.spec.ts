import { PlatformContext, PlatformClients, PlatformHttpClient, PlatformSecrets, PlatformProperties } from 'jfrog-workers';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { BeforeDownloadRequest, DownloadStatus } from './types';
import runWorker from './worker';

const ISSUE_URL = 'https://github.com/myorg/dependency-allowlist/issues/7';

function buildRequest(): DeepMocked<BeforeDownloadRequest> {
    return createMock<BeforeDownloadRequest>({
        repoPath: {
            key: 'npm-local',
            path: 'lodash/-/lodash-4.17.21.tgz',
            id: 'npm-local:lodash/-/lodash-4.17.21.tgz',
            isRoot: false,
            isFolder: false
        },
        metadata: undefined
    });
}

function buildContext(properties: Record<string, string> = {}): DeepMocked<PlatformContext> {
    const allProperties: Record<string, string> = { githubRepo: 'myorg/dependency-allowlist', ...properties };
    return createMock<PlatformContext>({
        clients: createMock<PlatformClients>({
            platformHttp: createMock<PlatformHttpClient>({
                get: jest.fn().mockRejectedValue({ status: 404, message: 'Not Found' }),
                put: jest.fn().mockResolvedValue({ status: 204, data: {} })
            }),
            axios: createMock<any>({
                get: jest.fn().mockResolvedValue({ status: 200, data: '[]' }),
                post: jest.fn().mockResolvedValue({ status: 201, data: { number: 7, html_url: ISSUE_URL } })
            })
        }),
        secrets: createMock<PlatformSecrets>({
            get: jest.fn().mockReturnValue('ghp_test')
        }),
        properties: createMock<PlatformProperties>({
            get: jest.fn((key: string) => allProperties[key])
        })
    });
}

function allowlist(context: DeepMocked<PlatformContext>, entries: any) {
    context.clients.axios.get = jest.fn().mockResolvedValue({ status: 200, data: JSON.stringify(entries) });
}

describe('copilot-allowlist-gate tests', () => {
    let context: DeepMocked<PlatformContext>;
    let request: DeepMocked<BeforeDownloadRequest>;

    beforeEach(() => {
        context = buildContext();
        request = buildRequest();
    });

    it('warns without calling GitHub when the worker is not configured', async () => {
        context = buildContext({ githubRepo: '' });

        const result = await runWorker(context, request);

        expect(result.status).toBe(DownloadStatus.DOWNLOAD_WARN);
        expect(context.clients.axios.get).not.toHaveBeenCalled();
    });

    it('reads the allowlist from the configured repo, branch and path', async () => {
        context = buildContext({ githubBranch: 'policies', allowlistPath: 'allowlists/{repoKey}.json' });
        allowlist(context, ['npm-local/lodash/**']);

        await runWorker(context, request);

        expect(context.clients.axios.get).toHaveBeenCalledWith(
            'https://api.github.com/repos/myorg/dependency-allowlist/contents/allowlists/npm-local.json?ref=policies',
            expect.anything()
        );
    });

    it.each([
        ['exact path', 'npm-local/lodash/-/lodash-4.17.21.tgz'],
        ['single-segment *', 'npm-local/lodash/-/lodash-4.17.*.tgz'],
        ['multi-segment **', 'npm-local/lodash/**'],
        ['? wildcard', 'npm-local/lodash/-/lodash-4.17.2?.tgz']
    ])('proceeds when the artifact matches an allowlist entry (%s)', async (_, pattern) => {
        allowlist(context, ['npm-local/other/**', pattern]);

        const result = await runWorker(context, request);

        expect(result.status).toBe(DownloadStatus.DOWNLOAD_PROCEED);
        expect(context.clients.axios.post).not.toHaveBeenCalled();
    });

    it.each([
        ['* does not cross folders', 'npm-local/*.tgz'],
        ['other repo key', 'npm-remote/lodash/**'],
        ['dots are literal', 'npm-local/lodash/-/lodash-4x17x21.tgz']
    ])('blocks when no entry matches (%s)', async (_, pattern) => {
        allowlist(context, [pattern]);

        const result = await runWorker(context, request);

        expect(result.status).toBe(DownloadStatus.DOWNLOAD_STOP);
    });

    it('blocks, opens a review issue, records it on the artifact and assigns it to Copilot', async () => {
        const result = await runWorker(context, request);

        expect(result).toEqual({
            status: DownloadStatus.DOWNLOAD_STOP,
            message: `npm-local/lodash/-/lodash-4.17.21.tgz is not in allowlist myorg/dependency-allowlist/approved-dependencies.json; opened ${ISSUE_URL} and assigned it to Copilot.`
        });
        expect(context.clients.platformHttp.put).toHaveBeenCalledWith(
            `/artifactory/api/storage/npm-local/lodash/-/lodash-4.17.21.tgz?properties=copilot.allowlist.issue=${encodeURIComponent(ISSUE_URL)}`
        );
        expect(context.clients.axios.post).toHaveBeenLastCalledWith(
            'https://api.github.com/repos/myorg/dependency-allowlist/issues/7/assignees',
            { assignees: ['copilot-swe-agent[bot]'], agent_assignment: { target_repo: 'myorg/dependency-allowlist', base_branch: 'main' } },
            expect.anything()
        );
    });

    it('treats a missing allowlist file as empty', async () => {
        context.clients.axios.get = jest.fn().mockRejectedValue({ status: 404, message: 'Not Found' });

        const result = await runWorker(context, request);

        expect(result.status).toBe(DownloadStatus.DOWNLOAD_STOP);
        expect(context.clients.axios.post).toHaveBeenCalled();
    });

    it('points to the existing issue instead of opening a new one', async () => {
        context.clients.platformHttp.get = jest.fn().mockResolvedValue({ status: 200, data: { properties: { 'copilot.allowlist.issue': [ISSUE_URL] } } });

        const result = await runWorker(context, request);

        expect(result.status).toBe(DownloadStatus.DOWNLOAD_STOP);
        expect(result.message).toContain(`review pending in ${ISSUE_URL}`);
        expect(context.clients.axios.post).not.toHaveBeenCalled();
    });

    it('uses the configured issueProperty to dedupe and record the review issue', async () => {
        context = buildContext({ issueProperty: 'security.review.issue' });

        await runWorker(context, request);

        expect(context.clients.platformHttp.get).toHaveBeenCalledWith(
            '/artifactory/api/storage/npm-local/lodash/-/lodash-4.17.21.tgz?properties=security.review.issue'
        );
        expect(context.clients.platformHttp.put).toHaveBeenCalledWith(
            `/artifactory/api/storage/npm-local/lodash/-/lodash-4.17.21.tgz?properties=security.review.issue=${encodeURIComponent(ISSUE_URL)}`
        );
    });

    it('still blocks when the Copilot assignment fails', async () => {
        context.clients.axios.post = jest.fn()
            .mockResolvedValueOnce({ status: 201, data: { number: 7, html_url: ISSUE_URL } })
            .mockRejectedValueOnce({ status: 422, message: 'Copilot not enabled' });

        const result = await runWorker(context, request);

        expect(result.status).toBe(DownloadStatus.DOWNLOAD_STOP);
        expect(result.message).toContain('failed to assign it to Copilot');
    });

    it('applies failMode when the allowlist cannot be read', async () => {
        context.clients.axios.get = jest.fn().mockRejectedValue({ status: 503, message: 'Service Unavailable' });
        expect((await runWorker(context, request)).status).toBe(DownloadStatus.DOWNLOAD_WARN);

        context = buildContext({ failMode: 'STOP' });
        context.clients.axios.get = jest.fn().mockRejectedValue({ status: 503, message: 'Service Unavailable' });
        expect((await runWorker(context, request)).status).toBe(DownloadStatus.DOWNLOAD_STOP);
    });

    it('applies failMode when the allowlist is not an array of strings', async () => {
        allowlist(context, { allow: ['npm-local/**'] });

        const result = await runWorker(context, request);

        expect(result.status).toBe(DownloadStatus.DOWNLOAD_WARN);
        expect(result.message).toContain('allowlist must be a JSON array of strings');
    });
});
