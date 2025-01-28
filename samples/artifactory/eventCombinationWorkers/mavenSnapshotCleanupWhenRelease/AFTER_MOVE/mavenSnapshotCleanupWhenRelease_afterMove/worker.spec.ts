import { PlatformContext, AfterMoveRequest, PlatformClients, PlatformHttpClient } from 'jfrog-workers';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import runWorker from './worker';

describe("mavenSnapshotCleanupWhenRelease_afterMove", () => {
    let context: DeepMocked<PlatformContext>;
    let request: DeepMocked<AfterMoveRequest>;

    beforeEach(() => {
        context = createMock<PlatformContext>({
            clients: createMock<PlatformClients>({
                platformHttp: createMock<PlatformHttpClient>({
                    get: jest.fn().mockResolvedValue({ status: 200 })
                })
            })
        });
        request = createMock<AfterMoveRequest>();
    })

    it('should run', async () => {
        await expect(runWorker(context, request)).resolves.toEqual(expect.objectContaining({
            message: 'proceed'
        }))
    })
});