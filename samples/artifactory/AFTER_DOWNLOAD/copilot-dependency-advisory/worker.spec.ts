import { PlatformContext, PlatformClients, PlatformHttpClient, PlatformSecrets, PlatformProperties } from 'jfrog-workers';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { AfterDownloadRequest } from './types';
import runWorker from './worker';

const OPTED_IN_PROPERTIES = {
    status: 200,
    data: {
        properties: {
            'copilot.advisor.repo': ['myorg/dependency-catalog'],
            'copilot.advisor.repoBaseBranch': ['main']
        }
    }
};

function buildRequest(): DeepMocked<AfterDownloadRequest> {
    return createMock<AfterDownloadRequest>({
        metadata: {
            repoPath: {
                key: 'npm-local',
                path: '@acme/left-pad-fork/1.0.0/left-pad-fork-1.0.0.tgz',
                id: 'npm-local:@acme/left-pad-fork/1.0.0/left-pad-fork-1.0.0.tgz'
            }
        } as any,
        userContext: { id: 'ci-payments-service', isToken: true } as any
    });
}

function buildContext(): DeepMocked<PlatformContext> {
    return createMock<PlatformContext>({
        clients: createMock<PlatformClients>({
            platformHttp: createMock<PlatformHttpClient>({
                get: jest.fn().mockResolvedValue(OPTED_IN_PROPERTIES),
                put: jest.fn().mockResolvedValue({ status: 204, data: {} })
            }),
            axios: createMock<any>({
                post: jest.fn().mockResolvedValue({ status: 200, data: {} })
            })
        }),
        secrets: createMock<PlatformSecrets>({
            get: jest.fn().mockReturnValue(undefined)
        }),
        properties: createMock<PlatformProperties>({
            get: jest.fn().mockReturnValue(undefined)
        })
    });
}

describe('copilot-dependency-advisory tests', () => {
    let context: DeepMocked<PlatformContext>;
    let request: DeepMocked<AfterDownloadRequest>;

    beforeEach(() => {
        context = buildContext();
        request = buildRequest();
    });

    it('skips when repoPath metadata is missing', async () => {
        request.metadata = undefined as any;

        await expect(runWorker(context, request)).resolves.toEqual({
            message: 'Missing repoPath metadata on the download request.'
        });
        expect(context.clients.platformHttp.get).not.toHaveBeenCalled();
    });

    it('is a NOP when the artifact is not tagged with the advisor properties', async () => {
        context.clients.platformHttp.get = jest.fn().mockRejectedValue({ status: 404, message: 'Not Found' });

        await expect(runWorker(context, request)).resolves.toEqual({
            message: "Artifact is not opted in (missing 'copilot.advisor.repo' and/or 'copilot.advisor.repoBaseBranch' property); skipped Copilot advisory."
        });
        expect(context.clients.axios.post).not.toHaveBeenCalled();
        expect(context.clients.platformHttp.put).not.toHaveBeenCalled();
    });

    it('is a NOP when only one of the two advisor properties is set', async () => {
        context.clients.platformHttp.get = jest.fn().mockResolvedValue({
            status: 200,
            data: { properties: { 'copilot.advisor.repo': ['myorg/dependency-catalog'] } }
        });

        await expect(runWorker(context, request)).resolves.toEqual({
            message: "Artifact is not opted in (missing 'copilot.advisor.repo' and/or 'copilot.advisor.repoBaseBranch' property); skipped Copilot advisory."
        });
        expect(context.clients.axios.post).not.toHaveBeenCalled();
    });

    it('is a NOP when the artifact was already notified', async () => {
        context.clients.platformHttp.get = jest.fn().mockResolvedValue({
            status: 200,
            data: {
                properties: {
                    'copilot.advisor.repo': ['myorg/dependency-catalog'],
                    'copilot.advisor.repoBaseBranch': ['main'],
                    'copilot.advisor.notified': ['true']
                }
            }
        });

        await expect(runWorker(context, request)).resolves.toEqual({
            message: 'Artifact already notified before; skipped Copilot advisory.'
        });
        expect(context.clients.axios.post).not.toHaveBeenCalled();
    });

    it('reports an error when the artifact properties lookup fails for a reason other than 404', async () => {
        context.clients.platformHttp.get = jest.fn().mockRejectedValue({ status: 500, message: 'Artifactory unreachable' });

        await expect(runWorker(context, request)).resolves.toEqual({
            message: 'Failed to read artifact properties: Artifactory unreachable'
        });
    });

    it('skips when GitHubToken secret is not configured', async () => {
        context.secrets.get = jest.fn().mockReturnValue(undefined);

        await expect(runWorker(context, request)).resolves.toEqual({
            message: 'New dependency detected but GitHubToken secret is not configured; skipped Copilot advisory.'
        });
        expect(context.clients.platformHttp.put).not.toHaveBeenCalled();
    });

    it('opens a GitHub issue, marks the artifact notified, and assigns it to Copilot for a new, opted-in artifact', async () => {
        context.secrets.get = jest.fn().mockReturnValue('ghp_test-token');
        context.clients.axios.post = jest.fn().mockImplementation((url: string) => {
            if (url === 'https://api.github.com/repos/myorg/dependency-catalog/issues') {
                return Promise.resolve({ status: 201, data: { number: 42 } });
            }
            return Promise.resolve({ status: 201, data: {} });
        });

        await expect(runWorker(context, request)).resolves.toEqual({
            message: 'New dependency detected: opened issue #42 in myorg/dependency-catalog and assigned it to Copilot.'
        });

        expect(context.clients.platformHttp.get).toHaveBeenCalledWith(
            '/artifactory/api/storage/npm-local/@acme/left-pad-fork/1.0.0/left-pad-fork-1.0.0.tgz?properties=copilot.advisor.repo,copilot.advisor.repoBaseBranch,copilot.advisor.notified'
        );
        expect(context.clients.platformHttp.put).toHaveBeenCalledWith(
            '/artifactory/api/storage/npm-local/@acme/left-pad-fork/1.0.0/left-pad-fork-1.0.0.tgz?properties=copilot.advisor.notified=true'
        );
        expect(context.clients.axios.post).toHaveBeenCalledWith(
            'https://api.github.com/repos/myorg/dependency-catalog/issues',
            expect.objectContaining({ title: expect.stringContaining('left-pad-fork-1.0.0.tgz') }),
            expect.objectContaining({
                headers: expect.objectContaining({ Authorization: 'Bearer ghp_test-token', 'X-GitHub-Api-Version': '2022-11-28' })
            })
        );
        expect(context.clients.axios.post).toHaveBeenCalledWith(
            'https://api.github.com/repos/myorg/dependency-catalog/issues/42/assignees',
            expect.objectContaining({
                assignees: ['copilot-swe-agent[bot]'],
                agent_assignment: expect.objectContaining({ target_repo: 'myorg/dependency-catalog', base_branch: 'main' })
            }),
            expect.anything()
        );
    });

    it('uses the configured githubApiUrl/githubApiVersion properties for the GitHub calls', async () => {
        context.secrets.get = jest.fn().mockReturnValue('ghp_test-token');
        context.properties.get = jest.fn().mockImplementation((key: string) => {
            if (key === 'githubApiUrl') return 'https://ghe.internal/api/v3';
            if (key === 'githubApiVersion') return '2023-07-01';
            return undefined;
        });
        context.clients.axios.post = jest.fn().mockImplementation((url: string) => {
            if (url === 'https://ghe.internal/api/v3/repos/myorg/dependency-catalog/issues') {
                return Promise.resolve({ status: 201, data: { number: 1 } });
            }
            return Promise.resolve({ status: 201, data: {} });
        });

        await runWorker(context, request);

        expect(context.clients.axios.post).toHaveBeenCalledWith(
            'https://ghe.internal/api/v3/repos/myorg/dependency-catalog/issues',
            expect.anything(),
            expect.objectContaining({ headers: expect.objectContaining({ 'X-GitHub-Api-Version': '2023-07-01' }) })
        );
    });

    it('does not mark the artifact as notified when issue creation fails', async () => {
        context.secrets.get = jest.fn().mockReturnValue('ghp_test-token');
        context.clients.axios.post = jest.fn().mockRejectedValue(new Error('GitHub unreachable'));

        await expect(runWorker(context, request)).resolves.toEqual({
            message: 'New dependency detected but failed to open a GitHub issue: GitHub unreachable'
        });
        expect(context.clients.platformHttp.put).not.toHaveBeenCalled();
    });

    it('still assigns to Copilot even when marking the artifact as notified fails', async () => {
        context.secrets.get = jest.fn().mockReturnValue('ghp_test-token');
        context.clients.platformHttp.put = jest.fn().mockRejectedValue(new Error('Artifactory unreachable'));
        context.clients.axios.post = jest.fn().mockImplementation((url: string) => {
            if (url.endsWith('/issues')) {
                return Promise.resolve({ status: 201, data: { number: 7 } });
            }
            return Promise.resolve({ status: 201, data: {} });
        });

        await expect(runWorker(context, request)).resolves.toEqual({
            message: 'New dependency detected: opened issue #7 in myorg/dependency-catalog and assigned it to Copilot.'
        });
    });

    it('still reports success on the issue when Copilot assignment fails after notifying', async () => {
        context.secrets.get = jest.fn().mockReturnValue('ghp_test-token');
        context.clients.axios.post = jest.fn().mockImplementation((url: string) => {
            if (url.endsWith('/issues')) {
                return Promise.resolve({ status: 201, data: { number: 7 } });
            }
            return Promise.reject(new Error('Copilot coding agent not enabled for this repo'));
        });

        await expect(runWorker(context, request)).resolves.toEqual({
            message: 'New dependency detected: opened issue #7 in myorg/dependency-catalog, but failed to assign it to Copilot.'
        });
        expect(context.clients.platformHttp.put).toHaveBeenCalled();
    });
});
