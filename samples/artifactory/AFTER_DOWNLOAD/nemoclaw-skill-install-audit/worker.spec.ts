import { PlatformContext, PlatformClients, PlatformHttpClient } from 'jfrog-workers';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { AfterDownloadRequest, RepoType } from './types';
import runWorker from './worker';

describe('nemoclaw-skill-install-audit tests', () => {
    let context: DeepMocked<PlatformContext>;
    let request: DeepMocked<AfterDownloadRequest>;
    let postMock: jest.Mock;
    let getPropertyMock: jest.Mock;
    let platformHttpGetMock: jest.Mock;

    beforeEach(() => {
        postMock = jest.fn().mockResolvedValue({ status: 200 });
        getPropertyMock = jest.fn((key: string) => ({ auditSinkUrl: 'https://audit-sink.example.com' })[key]);
        platformHttpGetMock = jest.fn().mockResolvedValue({ data: { status: 'PASSED' } });
        context = createMock<PlatformContext>({
            clients: createMock<PlatformClients>({
                axios: { post: postMock } as any,
                platformHttp: createMock<PlatformHttpClient>({ get: platformHttpGetMock }),
            }),
            secrets: { get: jest.fn().mockReturnValue('test-token') } as any,
            properties: { get: getPropertyMock } as any,
        });
        request = createMock<AfterDownloadRequest>({
            metadata: {
                repoPath: {
                    key: 'nemoclaw-skills-local',
                    path: 'cuopt-routing-skill/1.2.0/cuopt-routing-skill-1.2.0.zip',
                    id: 'nemoclaw-skills-local:cuopt-routing-skill/1.2.0/cuopt-routing-skill-1.2.0.zip',
                    isRoot: false,
                    isFolder: false,
                },
                repoType: RepoType.REPO_TYPE_LOCAL,
            } as any,
            userContext: {
                id: 'nemoclaw-sandbox-my-assistant',
                isToken: true,
                realm: '',
            },
        });
    });

    it('audits the download with parsed slug/version, identity, and Xray status', async () => {
        await expect(runWorker(context, request)).resolves.toEqual(
            expect.objectContaining({ message: 'NemoClaw skill install successfully audited' }),
        );
        expect(platformHttpGetMock).toHaveBeenCalledWith(
            '/artifactory/api/skills/nemoclaw-skills-local/xrayStatus?path=cuopt-routing-skill%2F1.2.0%2Fcuopt-routing-skill-1.2.0.zip',
        );
        expect(postMock).toHaveBeenCalledWith(
            'https://audit-sink.example.com',
            expect.objectContaining({
                source: 'nemoclaw-skill-install',
                slug: 'cuopt-routing-skill',
                version: '1.2.0',
                repoKey: 'nemoclaw-skills-local',
                repoType: 'REPO_TYPE_LOCAL',
                registryIdentity: 'nemoclaw-sandbox-my-assistant',
                isToken: true,
                xrayStatus: 'PASSED',
            }),
            expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }),
        );
    });

    it('skips auditing when the auditSinkUrl property is not set', async () => {
        getPropertyMock.mockImplementation(() => undefined);
        await expect(runWorker(context, request)).resolves.toEqual(
            expect.objectContaining({
                message: "Worker property 'auditSinkUrl' is not set; skipping audit",
            }),
        );
        expect(postMock).not.toHaveBeenCalled();
        expect(platformHttpGetMock).not.toHaveBeenCalled();
    });

    it('records an UNKNOWN Xray status when the lookup fails, but still audits', async () => {
        platformHttpGetMock.mockRejectedValueOnce(new Error('xray unreachable'));
        await expect(runWorker(context, request)).resolves.toEqual(
            expect.objectContaining({ message: 'NemoClaw skill install successfully audited' }),
        );
        expect(postMock).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ xrayStatus: 'UNKNOWN' }),
            expect.anything(),
        );
    });

    it('reports failure when the audit sink does not return 200', async () => {
        postMock.mockResolvedValueOnce({ status: 500 });
        await expect(runWorker(context, request)).resolves.toEqual(
            expect.objectContaining({ message: 'Failed to audit NemoClaw skill install' }),
        );
    });

    it('reports failure when the audit sink call throws', async () => {
        postMock.mockRejectedValueOnce(new Error('network error'));
        await expect(runWorker(context, request)).resolves.toEqual(
            expect.objectContaining({ message: 'Failed to audit NemoClaw skill install' }),
        );
    });
});
