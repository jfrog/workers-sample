import { PlatformContext, PlatformClients } from 'jfrog-workers';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { AfterDownloadRequest, RepoType } from './types';
import runWorker from './worker';

describe('nanoclaw-agent-vault-audit-log tests', () => {
    let context: DeepMocked<PlatformContext>;
    let request: DeepMocked<AfterDownloadRequest>;
    let postMock: jest.Mock;
    let getPropertyMock: jest.Mock;

    beforeEach(() => {
        postMock = jest.fn().mockResolvedValue({ status: 200 });
        getPropertyMock = jest.fn((key: string) =>
            ({ auditSinkUrl: 'https://audit-sink.example.com', nanoclawIdentities: '' })[key],
        );
        context = createMock<PlatformContext>({
            clients: createMock<PlatformClients>({
                axios: { post: postMock } as any,
            }),
            secrets: { get: jest.fn().mockReturnValue('test-token') } as any,
            properties: { get: getPropertyMock } as any,
        });
        request = createMock<AfterDownloadRequest>({
            metadata: {
                repoPath: {
                    key: 'npm-remote',
                    path: 'left-pad/-/left-pad-1.3.0.tgz',
                    id: 'npm-remote:left-pad/-/left-pad-1.3.0.tgz',
                    isRoot: false,
                    isFolder: false,
                },
                repoType: RepoType.REPO_TYPE_REMOTE,
            } as any,
            userContext: {
                id: 'nanoclaw-agent-group-artifactory-token',
                isToken: true,
                realm: '',
            },
        });
    });

    it('audits the download and reports success', async () => {
        await expect(runWorker(context, request)).resolves.toEqual(
            expect.objectContaining({ message: 'NanoClaw registry download successfully audited' }),
        );
        expect(getPropertyMock).toHaveBeenCalledWith('auditSinkUrl');
        expect(postMock).toHaveBeenCalledWith(
            'https://audit-sink.example.com',
            expect.objectContaining({
                registryIdentity: 'nanoclaw-agent-group-artifactory-token',
                isToken: true,
                repoKey: 'npm-remote',
                repoType: 'REPO_TYPE_REMOTE',
            }),
            expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }),
        );
    });

    it('skips auditing when the auditSinkUrl property is not set', async () => {
        getPropertyMock.mockImplementation((key: string) => ({ nanoclawIdentities: '' })[key]);
        await expect(runWorker(context, request)).resolves.toEqual(
            expect.objectContaining({
                message: "Worker property 'auditSinkUrl' is not set; skipping audit",
            }),
        );
        expect(postMock).not.toHaveBeenCalled();
    });

    it('audits when the download identity is in the configured nanoclawIdentities allowlist', async () => {
        getPropertyMock.mockImplementation((key: string) =>
            ({
                auditSinkUrl: 'https://audit-sink.example.com',
                nanoclawIdentities: 'some-other-token, nanoclaw-agent-group-artifactory-token',
            })[key],
        );
        await expect(runWorker(context, request)).resolves.toEqual(
            expect.objectContaining({ message: 'NanoClaw registry download successfully audited' }),
        );
        expect(postMock).toHaveBeenCalled();
    });

    it('skips auditing when the download identity is not in the configured nanoclawIdentities allowlist', async () => {
        getPropertyMock.mockImplementation((key: string) =>
            ({ auditSinkUrl: 'https://audit-sink.example.com', nanoclawIdentities: 'some-other-token' })[key],
        );
        await expect(runWorker(context, request)).resolves.toEqual(
            expect.objectContaining({
                message:
                    "Download identity 'nanoclaw-agent-group-artifactory-token' is not a configured NanoClaw identity; skipping audit",
            }),
        );
        expect(postMock).not.toHaveBeenCalled();
    });

    it('reports failure when the audit sink does not return 200', async () => {
        postMock.mockResolvedValueOnce({ status: 500 });
        await expect(runWorker(context, request)).resolves.toEqual(
            expect.objectContaining({ message: 'Failed to audit NanoClaw download' }),
        );
    });

    it('reports failure when the audit sink call throws', async () => {
        postMock.mockRejectedValueOnce(new Error('network error'));
        await expect(runWorker(context, request)).resolves.toEqual(
            expect.objectContaining({ message: 'Failed to audit NanoClaw download' }),
        );
    });
});
