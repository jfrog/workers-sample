import { PlatformContext, BeforeUploadRequest, PlatformClients, PlatformHttpClient, UploadStatus } from 'jfrog-workers';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import runWorker from './worker';

describe("redirect-to-project-repo tests", () => {
    let context: DeepMocked<PlatformContext>;
    let request: DeepMocked<BeforeUploadRequest>;

    beforeEach(() => {
        context = createMock<PlatformContext>({
            clients: createMock<PlatformClients>({
                platformHttp: createMock<PlatformHttpClient>({
                    get: jest.fn().mockResolvedValue({ status: 200 })
                })
            })
        });
        request = createMock<BeforeUploadRequest>({
            metadata: { repoPath: { key: 'my-repo', path: 'artifact.txt' } }
        });
    })

    it('should run', async () => {
        await expect(runWorker(context, request)).resolves.toEqual(expect.objectContaining({
            message: 'Overwritten by worker-service if an error occurs.',
            status: UploadStatus.UPLOAD_PROCEED,
            modifiedRepoPath: { key: 'my-repo', path: 'artifact.txt' }
        }))
    })
});